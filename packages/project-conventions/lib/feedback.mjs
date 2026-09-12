import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { INSTALLED_DOCS_PATH, SOURCE_DOCS_PATH } from './agents.mjs';

const DOCUMENT = 'adoption.md';
const CLAUSE = 'REQ-ADOPTION-019';
const ADDRESS = new RegExp(`${CLAUSE}[^\\n]*?\`(https://[^\`\\s]+)\``);

// REQ-ADOPTION-019
export async function feedbackChannel(root) {
  for (const directory of [SOURCE_DOCS_PATH, INSTALLED_DOCS_PATH]) {
    let text;
    try {
      text = await readFile(path.join(root, directory, DOCUMENT), 'utf8');
    } catch {
      continue;
    }
    const found = ADDRESS.exec(text);
    if (found !== null) return { url: found[1], clause: CLAUSE };
  }
  return null;
}

// REQ-ADOPTION-019
export function feedbackLine(channel) {
  if (channel === null) return null;
  return `Если дело в самом правиле или в дефекте ядра — заявка в ядро: ${channel.url} (${channel.clause}).`;
}
