import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { backdropsOutsideTheCore, findBackdropsOutsideTheCore } from '../lib/modal-backdrop.mjs';
import { markerOf } from '../lib/modal-escape.mjs';

const backdrop = markerOf('.dialog-backdrop');

// REQ-CLIENT-MODAL-010
test('фон с решением ядра проходит, без решения или со своим щелчком — нет', () => {
  assert.equal(backdropsOutsideTheCore('<div class="dialog-backdrop" [apcrModalBackdrop]="() => close()">', backdrop).length, 0);

  const bare = backdropsOutsideTheCore('<div class="dialog-backdrop">', backdrop);
  assert.match(bare[0].text, /без apcrModalBackdrop/);

  const own = backdropsOutsideTheCore('<div class="dialog-backdrop" (click)="close()" [apcrModalBackdrop]="close">', backdrop);
  assert.equal(own.length, 1);
  assert.match(own[0].text, /со своим \(click\) — щелчок по фону закрывал бы окно в обход ядра/);

  const both = backdropsOutsideTheCore('<div class="dialog-backdrop" (click)="close()">', backdrop);
  assert.match(both[0].text, /без apcrModalBackdrop.*со своим \(click\)/);
});

// REQ-CLIENT-MODAL-010
test('щелчок и директива ищутся вне значений атрибутов', () => {
  assert.equal(backdropsOutsideTheCore('<div class="dialog-backdrop" title="открыть apcrModalBackdrop сейчас">', backdrop).length, 1,
    'имя директивы посреди значения — не директива');
  assert.equal(backdropsOutsideTheCore('<div class="dialog-backdrop" [apcrModalBackdrop]="close" title="нажми (click) = закрыть">', backdrop).length, 0,
    'щелчок посреди значения — не свой щелчок');
});

// REQ-CLIENT-MODAL-010
test('правило молчит без объявленного признака фона и отвергает неверный признак', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'modal-backdrop-'));
  try {
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src/a.html'), '<div class="dialog-backdrop" (click)="close()"></div>\n');
    assert.equal((await findBackdropsOutsideTheCore(root, { sources: ['src'], modal: { selector: '.modal-card' } })).size, 0);
    const found = await findBackdropsOutsideTheCore(root, { sources: ['src'], modal: { backdrop: '.dialog-backdrop' } });
    assert.equal(found.get('src/a.html')[0].line, 1);
    const wrong = await findBackdropsOutsideTheCore(root, { sources: ['src'], modal: { backdrop: 'div > .x' } });
    assert.match(wrong.get('.conventions.json')[0].text, /modal\.backdrop объявлен неверно: назовите/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
