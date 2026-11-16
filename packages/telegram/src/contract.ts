// REQ-TELEGRAM-012

export interface Links {
  readonly bots: readonly BotLink[];
}

export interface BotLink {
  readonly bot: string;
  readonly name: string;
  readonly linked: boolean;
  readonly linkedAt: string | null;
}

export interface Invitation {
  readonly url: string;
  readonly expiresAt: string;
}

export interface LoginWidget {
  readonly id: number;
  readonly first_name?: string;
  readonly last_name?: string;
  readonly username?: string;
  readonly photo_url?: string;
  readonly auth_date: number;
  readonly hash: string;
}

export interface SignedIn {
  readonly id: string;
  readonly email: string;
  readonly roles: readonly string[];
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
