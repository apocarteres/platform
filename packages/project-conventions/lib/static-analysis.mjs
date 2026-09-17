import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
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
    const problem = CHECKS[name](await readFile(path.join(root, file), 'utf8'));
    if (problem !== null) violations.set(file, [{ line: 1, text: problem }]);
  }
  return violations;
}
