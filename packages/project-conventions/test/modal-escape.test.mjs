import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { findModalsWithoutEscape, markerOf, modalsWithoutDirective } from '../lib/modal-escape.mjs';

// REQ-CLIENT-MODAL-004
test('признак окна проекта — класс, атрибут или элемент, и находится точно', () => {
  const byClass = markerOf('.modal-card');
  assert.equal(modalsWithoutDirective('<div class="a modal-card b">', byClass).length, 1);
  assert.equal(modalsWithoutDirective("<div class='modal-card'>", byClass).length, 1);
  assert.equal(modalsWithoutDirective('<div\n  class="modal-card"\n  role="dialog">', byClass)[0].line, 1);
  assert.equal(modalsWithoutDirective('<div class="modal-cardless">', byClass).length, 0, 'часть имени — не признак');
  assert.equal(modalsWithoutDirective('<div id="modal-card">', byClass).length, 0);

  assert.equal(modalsWithoutDirective('<div appModal>', markerOf('[appModal]')).length, 1);
  assert.equal(modalsWithoutDirective('<app-modal>', markerOf('app-modal')).length, 1);
  assert.equal(markerOf('div > .x'), null, 'составной селектор не принимается');
});

// REQ-CLIENT-MODAL-001, REQ-CLIENT-MODAL-004
test('окно с директивой проходит, окно с одним входом без директивы — нет', () => {
  const byClass = markerOf('.modal-card');
  assert.equal(modalsWithoutDirective('<div class="modal-card" apcrModal [apcrModalEscape]="close">', byClass).length, 0);
  assert.equal(modalsWithoutDirective('<div class="modal-card" [apcrModalEscape]="close">', byClass).length, 1,
    'вход без директивы решения не применяет');
});

// REQ-CLIENT-MODAL-004
test('правило читает шаблоны .html и встроенные в .ts, а без объявления признака молчит', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'modal-escape-'));
  try {
    await mkdir(path.join(root, 'src/app'), { recursive: true });
    await writeFile(path.join(root, 'src/app/share.dialog.html'), '<div class="modal-card">поделиться</div>\n');
    await writeFile(path.join(root, 'src/app/confirm.component.ts'),
      "@Component({\n  template: `\n    <div class=\"modal-card\">удалить?</div>\n  `,\n})\nexport class Confirm {}\n");
    await writeFile(path.join(root, 'src/app/fine.dialog.html'), '<div class="modal-card" apcrModal [apcrModalEscape]="close">ок</div>\n');

    const config = { sources: ['src'], modal: { selector: '.modal-card' } };
    const found = await findModalsWithoutEscape(root, config);
    assert.deepEqual([...found.keys()].sort(), ['src/app/confirm.component.ts', 'src/app/share.dialog.html']);
    assert.equal(found.get('src/app/confirm.component.ts')[0].line, 3);
    assert.match(found.get('src/app/share.dialog.html')[0].text, /нет решения об Escape/);

    assert.equal((await findModalsWithoutEscape(root, { sources: ['src'] })).size, 0);
    const wrong = await findModalsWithoutEscape(root, { sources: ['src'], modal: { selector: 'div > .x' } });
    assert.match(wrong.get('.conventions.json')[0].text, /modal\.selector объявлен неверно: назовите/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-CLIENT-MODAL-004
test('знак «>» внутри значения атрибута тега не обрывает', () => {
  const byClass = markerOf('.modal-card');
  const afterArrow = '<div [apcrModalEscape]="() => close()" class="modal-card">';
  assert.equal(modalsWithoutDirective(afterArrow, byClass).length, 1, 'окно после стрелки находится, а не выпадает молча');

  const afterComparison = '<div [class.wide]="count > 3" class="modal-card" apcrModal [apcrModalEscape]="close">';
  assert.equal(modalsWithoutDirective(afterComparison, byClass).length, 0, 'apcrModal после сравнения виден: ложного отказа нет');
  assert.equal(modalsWithoutDirective(afterComparison.replace(' apcrModal ', ' '), byClass).length, 1);

  const reported = '<div class="dialog-backdrop" [apcrModalEscape]="() => close()" aria-modal="true" apcrModal>';
  assert.equal(modalsWithoutDirective(reported, markerOf('[aria-modal]')).length, 0, 'тег из заявки: признак и директива после стрелки');
  assert.equal(modalsWithoutDirective(reported.replace(' apcrModal>', '>'), markerOf('[aria-modal]')).length, 1);
});

// REQ-CLIENT-MODAL-004
test('имя директивы внутри значения атрибута директивой не считается', () => {
  const byClass = markerOf('.modal-card');
  assert.equal(modalsWithoutDirective('<div class="modal-card" title="открыть apcrModal позже">', byClass).length, 1,
    'слово apcrModal посреди значения — не директива');
  assert.equal(modalsWithoutDirective('<div appModal="x" [x]="a > b">', markerOf('[appModal]')).length, 1);
  assert.equal(modalsWithoutDirective('<div title="это appModal окно">', markerOf('[appModal]')).length, 0,
    'признак-атрибут внутри значения признаком не считается');
});
