import { DOCUMENT, InjectionToken, inject } from '@angular/core';

// REQ-CLIENT-UPDATE-002, REQ-TYPESCRIPT-CLOCK-004
export interface UpdateSchedule {
  every(milliseconds: number, run: () => void): () => void;
}

// REQ-CLIENT-UPDATE-002
export const POLL_INTERVAL_MS = 5 * 60 * 1000;

// REQ-CLIENT-UPDATE-002, REQ-TYPESCRIPT-CLOCK-002
export const UPDATE_SCHEDULE = new InjectionToken<UpdateSchedule>('UPDATE_SCHEDULE', {
  providedIn: 'root',
  factory: () => {
    const view = inject(DOCUMENT).defaultView;
    return {
      every: (milliseconds, run) => {
        if (view === null) return () => undefined;
        const handle = view.setInterval(run, milliseconds);
        return () => view.clearInterval(handle);
      },
    };
  },
});

// REQ-CLIENT-UPDATE-003
export const PAGE_RELOAD = new InjectionToken<() => void>('PAGE_RELOAD', {
  providedIn: 'root',
  factory: () => {
    const view = inject(DOCUMENT).defaultView;
    return () => view?.location.reload();
  },
});
