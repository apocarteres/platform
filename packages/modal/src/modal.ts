import { DOCUMENT, Directive, Injectable, OnDestroy, OnInit, inject } from '@angular/core';

// REQ-CLIENT-MODAL-001
export type EscapeHandler = (event: KeyboardEvent) => void;

// REQ-CLIENT-MODAL-002
export const ESCAPE_IGNORED: EscapeHandler = () => undefined;

const UNDECLARED = 'Модальное окно объявлено без решения об Escape: укажите [apoModalEscape] —'
  + ' обработчик, который закрывает окно, либо ESCAPE_IGNORED, если окно намеренно не закрывается';

// REQ-CLIENT-MODAL-003
@Injectable({ providedIn: 'root' })
export class ModalStack {
  private readonly document = inject(DOCUMENT);
  private readonly open: (() => EscapeHandler)[] = [];
  private readonly listener = (event: KeyboardEvent): void => this.keydown(event);

  push(escape: () => EscapeHandler): () => void {
    if (this.open.length === 0) this.document.addEventListener('keydown', this.listener, true);
    this.open.push(escape);
    return () => {
      const at = this.open.lastIndexOf(escape);
      if (at !== -1) this.open.splice(at, 1);
      if (this.open.length === 0) this.document.removeEventListener('keydown', this.listener, true);
    };
  }

  // REQ-CLIENT-MODAL-003
  private keydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || this.open.length === 0) return;
    event.preventDefault();
    event.stopPropagation();
    this.open[this.open.length - 1]()(event);
  }
}

// REQ-CLIENT-MODAL-001
@Directive({
  selector: '[apoModal]',
  standalone: true,
  inputs: [{ name: 'apoModalEscape', required: true }],
})
export class ApoModal implements OnInit, OnDestroy {
  apoModalEscape: EscapeHandler | undefined;
  private readonly stack = inject(ModalStack);
  private release: (() => void) | null = null;

  ngOnInit(): void {
    if (typeof this.apoModalEscape !== 'function') throw new Error(UNDECLARED);
    this.release = this.stack.push(() => this.apoModalEscape ?? ESCAPE_IGNORED);
  }

  ngOnDestroy(): void {
    this.release?.();
    this.release = null;
  }
}
