import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const BASELINE_FILE = '.conventions/comments-baseline.json';

export async function readBaseline(root) {
  try {
    const content = await readFile(path.join(root, BASELINE_FILE), 'utf8');
    const parsed = JSON.parse(content);
    return parsed.files ?? {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

export async function baselineExists(root) {
  try {
    await access(path.join(root, BASELINE_FILE));
    return true;
  } catch {
    return false;
  }
}

export async function writeBaseline(root, files) {
  const target = path.join(root, BASELINE_FILE);
  await mkdir(path.dirname(target), { recursive: true });
  const ordered = Object.fromEntries(Object.entries(files).sort(([left], [right]) => left.localeCompare(right)));
  await writeFile(target, `${JSON.stringify({ version: 1, files: ordered }, null, 2)}\n`);
}

export function compare(violations, baseline) {
  const exceeded = [];
  const improved = [];
  for (const [file, comments] of violations) {
    const allowed = baseline[file] ?? 0;
    if (comments.length > allowed) exceeded.push({ file, allowed, actual: comments.length, comments });
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const actual = violations.get(file)?.length ?? 0;
    if (actual < allowed) improved.push({ file, allowed, actual });
  }
  return { exceeded, improved };
}

export function counts(violations) {
  return Object.fromEntries([...violations].map(([file, comments]) => [file, comments.length]));
}
