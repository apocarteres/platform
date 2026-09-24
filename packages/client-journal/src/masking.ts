// REQ-CLIENT-JOURNAL-004
export const MASK = '***';

// REQ-CLIENT-JOURNAL-004
export const MASK_INPUT_LIMIT = 4096;

const EMAIL = /[^\s/@?&=]+@[^\s/@?&=]+\.[A-Za-z]{2,}/g;
const MARKER = /[A-Za-z0-9_-]{20,}/g;
const PHONE = /\+?\d[\d ()-]{6,}\d/g;
const ORIGIN = /^(?:[a-z][a-z0-9+.-]*:)?\/\/[^/?#]*/i;

// REQ-CLIENT-JOURNAL-004, REQ-CLIENT-JOURNAL-005
export function masked(value: string): string {
  return value.slice(0, MASK_INPUT_LIMIT).replace(EMAIL, MASK).replace(MARKER, MASK).replace(PHONE, MASK);
}

// REQ-CLIENT-JOURNAL-003, REQ-CLIENT-JOURNAL-005
export function barePath(url: string): string {
  const path = url.replace(ORIGIN, '').split(/[?#]/, 1)[0] ?? '';
  return path.length === 0 ? '/' : path;
}
