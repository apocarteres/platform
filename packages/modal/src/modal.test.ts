import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ApoModal, ESCAPE_IGNORED } from './modal';
import type { EscapeHandler } from './modal';

function escape(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
}

@Component({
  selector: 'test-two-modals',
  standalone: true,
  imports: [ApoModal],
  template: `
    <div apoModal [apoModalEscape]="closeOuter">внешнее</div>
    @if (innerOpen()) {
      <div apoModal [apoModalEscape]="closeInner">внутреннее</div>
    }
  `,
})
class TwoModals {
  readonly innerOpen = signal(true);
  readonly closed: string[] = [];
  readonly closeOuter: EscapeHandler = () => this.closed.push('внешнее');
  readonly closeInner: EscapeHandler = () => {
    this.closed.push('внутреннее');
    this.innerOpen.set(false);
  };
}

@Component({
  selector: 'test-undeclared',
  standalone: true,
  imports: [ApoModal],
  template: '<div apoModal>без решения</div>',
})
class Undeclared {}

@Component({
  selector: 'test-ignored',
  standalone: true,
  imports: [ApoModal],
  template: '<div apoModal [apoModalEscape]="ignored">не закрывается</div>',
})
class Ignored {
  readonly ignored = ESCAPE_IGNORED;
}

@Component({
  selector: 'test-not-a-handler',
  standalone: true,
  imports: [ApoModal],
  template: '<div apoModal [apoModalEscape]="notAHandler">не обработчик</div>',
})
class NotAHandler {
  readonly notAHandler = 'закрыть' as unknown as EscapeHandler;
}

afterEach(() => TestBed.resetTestingModule());

// REQ-CLIENT-MODAL-001
describe('решение об Escape обязательно', () => {
  it('модальное окно без решения не создаётся, и отказ называет, что указать', () => {
    const fixture = TestBed.createComponent(Undeclared);
    expect(() => fixture.detectChanges()).toThrowError(/без решения об Escape: укажите \[apoModalEscape\].*ESCAPE_IGNORED/);
  });

  it('не обработчик вместо обработчика отвергается тем же отказом', () => {
    const fixture = TestBed.createComponent(NotAHandler);
    expect(() => fixture.detectChanges()).toThrowError(/без решения об Escape/);
  });
});

// REQ-CLIENT-MODAL-002, REQ-CLIENT-MODAL-003
describe('Escape решает верхнее окно', () => {
  it('Escape вызывает обработчик только верхнего окна, а после его закрытия — следующего', () => {
    const fixture = TestBed.createComponent(TwoModals);
    fixture.detectChanges();

    expect(escape().defaultPrevented).toBe(true);
    expect(fixture.componentInstance.closed).toEqual(['внутреннее']);
    fixture.detectChanges();

    escape();
    expect(fixture.componentInstance.closed).toEqual(['внутреннее', 'внешнее']);
  });

  it('намеренно незакрываемое окно поглощает Escape: до страницы под ним он не доходит', () => {
    const page: string[] = [];
    const listener = (): number => page.push('страница');
    document.addEventListener('keydown', listener);
    try {
      const fixture = TestBed.createComponent(Ignored);
      fixture.detectChanges();

      expect(escape().defaultPrevented).toBe(true);
      expect(page, 'обработчик страницы не сработал: решение принадлежит окну').toEqual([]);
    } finally {
      document.removeEventListener('keydown', listener);
    }
  });

  it('без открытых окон Escape проходит мимо ядра нетронутым', () => {
    const fixture = TestBed.createComponent(Ignored);
    fixture.detectChanges();
    fixture.destroy();

    expect(escape().defaultPrevented).toBe(false);
  });
});
