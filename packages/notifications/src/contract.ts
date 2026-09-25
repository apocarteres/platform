// REQ-NOTIFICATIONS-008

export interface ProblemDetail {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code: string;
}

export interface Notice {
  readonly id: string;
  readonly kind: string;
  readonly params: Readonly<Record<string, string>>;
  readonly link?: string | null;
  readonly createdAt: string;
  readonly read: boolean;
}

export interface Bell {
  readonly items: readonly Notice[];
  readonly unread: number;
}

export interface Unread {
  readonly count: number;
}
