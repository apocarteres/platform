// REQ-API-001
export interface ProblemDetail {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code: string;
}

const ABOUT_BLANK = 'about:blank';

export function problemDetailOf(body: unknown, status: number): ProblemDetail | null {
  if (body === null || typeof body !== 'object') {
    return null;
  }
  const source = body as Record<string, unknown>;
  const code = source['code'];
  if (typeof code !== 'string' || code.length === 0) {
    return null;
  }
  return {
    type: textOf(source['type'], ABOUT_BLANK),
    title: textOf(source['title'], ''),
    status: typeof source['status'] === 'number' ? source['status'] : status,
    detail: textOf(source['detail'], ''),
    instance: typeof source['instance'] === 'string' ? source['instance'] : undefined,
    code,
  };
}

function textOf(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
