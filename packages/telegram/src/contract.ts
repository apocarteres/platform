// REQ-TELEGRAM-012

export interface LinkState {
  readonly linked: boolean;
  readonly linkedAt: string | null;
}

export interface Invitation {
  readonly url: string;
  readonly expiresAt: string;
}

export interface Update {
  readonly update_id: number;
  readonly message?: Readonly<Record<string, unknown>>;
}

export interface Reply {
  readonly method: 'sendMessage';
  readonly chat_id: number;
  readonly text: string;
}

export interface ProblemDetail {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code: string;
}
