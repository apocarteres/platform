import type { HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { InjectionToken, inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import { ApiFailure } from './sanitising-interceptor';

// REQ-API-002
export const SESSION_EXPIRED = new InjectionToken<() => void>('apocarteres.http.session-expired');

const UNAUTHORIZED = 401;

export const sessionExpiredInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => {
  const expired = inject(SESSION_EXPIRED, { optional: true });
  return next(request).pipe(
    catchError((failure: unknown) => {
      if (expired !== null && isUnauthorized(failure)) {
        expired();
      }
      return throwError(() => failure);
    }),
  );
};

function isUnauthorized(failure: unknown): boolean {
  if (failure instanceof ApiFailure) {
    return failure.problem.status === UNAUTHORIZED;
  }
  return failure !== null
    && typeof failure === 'object'
    && (failure as Record<string, unknown>)['status'] === UNAUTHORIZED;
}
