import { DOCUMENT, Directive, ElementRef, Injectable, OnDestroy, OnInit, inject } from '@angular/core';

// REQ-CLIENT-MODAL-001
export type EscapeHandler = (event: KeyboardEvent) => void;

// REQ-CLIENT-MODAL-009
export type BackdropHandler = (event: MouseEvent) => void;

// REQ-CLIENT-MODAL-002
export const ESCAPE_IGNORED: EscapeHandler = () => undefined;

// REQ-CLIENT-MODAL-009
export const BACKDROP_IGNORED: BackdropHandler = () => undefined;

// REQ-CLIENT-MODAL-008
export const PENDING_SELECTOR = '[data-apcr-pending]';

// REQ-CLIENT-MODAL-008
const LOCAL_SELECTOR = '[apcrlocal]';

const UNDECLARED = 'Модальное окно объявлено без решения об Escape: укажите [apcrModalEscape] —'
  + ' обработчик, который закрывает окно, либо ESCAPE_IGNORED, если окно намеренно не закрывается';

const NO_BACKDROP = 'Фон модального окна объявлен без решения о щелчке: укажите [apcrModalBackdrop] —'
  + ' обработчик, который закрывает окно, либо BACKDROP_IGNORED, если щелчок по фону окно не закрывает';

// REQ-CLIENT-MODAL-008
function busy(element: Element): boolean {
  return element.querySelector(PENDING_SELECTOR) !== null;
}

interface Open {
  readonly escape: () => EscapeHandler;
  readonly busy: () => boolean;
}

// REQ-CLIENT-MODAL-003
@Injectable({ providedIn: 'root' })
export class ModalStack {
  private readonly document = inject(DOCUMENT);
  private readonly open: Open[] = [];
  private readonly listener = (event: KeyboardEvent): void => this.keydown(event);

  push(entry: Open): () => void {
    if (this.open.length === 0) this.document.addEventListener('keydown', this.listener, true);
    this.open.push(entry);
    return () => {
      const at = this.open.lastIndexOf(entry);
      if (at !== -1) this.open.splice(at, 1);
      if (this.open.length === 0) this.document.removeEventListener('keydown', this.listener, true);
    };
  }

  // REQ-CLIENT-MODAL-003, REQ-CLIENT-MODAL-008
  private keydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || this.open.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const top = this.open[this.open.length - 1];
    if (top.busy()) return;
    top.escape()(event);
  }
}

// REQ-CLIENT-MODAL-001
@Directive({
  selector: '[apcrModal]',
  standalone: true,
  inputs: [{ name: 'apcrModalEscape', required: true }],
})
export class ApcrModal implements OnInit, OnDestroy {
  apcrModalEscape: EscapeHandler | undefined;
  private readonly stack = inject(ModalStack);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private release: (() => void) | null = null;
  // REQ-CLIENT-MODAL-008
  private readonly local = (event: Event): void => {
    const target = event.target instanceof Element ? event.target.closest(LOCAL_SELECTOR) : null;
    if (target === null || !this.host.nativeElement.contains(target) || !this.busy()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  ngOnInit(): void {
    if (typeof this.apcrModalEscape !== 'function') throw new Error(UNDECLARED);
    this.host.nativeElement.addEventListener('click', this.local, true);
    this.release = this.stack.push({
      escape: () => this.apcrModalEscape ?? ESCAPE_IGNORED,
      busy: () => this.busy(),
    });
  }

  // REQ-CLIENT-MODAL-008
  busy(): boolean {
    return busy(this.host.nativeElement);
  }

  ngOnDestroy(): void {
    this.host.nativeElement.removeEventListener('click', this.local, true);
    this.release?.();
    this.release = null;
  }
}

// REQ-CLIENT-MODAL-009
@Directive({
  selector: '[apcrModalBackdrop]',
  standalone: true,
  inputs: [{ name: 'apcrModalBackdrop', required: true }],
  host: {
    '(pointerdown)': 'press($event)',
    '(click)': 'click($event)',
  },
})
export class ApcrModalBackdrop implements OnInit {
  apcrModalBackdrop: BackdropHandler | undefined;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private pressedOnSelf = false;

  ngOnInit(): void {
    if (typeof this.apcrModalBackdrop !== 'function') throw new Error(NO_BACKDROP);
  }

  press(event: Event): void {
    this.pressedOnSelf = event.target === this.host.nativeElement;
  }

  // REQ-CLIENT-MODAL-008, REQ-CLIENT-MODAL-009
  click(event: MouseEvent): void {
    const onSelf = event.target === this.host.nativeElement;
    const pressed = this.pressedOnSelf;
    this.pressedOnSelf = false;
    if (!onSelf || !pressed || busy(this.host.nativeElement)) return;
    (this.apcrModalBackdrop ?? BACKDROP_IGNORED)(event);
  }
}
