import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const BASELINE_FILE = '.conventions/baseline.json';
export const LEGACY_BASELINE_FILE = '.conventions/comments-baseline.json';

export async function baselineExists(root) {
  try {
    await access(path.join(root, BASELINE_FILE));
    return true;
  } catch {
    return false;
  }
}

export async function readBaseline(root) {
  try {
    const parsed = JSON.parse(await readFile(path.join(root, BASELINE_FILE), 'utf8'));
    return parsed.rules ?? {};
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  try {
    const legacy = JSON.parse(await readFile(path.join(root, LEGACY_BASELINE_FILE), 'utf8'));
    return { comments: legacy.files ?? {} };
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

export async function writeBaseline(root, rules) {
  const target = path.join(root, BASELINE_FILE);
  await mkdir(path.dirname(target), { recursive: true });
  const ordered = Object.fromEntries(Object.entries(rules).sort(([left], [right]) => left.localeCompare(right))
    .map(([rule, files]) => [rule, Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)))]));
  await writeFile(target, `${JSON.stringify({ version: 2, rules: ordered }, null, 2)}\n`);
}

export function compare(violations, baseline) {
  const exceeded = [];
  const improved = [];
  for (const [file, items] of violations) {
    const allowed = baseline[file] ?? 0;
    if (items.length > allowed) exceeded.push({ file, allowed, actual: items.length, items });
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const actual = violations.get(file)?.length ?? 0;
    if (actual < allowed) improved.push({ file, allowed, actual });
  }
  return { exceeded, improved };
}

export function counts(violations) {
  return Object.fromEntries([...violations].map(([file, items]) => [file, items.length]));
}
