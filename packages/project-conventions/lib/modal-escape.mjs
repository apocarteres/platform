import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectSourceFiles } from './comments.mjs';
import { CONFIG_FILE } from './config.mjs';

// REQ-CLIENT-MODAL-004
export const TEMPLATES = new Set(['.html', '.ts']);

// REQ-CLIENT-MODAL-004
const OPENING_TAG = /<([a-zA-Z][\w-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>/g;

// REQ-CLIENT-MODAL-004
export const QUOTED = /"[^"]*"|'[^']*'/g;

// REQ-CLIENT-MODAL-004
const DIRECTIVE = /(?:^|\s)apcrModal(?=[\s=/]|$)/;

// REQ-CLIENT-MODAL-004
export function markerOf(selector) {
  if (typeof selector !== 'string') return null;
  const byClass = /^\.([A-Za-z_][\w-]*)$/.exec(selector);
  if (byClass !== null) {
    const listed = new RegExp(`(?:^|\\s)class=(["'])(?:(?!\\1).)*?(?<![\\w-])${byClass[1]}(?![\\w-])(?:(?!\\1).)*\\1`, 's');
    return (tag, attributes) => listed.test(attributes);
  }
  const byAttribute = /^\[([A-Za-z_][\w-]*)\]$/.exec(selector);
  if (byAttribute !== null) {
    const named = new RegExp(`(?:^|\\s)${byAttribute[1]}(?=[\\s=/]|$)`);
    return (tag, attributes) => named.test(attributes.replace(QUOTED, '""'));
  }
  if (/^[a-z][\w-]*$/.test(selector)) return (tag) => tag === selector;
  return null;
}

// REQ-CLIENT-MODAL-004
export function modalsWithoutDirective(source, marker) {
  const found = [];
  for (const match of source.matchAll(OPENING_TAG)) {
    const [whole, tag, attributes] = match;
    if (!marker(tag, attributes) || DIRECTIVE.test(attributes.replace(QUOTED, '""'))) continue;
    const line = source.slice(0, match.index).split('\n').length;
    found.push({ line, text: whole.replace(/\s+/g, ' ').slice(0, 80) });
  }
  return found;
}

// REQ-CLIENT-MODAL-004
export async function findModalsWithoutEscape(root, config) {
  const declared = config.modal;
  if (declared === undefined) return new Map();
  const marker = markerOf(declared?.selector);
  if (marker === null) {
    return new Map([[CONFIG_FILE, [{
      line: 1,
      text: 'modal.selector объявлен неверно: назовите класс (.modal-card), атрибут ([appModal]) или имя элемента (app-modal)',
    }]]]);
  }
  const violations = new Map();
  for (const file of await collectSourceFiles(root, config, TEMPLATES)) {
    const found = modalsWithoutDirective(await readFile(path.join(root, file), 'utf8'), marker)
      .map((item) => ({ ...item, text: `модальное окно без apcrModal — нет решения об Escape: ${item.text}` }));
    if (found.length > 0) violations.set(file, found);
  }
  return violations;
}
