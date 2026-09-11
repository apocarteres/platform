import type { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import { ApiFailure } from './sanitising-interceptor';
import { problemDetailOf } from './problem-detail';
import type { ProblemDetail } from './problem-detail';

// REQ-API-009
export interface SessionExpiry {
  readonly request: HttpRequest<unknown>;
  readonly problem: ProblemDetail | null;
}

// REQ-API-002, REQ-API-009
export const SESSION_EXPIRED = new InjectionToken<(expiry: SessionExpiry) => void>(
  'apocarteres.http.session-expired',
);

const UNAUTHORIZED = 401;
const UNDECLARED = 'Перехватчик истёкшей сессии подключён, но обработчик не объявлен: '
  + 'объявите провайдер токена SESSION_EXPIRED';

export const sessionExpiredInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const expired = inject(SESSION_EXPIRED, { optional: true });
  return next(request).pipe(
    catchError((failure: unknown) => {
      if (!isUnauthorized(failure)) {
        return throwError(() => failure);
      }
      // REQ-API-002
      if (expired === null) {
        return throwError(() => new Error(UNDECLARED));
      }
      expired({ request, problem: problemOf(failure) });
      return throwError(() => failure);
    }),
  );
};

// REQ-API-009
function problemOf(failure: unknown): ProblemDetail | null {
  if (failure instanceof ApiFailure) {
    return failure.problem;
  }
  if (failure === null || typeof failure !== 'object') {
    return null;
  }
  const candidate = failure as Record<string, unknown>;
  return problemDetailOf(candidate['error'], UNAUTHORIZED);
}

function isUnauthorized(failure: unknown): boolean {
  if (failure instanceof ApiFailure) {
    return failure.problem.status === UNAUTHORIZED;
  }
  return failure !== null
    && typeof failure === 'object'
    && (failure as Record<string, unknown>)['status'] === UNAUTHORIZED;
}
