import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApcrModal, ESCAPE_IGNORED, ModalStack } from './modal';

@Component({
  selector: 'test-layers',
  standalone: true,
  imports: [ApcrModal],
  template: `
    @if (first()) {
      <div apcrModal [apcrModalEscape]="ignored">первое</div>
    }
    @if (plain()) {
      <div apcrModal [apcrModalEscape]="ignored">появилось само</div>
    }
    @if (child()) {
      <div apcrModal apcrModalOver="child" [apcrModalEscape]="ignored">подтверждение</div>
    }
    @if (blocking()) {
      <div apcrModal apcrModalOver="blocking" [apcrModalEscape]="ignored">обновление</div>
    }
  `,
})
class Layers {
  readonly first = signal(false);
  readonly plain = signal(false);
  readonly child = signal(false);
  readonly blocking = signal(false);
  readonly ignored = ESCAPE_IGNORED;
}

@Component({
  selector: 'test-unknown-layer',
  standalone: true,
  imports: [ApcrModal],
  template: '<div apcrModal apcrModalOver="top" [apcrModalEscape]="ignored">неизвестный слой</div>',
})
class UnknownLayer {
  readonly ignored = ESCAPE_IGNORED;
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});

// REQ-CLIENT-MODAL-011
describe('одновременно одно окно', () => {
  it('окно поверх открытого без объявления — ошибка в режиме разработки; child и blocking объявлены и законны', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(Layers);
    const page = fixture.componentInstance;
    page.first.set(true);
    fixture.detectChanges();
    expect(errors).not.toHaveBeenCalled();

    page.child.set(true);
    page.blocking.set(true);
    fixture.detectChanges();
    expect(errors, 'объявленное наложение законно').not.toHaveBeenCalled();

    page.plain.set(true);
    fixture.detectChanges();
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toMatch(/поверх открытого.*apcrModalOver.*whenFree/s);
  });

  it('одно окно без объявления ошибки не даёт, и объявленное без окна под ним — тоже', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(Layers);
    fixture.componentInstance.child.set(true);
    fixture.detectChanges();
    fixture.componentInstance.child.set(false);
    fixture.componentInstance.plain.set(true);
    fixture.detectChanges();
    expect(errors).not.toHaveBeenCalled();
  });

  it('неизвестный слой отвергается и называет допустимые', () => {
    const fixture = TestBed.createComponent(UnknownLayer);
    expect(() => fixture.detectChanges()).toThrowError(/apcrModalOver.*child.*blocking/);
  });

  it('active() говорит, открыто ли окно, а whenFree() дожидается, пока не останется ни одного', async () => {
    const stack = TestBed.inject(ModalStack);
    const fixture = TestBed.createComponent(Layers);
    const page = fixture.componentInstance;
    expect(stack.active()).toBe(false);
    await expect(stack.whenFree()).resolves.toBeUndefined();

    page.first.set(true);
    page.child.set(true);
    fixture.detectChanges();
    expect(stack.active()).toBe(true);
    let freed = false;
    const waiting = stack.whenFree().then(() => {
      freed = true;
    });

    page.child.set(false);
    fixture.detectChanges();
    await Promise.resolve();
    expect(freed, 'одно окно ещё открыто').toBe(false);
    expect(stack.active()).toBe(true);

    page.first.set(false);
    fixture.detectChanges();
    await waiting;
    expect(freed).toBe(true);
    expect(stack.active()).toBe(false);
  });
});
