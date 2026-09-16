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

// REQ-QUALITY-007
export const COUNT = 'count';

// REQ-QUALITY-007
export const SET = 'set';

// REQ-QUALITY-007
function identityOf(item) {
  return item.key ?? item.text;
}

// REQ-QUALITY-007
function exceededSet(file, items, allowed) {
  const seeded = new Set(allowed);
  const extra = items.filter((item) => !seeded.has(identityOf(item)));
  return extra.length === 0 ? null : { file, allowed: seeded.size, actual: items.length, items: extra };
}

// REQ-QUALITY-007
function improvedSet(file, items, allowed) {
  const present = new Set(items.map(identityOf));
  const gone = allowed.filter((key) => !present.has(key));
  return gone.length === 0 ? null : { file, allowed: allowed.length, actual: allowed.length - gone.length };
}

// REQ-QUALITY-007
export function compare(violations, baseline, unit = COUNT) {
  const exceeded = [];
  const improved = [];
  for (const [file, items] of violations) {
    if (unit === SET) {
      const entry = exceededSet(file, items, baseline[file] ?? []);
      if (entry !== null) exceeded.push(entry);
      continue;
    }
    const allowed = baseline[file] ?? 0;
    if (items.length > allowed) exceeded.push({ file, allowed, actual: items.length, items });
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    if (unit === SET) {
      const entry = improvedSet(file, violations.get(file) ?? [], allowed);
      if (entry !== null) improved.push(entry);
      continue;
    }
    const actual = violations.get(file)?.length ?? 0;
    if (actual < allowed) improved.push({ file, allowed, actual });
  }
  return { exceeded, improved };
}

// REQ-QUALITY-007
export function counts(violations, unit = COUNT) {
  return Object.fromEntries([...violations].map(([file, items]) => [
    file,
    unit === SET ? [...new Set(items.map(identityOf))].sort() : items.length,
  ]));
}

// REQ-QUALITY-007
export function sizeOf(entry) {
  return Array.isArray(entry) ? entry.length : entry ?? 0;
}

// REQ-QUALITY-007
export function grewOver(now, before) {
  if (!Array.isArray(now)) return now > sizeOf(before);
  const seeded = new Set(Array.isArray(before) ? before : []);
  return now.filter((key) => !seeded.has(key));
}
