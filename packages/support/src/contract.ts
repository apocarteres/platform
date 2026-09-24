// REQ-SUPPORT-013

export interface ProblemDetail {
  readonly type: string;
  readonly title: string;
  readonly status: number;
  readonly detail: string;
  readonly instance?: string;
  readonly code: string;
}

export type RequestState = 'NEW' | 'IN_PROGRESS' | 'ANSWERED' | 'CLOSED';

export interface Snapshot {
  readonly version?: string | null;
  readonly page?: string | null;
  readonly language?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly agent?: string | null;
}

export interface JournalEntry {
  readonly at: string;
  readonly kind: 'request' | 'navigation' | 'error';
  readonly method?: string | null;
  readonly path?: string | null;
  readonly status?: number | null;
  readonly durationMs?: number | null;
  readonly code?: string | null;
  readonly message?: string | null;
}

export interface Submission {
  readonly message: string;
  readonly email?: string | null;
  readonly snapshot?: Snapshot | null;
  readonly journal?: readonly JournalEntry[] | null;
}

export interface Submitted {
  readonly id: string;
  readonly number: number;
}

export interface Message {
  readonly text: string;
}

export interface StateChange {
  readonly state: RequestState;
}

export interface AnswerLink {
  readonly token: string;
}

export interface Item {
  readonly id: string;
  readonly number: number;
  readonly state: RequestState;
  readonly excerpt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly fresh: boolean;
  readonly guest: boolean;
}

export interface Page {
  readonly items: readonly Item[];
  readonly page: number;
  readonly size: number;
  readonly total: number;
}

export interface Step {
  readonly kind: string;
  readonly side: string;
  readonly text?: string | null;
  readonly from?: RequestState | null;
  readonly to?: RequestState | null;
  readonly at: string;
}

export interface OperatorStep {
  readonly kind: string;
  readonly side: string;
  readonly actor?: string | null;
  readonly text?: string | null;
  readonly from?: RequestState | null;
  readonly to?: RequestState | null;
  readonly at: string;
}

export interface File {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly size: number;
  readonly purged: boolean;
}

export interface AuthorView {
  readonly id: string;
  readonly number: number;
  readonly state: RequestState;
  readonly message?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly steps: readonly Step[];
  readonly files: readonly File[];
}

export interface OperatorView {
  readonly id: string;
  readonly number: number;
  readonly state: RequestState;
  readonly message?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly closedAt?: string | null;
  readonly author?: string | null;
  readonly email?: string | null;
  readonly guest: boolean;
  readonly snapshot?: Snapshot | null;
  readonly journal?: readonly JournalEntry[] | null;
  readonly steps: readonly OperatorStep[];
  readonly files: readonly File[];
  readonly attachmentsExpired: boolean;
  readonly journalExpired: boolean;
  readonly emailExpired: boolean;
  readonly erased: boolean;
}

export interface Unread {
  readonly mine: number;
  readonly operator?: number | null;
}

export interface Policy {
  readonly messageChars: number;
  readonly attachments: number;
  readonly attachmentBytes: number;
  readonly attachmentTypes: readonly string[];
  readonly guestIntake: boolean;
}
