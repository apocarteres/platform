import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectSourceFiles } from './comments.mjs';
import { CONFIG_FILE } from './config.mjs';
import { OPENING_TAG, QUOTED, TEMPLATES, markerOf } from './modal-escape.mjs';

// REQ-CLIENT-MODAL-010
const DIRECTIVE = /(?:^|\s)\[?apcrModalBackdrop\]?(?=[\s=/]|$)/;

// REQ-CLIENT-MODAL-010
const OWN_CLICK = /(?:^|\s)\(click\)(?=\s*=)/;

// REQ-CLIENT-MODAL-010
export function backdropsOutsideTheCore(source, marker) {
  const found = [];
  for (const match of source.matchAll(OPENING_TAG)) {
    const [whole, tag, attributes] = match;
    if (!marker(tag, attributes)) continue;
    const names = attributes.replace(QUOTED, '""');
    const problems = [];
    if (!DIRECTIVE.test(names)) problems.push('без apcrModalBackdrop — нет решения о щелчке по фону');
    if (OWN_CLICK.test(names)) problems.push('со своим (click) — щелчок по фону закрывал бы окно в обход ядра, и во время вызова тоже');
    if (problems.length === 0) continue;
    found.push({
      line: source.slice(0, match.index).split('\n').length,
      text: `фон модального окна ${problems.join('; ')}: ${whole.replace(/\s+/g, ' ').slice(0, 80)}`,
    });
  }
  return found;
}

// REQ-CLIENT-MODAL-010
export async function findBackdropsOutsideTheCore(root, config) {
  const selector = config.modal?.backdrop;
  if (selector === undefined) return new Map();
  const marker = markerOf(selector);
  if (marker === null) {
    return new Map([[CONFIG_FILE, [{
      line: 1,
      text: 'modal.backdrop объявлен неверно: назовите класс (.dialog-backdrop), атрибут ([appBackdrop]) или имя элемента',
    }]]]);
  }
  const violations = new Map();
  for (const file of await collectSourceFiles(root, config, TEMPLATES)) {
    const found = backdropsOutsideTheCore(await readFile(path.join(root, file), 'utf8'), marker);
    if (found.length > 0) violations.set(file, found);
  }
  return violations;
}
