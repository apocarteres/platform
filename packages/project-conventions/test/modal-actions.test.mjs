import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { findUndeclaredModalButtons, undeclaredButtons } from '../lib/modal-actions.mjs';
import { markerOf } from '../lib/modal-escape.mjs';

const byClass = markerOf('.modal-card');

// REQ-CLIENT-MODAL-007
test('кнопка окна объявляет удалённое действие или местное, кнопка вне окна — не обязана', () => {
  const template = [
    '<button (click)="open()">вне окна</button>',
    '<div class="modal-card" apcrModal [apcrModalEscape]="() => close()">',
    '  <div class="row"><button apcrLocal (click)="close()">Отмена</button></div>',
    '  <button [apcrAction]="remove" [apcrActionFailure]="failed" (apcrActionDone)="close()">Удалить</button>',
    '  <button (click)="remove.emit(); close()">Удалить по-старому</button>',
    '</div>',
    '<button (click)="after()">после окна</button>',
  ].join('\n');
  const found = undeclaredButtons(template, byClass);
  assert.deepEqual(found.map((item) => item.line), [5], 'найдена только кнопка «emit и закрыть» внутри окна');
});

// REQ-CLIENT-MODAL-007
test('самозакрытое окно-компонент не растягивает окно на остаток шаблона', () => {
  const template = '<app-dialog [apcrModalEscape]="close" apcrModal />\n<button (click)="later()">после окна</button>';
  assert.equal(undeclaredButtons(template, markerOf('app-dialog')).length, 0);
});

// REQ-CLIENT-MODAL-007
test('пустые элементы и вложенность одноимённых тегов не сбивают границу окна', () => {
  const template = [
    '<div class="modal-card">',
    '  <input type="text"><br><img src="a.png" />',
    '  <div><div><span>глубоко</span></div></div>',
    '  <button (click)="save()">Сохранить</button>',
    '</div>',
    '<div><button (click)="x()">вне</button></div>',
  ].join('\n');
  assert.deepEqual(undeclaredButtons(template, byClass).map((item) => item.line), [4]);
});

// REQ-CLIENT-MODAL-007
test('объявление ищется вне значений атрибутов', () => {
  const template = '<div class="modal-card"><button title="как apcrLocal" (click)="a > b">x</button></div>';
  assert.equal(undeclaredButtons(template, byClass).length, 1);
});

// REQ-CLIENT-MODAL-007
test('правило молчит без объявленного признака окон и читает встроенные шаблоны', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'modal-actions-'));
  try {
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src/remove.component.ts'),
      '@Component({\n  template: `\n    <div class="modal-card">\n      <button (click)="go()">x</button>\n    </div>`,\n})\nexport class Remove {}\n');
    assert.equal((await findUndeclaredModalButtons(root, { sources: ['src'] })).size, 0);
    const found = await findUndeclaredModalButtons(root, { sources: ['src'], modal: { selector: '.modal-card' } });
    assert.equal(found.get('src/remove.component.ts')[0].line, 4);
    assert.match(found.get('src/remove.component.ts')[0].text, /apcrAction либо apcrLocal/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
