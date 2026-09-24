import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ApcrModal, ApcrModalBackdrop, BACKDROP_IGNORED } from './modal';
import type { BackdropHandler, EscapeHandler } from './modal';

@Component({
  selector: 'test-busy-dialog',
  standalone: true,
  imports: [ApcrModal, ApcrModalBackdrop],
  template: `
    <div class="backdrop" [apcrModalBackdrop]="closeByBackdrop">
      <div class="modal-card" apcrModal [apcrModalEscape]="closeByEscape">
        <textarea></textarea>
        <button class="cancel" apcrLocal (click)="cancel()">Отмена</button>
        <button class="action">Удалить</button>
      </div>
    </div>
  `,
})
class BusyDialog {
  readonly closed: string[] = [];
  readonly closeByEscape: EscapeHandler = () => this.closed.push('escape');
  readonly closeByBackdrop: BackdropHandler = () => this.closed.push('фон');
  cancel(): void {
    this.closed.push('отмена');
  }
}

@Component({
  selector: 'test-ignored-backdrop',
  standalone: true,
  imports: [ApcrModalBackdrop],
  template: '<div class="backdrop" [apcrModalBackdrop]="ignored"><div class="modal-card">окно</div></div>',
})
class IgnoredBackdrop {
  readonly ignored = BACKDROP_IGNORED;
}

@Component({
  selector: 'test-undeclared-backdrop',
  standalone: true,
  imports: [ApcrModalBackdrop],
  template: '<div class="backdrop" apcrModalBackdrop>окно</div>',
})
class UndeclaredBackdrop {}

function setUp() {
  const fixture = TestBed.createComponent(BusyDialog);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const find = (selector: string): HTMLElement => root.querySelector(selector) as HTMLElement;
  const pend = (on: boolean): void => {
    if (on) find('.action').setAttribute('data-apcr-pending', '');
    else find('.action').removeAttribute('data-apcr-pending');
  };
  return { dialog: fixture.componentInstance, find, pend };
}

function escape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
}

function pressAndClick(pressed: HTMLElement, clicked: HTMLElement): void {
  pressed.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  clicked.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

afterEach(() => TestBed.resetTestingModule());

// REQ-CLIENT-MODAL-008
describe('пока внутри окна идёт вызов, окно не закрывается ничем', () => {
  it('Escape поглощается, но обработчик не вызывается; после вызова закрывает', () => {
    const { dialog, pend } = setUp();
    pend(true);
    expect(escape().defaultPrevented, 'нажатие поглощено окном, до страницы не дошло').toBe(true);
    expect(dialog.closed).toEqual([]);

    pend(false);
    escape();
    expect(dialog.closed).toEqual(['escape']);
  });

  it('местная кнопка окна во время вызова не срабатывает, после вызова — срабатывает', () => {
    const { dialog, find, pend } = setUp();
    pend(true);
    find('.cancel').click();
    expect(dialog.closed, 'обработчик «Отмены» проекта не вызван').toEqual([]);

    pend(false);
    find('.cancel').click();
    expect(dialog.closed).toEqual(['отмена']);
  });

  it('щелчок по фону во время вызова окно не закрывает, после вызова — закрывает', () => {
    const { dialog, find, pend } = setUp();
    pend(true);
    pressAndClick(find('.backdrop'), find('.backdrop'));
    expect(dialog.closed).toEqual([]);

    pend(false);
    pressAndClick(find('.backdrop'), find('.backdrop'));
    expect(dialog.closed).toEqual(['фон']);
  });
});

// REQ-CLIENT-MODAL-009
describe('щелчок по фону', () => {
  it('щелчок внутри карточки окно не закрывает', () => {
    const { dialog, find } = setUp();
    pressAndClick(find('textarea'), find('textarea'));
    expect(dialog.closed).toEqual([]);
  });

  it('щелчок клавишей по кнопке карточки после нажатия на фон без щелчка окно не закрывает', () => {
    const { dialog, find } = setUp();
    find('.backdrop').dispatchEvent(new Event('pointerdown', { bubbles: true }));
    find('.action').click();
    expect(dialog.closed, 'щелчок пришёл из карточки, а не с фона').toEqual([]);
  });

  it('перетаскивание, начатое в карточке и законченное на фоне, окно не закрывает', () => {
    const { dialog, find } = setUp();
    pressAndClick(find('textarea'), find('.backdrop'));
    expect(dialog.closed).toEqual([]);
  });

  it('решение «не закрывать по фону» именованное, а отсутствие решения — отказ', () => {
    const ignored = TestBed.createComponent(IgnoredBackdrop);
    ignored.detectChanges();
    const backdrop = (ignored.nativeElement as HTMLElement).querySelector('.backdrop') as HTMLElement;
    expect(() => pressAndClick(backdrop, backdrop)).not.toThrow();

    const undeclared = TestBed.createComponent(UndeclaredBackdrop);
    expect(() => undeclared.detectChanges()).toThrowError(/без решения о щелчке: укажите \[apcrModalBackdrop\].*BACKDROP_IGNORED/);
  });
});
