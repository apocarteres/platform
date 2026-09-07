import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

export async function readReceipt(root, commit) {
  try {
    return JSON.parse(await readFile(receiptPath(root, commit), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return null;
  }
}
