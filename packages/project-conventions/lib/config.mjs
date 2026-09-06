import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const CONFIG_FILE = '.conventions.json';

export async function readConfig(root) {
  try {
    return JSON.parse(await readFile(path.join(root, CONFIG_FILE), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { sources: ['.'], exclude: [] };
    throw error;
  }
}
