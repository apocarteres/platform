import { InjectionToken } from '@angular/core';

// REQ-CLIENT-JOURNAL-010, REQ-TYPESCRIPT-CLOCK-001
export interface JournalClock {
  instant(): number;
  date(): Date;
}

// REQ-CLIENT-JOURNAL-010, REQ-TYPESCRIPT-CLOCK-002, REQ-TYPESCRIPT-CLOCK-003
export const JOURNAL_CLOCK = new InjectionToken<JournalClock>('JOURNAL_CLOCK', {
  providedIn: 'root',
  factory: () => ({
    instant: () => Date.now(),
    date: () => new Date(),
  }),
});
