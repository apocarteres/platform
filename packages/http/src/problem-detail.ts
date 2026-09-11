// REQ-API-001
export interface ProblemDetail {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code: string;
  // REQ-API-007, REQ-PUBLISHING-004
  readonly extensions?: Readonly<Record<string, unknown>>;
}

const ABOUT_BLANK = 'about:blank';

// REQ-API-001
const CONTRACT_FIELDS = new Set(['type', 'title', 'status', 'detail', 'instance', 'code']);

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
    extensions: extensionsOf(source),
  };
}

// REQ-API-007
function extensionsOf(source: Record<string, unknown>): Record<string, unknown> {
  const found: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(source)) {
    if (CONTRACT_FIELDS.has(name)) {
      continue;
    }
    found[name] = value;
  }
  return found;
}

function textOf(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}
