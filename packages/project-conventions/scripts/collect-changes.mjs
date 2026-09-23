import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHANGES_FILE, changesHistory } from '../lib/release/changes.mjs';

// REQ-PUBLISHING-015
const here = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(here, '..');
const repository = path.resolve(packageRoot, '../..');
const history = await changesHistory(repository);
await writeFile(path.join(packageRoot, CHANGES_FILE), `${JSON.stringify({ history }, null, 2)}\n`);
console.log(`История изменений собрана: выпусков ${history.length}, несовместимых ${history.filter((entry) => entry.breaking.length > 0).length}.`);
