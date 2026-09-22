import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

// REQ-RELEASE-003, REQ-RELEASE-011
export const RECEIPT_DIR = 'target/verify';

export function receiptPath(root, commit) {
  return path.join(root, RECEIPT_DIR, `${commit}.json`);
}

export async function writeReceipt(root, receipt) {
  const file = receiptPath(root, receipt.commit);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(receipt, null, 2)}\n`);
  return file;
}

// REQ-RELEASE-027
export function attested(receipt) {
  const run = receipt?.run;
  return typeof run?.command === 'string' && run.command.trim() !== '' && run.exitCode === 0;
}

export async function readReceipt(root, commit) {
  try {
    return JSON.parse(await readFile(receiptPath(root, commit), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}

// REQ-RELEASE-045
export async function recordedReceipts(root) {
  let names;
  try {
    names = await readdir(path.join(root, RECEIPT_DIR));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return [];
  }
  const found = [];
  for (const name of names.filter((one) => one.endsWith('.json')).sort()) {
    const receipt = await readReceipt(root, path.basename(name, '.json'));
    if (receipt?.commit !== undefined) found.push(receipt);
  }
  return found.sort((one, other) => String(other.completedAt).localeCompare(String(one.completedAt)));
}

// REQ-RELEASE-045
export async function receiptFor(root, commit, { treeOf }) {
  const exact = await readReceipt(root, commit);
  if (exact !== null) return { receipt: exact, carriedFrom: null };
  const tree = await treeOf(commit);
  for (const candidate of await recordedReceipts(root)) {
    if (candidate.commit === commit || !attested(candidate)) continue;
    let theirs;
    try {
      theirs = await treeOf(candidate.commit);
    } catch {
      continue;
    }
    if (theirs === tree) return { receipt: candidate, carriedFrom: candidate.commit };
  }
  return { receipt: null, carriedFrom: null };
}
