import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectSourceFiles } from './comments.mjs';
import { QUOTED, TEMPLATES, markerOf } from './modal-escape.mjs';

// REQ-CLIENT-MODAL-007
const TAG = /<(\/?)([a-zA-Z][\w-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g;

// REQ-CLIENT-MODAL-007
const DECLARED = /(?:^|\s)(?:\[?apcrAction\]?|apcrLocal)(?=[\s=/]|$)/;

// REQ-CLIENT-MODAL-007
export function undeclaredButtons(source, marker) {
  const found = [];
  const open = [];
  for (const match of source.matchAll(TAG)) {
    const [whole, closing, name, attributes] = match;
    const tag = name.toLowerCase();
    if (closing === '/') {
      const at = open.map((one) => one.tag).lastIndexOf(tag);
      if (at !== -1) open.length = at;
      continue;
    }
    const insideModal = open.some((one) => one.modal);
    if (tag === 'button' && insideModal && !DECLARED.test(attributes.replace(QUOTED, '""'))) {
      found.push({ line: source.slice(0, match.index).split('\n').length, text: whole.replace(/\s+/g, ' ').slice(0, 80) });
    }
    if (attributes.trimEnd().endsWith('/')) continue;
    open.push({ tag, modal: marker(name, attributes) });
  }
  return found;
}

// REQ-CLIENT-MODAL-007
export async function findUndeclaredModalButtons(root, config) {
  if (config.modal === undefined) return new Map();
  const marker = markerOf(config.modal?.selector);
  if (marker === null) return new Map();
  const violations = new Map();
  for (const file of await collectSourceFiles(root, config, TEMPLATES)) {
    const found = undeclaredButtons(await readFile(path.join(root, file), 'utf8'), marker).map((item) => ({
      ...item,
      text: `кнопка в модальном окне не объявляет, удалённое ли у неё действие: apcrAction либо apcrLocal — ${item.text}`,
    }));
    if (found.length > 0) violations.set(file, found);
  }
  return violations;
}
