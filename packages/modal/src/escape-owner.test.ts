import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ApcrModal } from './modal';
import type { EscapeHandler } from './modal';

@Component({
  selector: 'test-escape-owner',
  standalone: true,
  imports: [ApcrModal],
  template: `
    <div apcrModal [apcrModalEscape]="close">
      <input id="combo" role="combobox" [attr.aria-expanded]="comboOpen()" (keydown.escape)="own('поле')" />
      <div role="combobox" [attr.aria-expanded]="wrapperOpen()">
        <input id="inner" (keydown.escape)="own('внутреннее поле')" />
      </div>
      <button id="menu" aria-haspopup="menu" [attr.aria-expanded]="menuOpen()" (keydown.escape)="own('меню')">меню</button>
      <button id="disclosure" aria-expanded="true">раздел</button>
      <button id="no-popup" aria-haspopup="false" aria-expanded="true">без списка</button>
    </div>
  `,
})
class EscapeOwner {
  readonly comboOpen = signal(true);
  readonly wrapperOpen = signal(true);
  readonly menuOpen = signal(true);
  readonly closed: string[] = [];
  readonly owned: string[] = [];
  readonly close: EscapeHandler = () => this.closed.push('окно');

  own(who: string): void {
    this.owned.push(who);
  }
}

function escapeOn(id: string): KeyboardEvent {
  const target = document.getElementById(id) as HTMLElement;
  target.focus();
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => TestBed.resetTestingModule());

// REQ-CLIENT-MODAL-012
describe('Escape решает самый внутренний раскрытый элемент, затем окно', () => {
  function open(): { page: EscapeOwner; detect: () => void } {
    const fixture = TestBed.createComponent(EscapeOwner);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    return { page: fixture.componentInstance, detect: () => fixture.detectChanges() };
  }

  it('раскрытое поле с подсказками получает Escape, окно остаётся открытым', () => {
    const { page, detect } = open();
    const event = escapeOn('combo');
    expect(page.owned).toEqual(['поле']);
    expect(page.closed).toEqual([]);
    expect(event.defaultPrevented, 'нажатие не отнято у поля').toBe(false);

    page.comboOpen.set(false);
    detect();
    escapeOn('combo');
    expect(page.closed, 'список закрыт — Escape снова за окном').toEqual(['окно']);
  });

  it('поле внутри раскрытого combobox и раскрытая кнопка меню тоже решают Escape сами', () => {
    const { page } = open();
    escapeOn('inner');
    escapeOn('menu');
    expect(page.owned).toEqual(['внутреннее поле', 'меню']);
    expect(page.closed).toEqual([]);
  });

  it('раскрытый раздел без всплывающего списка Escape не забирает: окно закрывается', () => {
    const { page } = open();
    escapeOn('disclosure');
    escapeOn('no-popup');
    expect(page.closed).toEqual(['окно', 'окно']);
  });
});
