import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DEFAULT_EXCLUDE } from './comments.mjs';
import { environmentWithoutGit } from './release/git.mjs';

const run = promisify(execFile);

// REQ-QUALITY-002
const MANIFESTS = ['pom.xml', 'package.json', 'Cargo.toml'];

// REQ-QUALITY-002
const PLATFORM_PARENTS = ['platform-parent', 'platform-service-parent'];

async function entriesOf(directory) {
  try {
    return await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

// REQ-QUALITY-002
async function tracked(root) {
  try {
    const { stdout } = await run('git', ['-C', root, 'ls-files', '-z', ...MANIFESTS.map((name) => `*${name}`)],
      { env: environmentWithoutGit() });
    return stdout.split('\0').filter((line) => line.length > 0);
  } catch {
    return null;
  }
}

// REQ-QUALITY-002
async function walked(root, excludes) {
  const found = [];
  const walk = async (relative) => {
    for (const entry of await entriesOf(path.join(root, relative))) {
      const next = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (excludes.some((pattern) => `/${next}/`.includes(pattern))) continue;
      if (entry.isDirectory()) {
        await walk(next);
        continue;
      }
      if (MANIFESTS.includes(entry.name)) found.push(next);
    }
  };
  await walk('');
  return found;
}

// REQ-QUALITY-002
export async function manifests(root, { exclude = [] } = {}) {
  const excludes = [...DEFAULT_EXCLUDE, ...exclude];
  const found = await tracked(root) ?? await walked(root, excludes);
  return found
    .filter((file) => MANIFESTS.includes(path.posix.basename(file)))
    .filter((file) => !excludes.some((pattern) => `/${file}`.includes(pattern)))
    .sort();
}

// REQ-QUALITY-002
async function compilesJava(root, file) {
  const directory = path.posix.dirname(file);
  const sources = path.join(root, directory === '.' ? '' : directory, 'src/main/java');
  return (await entriesOf(sources)).length > 0;
}

// REQ-QUALITY-002
function javaProblem(content) {
  if (!/<artifactId>maven-compiler-plugin<\/artifactId>/.test(content)
    && !PLATFORM_PARENTS.some((parent) => new RegExp(`<artifactId>${parent}</artifactId>`).test(content))) {
    return 'модуль не наследует родителя ядра и не объявляет компилятора: разбора Java нет';
  }
  if (PLATFORM_PARENTS.some((parent) => new RegExp(`<artifactId>${parent}</artifactId>`).test(content))) return null;
  if (!/-Werror/.test(content)) return 'компилятор объявлен без -Werror: предупреждение сборку не роняет';
  if (!/-Xplugin:ErrorProne/.test(content)) return 'компилятор объявлен без разбора исходников ErrorProne';
  return null;
}

// REQ-QUALITY-002
function npmProblem(content) {
  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch {
    return 'манифест не разбирается: наличие разбора проверить нельзя';
  }
  if (manifest.scripts === undefined) return null;
  if (manifest.scripts.lint === undefined) {
    return 'пакет объявляет команды, но не объявляет lint: разбора TypeScript и JavaScript нет';
  }
  return null;
}

// REQ-QUALITY-002
function sectionOf(content, header) {
  const start = content.indexOf(header);
  if (start === -1) return '';
  const rest = content.slice(start + header.length);
  const next = rest.search(/^\[/m);
  return next === -1 ? rest : rest.slice(0, next);
}

// REQ-QUALITY-002, REQ-RUST-CLOCK-006
const DELIVERED_CLIPPY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../configs/clippy.toml');

// REQ-QUALITY-002, REQ-RUST-CLOCK-006
function disallowedPaths(content) {
  const section = sectionOf(content, 'disallowed-methods = [');
  return [...section.matchAll(/path\s*=\s*"([^"]+)"/g)].map((found) => found[1]);
}

// REQ-QUALITY-002
async function siblingConfig(root, file, name) {
  let directory = path.posix.dirname(file);
  for (;;) {
    const candidate = directory === '.' ? name : `${directory}/${name}`;
    try {
      return await readFile(path.join(root, candidate), 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    if (directory === '.') return null;
    directory = path.posix.dirname(directory);
  }
}

// REQ-QUALITY-002, REQ-RUST-CLOCK-006
async function clippyProblem(root, file) {
  const delivered = disallowedPaths(await readFile(DELIVERED_CLIPPY, 'utf8'));
  if (delivered.length === 0) return null;
  const own = await siblingConfig(root, file, 'clippy.toml');
  if (own === null) return 'рядом с крейтом нет clippy.toml: запреты ядра не объявлены';
  const declared = new Set(disallowedPaths(own));
  const missing = delivered.filter((entry) => !declared.has(entry));
  if (missing.length > 0) {
    return `clippy.toml не объявляет запретов ядра: ${missing.join(', ')}`;
  }
  return null;
}

// REQ-QUALITY-002
function rustProblem(content) {
  if (!/^\[package\]/m.test(content) && !/^\[workspace\]/m.test(content)) return null;
  if (!/^\[lints\.rust\]/m.test(content)) return 'крейт не объявляет [lints.rust]: разбора Rust нет';
  const section = sectionOf(content, '[lints.rust]');
  if (!/^\s*warnings\s*=\s*"deny"/m.test(section)) {
    return 'крейт объявляет [lints.rust] без warnings = "deny": предупреждение сборку не роняет';
  }
  if (!/^\[lints\.clippy\]/m.test(content)) return 'крейт не объявляет [lints.clippy]: разбор идёт без clippy';
  return null;
}

// REQ-QUALITY-002
const CHECKS = {
  'pom.xml': javaProblem,
  'package.json': npmProblem,
  'Cargo.toml': rustProblem,
};

// REQ-QUALITY-002
export async function findSourceSetsWithoutAnalysis(root, config) {
  if (config.staticAnalysis === 'declared-elsewhere') return new Map();
  const violations = new Map();
  for (const file of await manifests(root, config)) {
    const name = path.posix.basename(file);
    // REQ-QUALITY-002
    if (name === 'pom.xml' && !await compilesJava(root, file)) continue;
    const content = await readFile(path.join(root, file), 'utf8');
    const problem = CHECKS[name](content)
      // REQ-RUST-CLOCK-006
      ?? (name === 'Cargo.toml' && /^\[package\]/m.test(content) ? await clippyProblem(root, file) : null);
    if (problem !== null) violations.set(file, [{ line: 1, text: problem }]);
  }
  return violations;
}
