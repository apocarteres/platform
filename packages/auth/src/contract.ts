// REQ-AUTH-020

export interface RegisterRequest {
  readonly email: string;
  readonly password: string;
  readonly human?: string;
  readonly profile?: Readonly<Record<string, unknown>>;
}

export interface LoginRequest {
  readonly email: string;
  readonly password: string;
  readonly human?: string;
}

export interface EmailRequest {
  readonly email: string;
  readonly human?: string;
}

export interface TokenRequest {
  readonly token: string;
}

export interface ResetRequest {
  readonly token: string;
  readonly password: string;
}

export interface PasswordChangeRequest {
  readonly current: string;
  readonly password: string;
}

export interface Account {
  readonly id: string;
  readonly email: string;
  readonly roles: readonly string[];
}

export interface Csrf {
  readonly headerName: string;
  readonly parameterName: string;
  readonly token: string;
}

export interface Policy {
  readonly passwordMinBytes: number;
  readonly passwordMaxBytes: number;
}

export interface ProblemDetail {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code: string;
}

export interface EmailChangeRequest {
  readonly current: string;
  readonly email: string;
}

export interface KeyRequest {
  readonly name: string;
  readonly days: number;
}

export interface AccessKey {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastUsedAt: string | null;
}

export interface IssuedKey {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly value: string;
}
