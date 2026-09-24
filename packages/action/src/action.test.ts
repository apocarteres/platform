import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { ApcrAction } from './action';
import type { Action, FailureHandler } from './action';

interface Pending {
  readonly promise: Promise<string>;
  resolve(value: string): void;
  reject(reason: unknown): void;
}

function pending(): Pending {
  let resolve!: (value: string) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<string>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

@Component({
  selector: 'test-dialog',
  standalone: true,
  imports: [ApcrAction],
  template: `
    @if (shown()) {
      <form (submit)="submitted = submitted + 1">
        <button type="submit" [apcrAction]="save" [apcrActionFailure]="failed" (apcrActionDone)="done($event)"
                #act="apcrAction" [disabled]="act.pending()">Сохранить</button>
      </form>
    }
  `,
})
class Dialog {
  readonly shown = signal(true);
  calls = 0;
  submitted = 0;
  result: unknown = undefined;
  failure: unknown = undefined;
  next: Pending = pending();
  mode: 'обещание' | 'исключение' | 'поток' = 'обещание';
  readonly late = new Subject<string>();
  readonly broken = new Error('действие не собрало запрос');
  readonly save: Action = () => {
    this.calls += 1;
    if (this.mode === 'исключение') throw this.broken;
    return this.mode === 'поток' ? this.late : this.next.promise;
  };
  readonly failed: FailureHandler = (thrown) => {
    this.failure = thrown;
  };
  done(value: unknown): void {
    this.result = value;
  }
}

function setUp() {
  const fixture = TestBed.createComponent(Dialog);
  fixture.detectChanges();
  const button = (): HTMLButtonElement | null => (fixture.nativeElement as HTMLElement).querySelector('button');
  return { fixture, dialog: fixture.componentInstance, button };
}

afterEach(() => TestBed.resetTestingModule());

// REQ-CLIENT-ACTION-001, REQ-CLIENT-ACTION-002, REQ-CLIENT-ACTION-005
describe('ожидание ведёт ядро', () => {
  it('на время вызова кнопка занята, по успеху отдаёт результат и освобождается', async () => {
    const { fixture, dialog, button } = setUp();
    button()?.click();
    expect(button()?.getAttribute('aria-busy'), 'признак стоит сразу, без обнаружения изменений').toBe('true');
    expect(button()?.hasAttribute('data-apcr-pending'), 'окно узнаёт о вызове по этому признаку').toBe(true);
    fixture.detectChanges();
    expect(button()?.disabled).toBe(true);

    dialog.next.resolve('сохранено');
    await flush();
    fixture.detectChanges();
    expect(dialog.result).toBe('сохранено');
    expect(button()?.hasAttribute('aria-busy')).toBe(false);
    expect(button()?.disabled).toBe(false);
  });

  // REQ-CLIENT-ACTION-004, REQ-CLIENT-MODAL-005, REQ-CLIENT-MODAL-006
  it('при отказе признак снимается, отказ доходит до обработчика, успеха нет', async () => {
    const { fixture, dialog, button } = setUp();
    button()?.click();
    const refusal = { status: 409, code: 'already-changed' };
    dialog.next.reject(refusal);
    await flush();
    fixture.detectChanges();

    expect(dialog.failure).toBe(refusal);
    expect(dialog.result).toBeUndefined();
    expect(button()?.hasAttribute('aria-busy'), 'признак, не снятый при отказе, выключил бы кнопку навсегда').toBe(false);
    expect(button()?.hasAttribute('data-apcr-pending'), 'окно не остаётся запертым после отказа').toBe(false);
  });

  it('исключение, брошенное самим действием, тоже отказ, а не зависшее ожидание', () => {
    const { fixture, dialog, button } = setUp();
    dialog.mode = 'исключение';
    button()?.click();
    fixture.detectChanges();
    expect(dialog.failure).toBe(dialog.broken);
    expect(button()?.hasAttribute('aria-busy')).toBe(false);
  });
});

// REQ-CLIENT-ACTION-003
describe('повторный запуск', () => {
  it('нажатие во время ожидания действие не повторяет', () => {
    const { dialog, button } = setUp();
    button()?.click();
    button()?.click();
    button()?.click();
    expect(dialog.calls).toBe(1);
  });

  it('нажатие отправкой формы форму не отправляет: путь к действию один', () => {
    const { dialog, button } = setUp();
    button()?.click();
    expect(dialog.submitted, 'отправка формы шла бы вторым путём к тому же действию').toBe(0);
    expect(dialog.calls).toBe(1);
  });
});

// REQ-CLIENT-ACTION-002
describe('уничтожение во время ожидания', () => {
  it('ожидание отменяется: поздний ответ никуда не доходит', async () => {
    const { fixture, dialog, button } = setUp();
    dialog.mode = 'поток';
    button()?.click();
    expect(dialog.late.observed, 'ядро подписалось на поданное действие').toBe(true);
    dialog.shown.set(false);
    fixture.detectChanges();

    expect(dialog.late.observed, 'подписка снята').toBe(false);
    dialog.late.next('поздно');
    dialog.late.complete();
    await flush();
    expect(dialog.result).toBeUndefined();
  });
});

@Component({
  selector: 'test-not-a-function',
  standalone: true,
  imports: [ApcrAction],
  template: '<button [apcrAction]="save" [apcrActionFailure]="failed">Сохранить</button>',
})
class NotAFunction {
  readonly save = 'сохранить' as unknown as Action;
  readonly failed: FailureHandler = () => undefined;
}

// REQ-CLIENT-ACTION-001
describe('объявление обязательно', () => {
  it('не действие вместо действия отвергается при создании с названием, что указать', () => {
    const fixture = TestBed.createComponent(NotAFunction);
    expect(() => fixture.detectChanges()).toThrowError(/укажите \[apcrAction\].*\[apcrActionFailure\]/);
  });
});
