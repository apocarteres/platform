import { Directive, EventEmitter, OnDestroy, OnInit, signal } from '@angular/core';
import { from, isObservable } from 'rxjs';
import type { Observable, Subscription } from 'rxjs';

// REQ-CLIENT-ACTION-001
export type Action = () => Promise<unknown> | Observable<unknown>;

// REQ-CLIENT-ACTION-004
export type FailureHandler = (failure: unknown) => void;

const UNDECLARED = 'Кнопка удалённого действия объявлена не полностью: укажите [apcrAction] — действие,'
  + ' которое ядро запустит, и [apcrActionFailure] — куда идёт отказ; отказ не поглощается';

// REQ-CLIENT-ACTION-001
@Directive({
  selector: 'button[apcrAction]',
  standalone: true,
  exportAs: 'apcrAction',
  inputs: [{ name: 'apcrAction', required: true }, { name: 'apcrActionFailure', required: true }],
  outputs: ['apcrActionDone'],
  host: {
    '(click)': 'run($event)',
    '[attr.aria-busy]': 'pending() ? "true" : null',
  },
})
export class ApcrAction implements OnInit, OnDestroy {
  apcrAction: Action | undefined;
  apcrActionFailure: FailureHandler | undefined;
  readonly apcrActionDone = new EventEmitter<unknown>();
  // REQ-CLIENT-ACTION-002
  readonly pending = signal(false);
  private running: Subscription | null = null;

  ngOnInit(): void {
    if (typeof this.apcrAction !== 'function' || typeof this.apcrActionFailure !== 'function') {
      throw new Error(UNDECLARED);
    }
  }

  // REQ-CLIENT-ACTION-003
  run(event: Event): void {
    event.preventDefault();
    if (this.pending()) return;
    const failure = this.apcrActionFailure as FailureHandler;
    let started: Promise<unknown> | Observable<unknown>;
    try {
      started = (this.apcrAction as Action)();
    } catch (thrown) {
      failure(thrown);
      return;
    }
    this.pending.set(true);
    let last: unknown;
    this.running = (isObservable(started) ? started : from(started)).subscribe({
      next: (value) => {
        last = value;
      },
      error: (thrown: unknown) => {
        this.settle();
        failure(thrown);
      },
      complete: () => {
        this.settle();
        this.apcrActionDone.emit(last);
      },
    });
  }

  // REQ-CLIENT-ACTION-002
  ngOnDestroy(): void {
    this.running?.unsubscribe();
    this.settle();
  }

  // REQ-CLIENT-ACTION-002
  private settle(): void {
    this.running = null;
    this.pending.set(false);
  }
}
