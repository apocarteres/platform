import type { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import type { Observable } from 'rxjs';
import { problemDetailOf } from './problem-detail';
import type { ProblemDetail } from './problem-detail';

// REQ-API-001, REQ-API-003
export class ApiFailure extends Error {
  constructor(readonly problem: ProblemDetail) {
    super(problem.code);
    this.name = 'ApiFailure';
  }

  // REQ-API-007
  get extensions(): Readonly<Record<string, unknown>> {
    return this.problem.extensions;
  }
}

const UNEXPECTED = 'unexpected';

export const sanitisingInterceptor: HttpInterceptorFn = (
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> => next(request).pipe(
  catchError((failure: unknown) => throwError(() => apiFailureOf(failure))),
);

function apiFailureOf(failure: unknown): unknown {
  if (!isHttpErrorResponse(failure)) {
    return failure;
  }
  const parsed = problemDetailOf(failure.error, failure.status);
  return new ApiFailure(parsed ?? opaqueProblem(failure));
}

// REQ-API-003
function opaqueProblem(failure: HttpErrorResponse): ProblemDetail {
  return {
    type: 'about:blank',
    title: failure.statusText,
    status: failure.status,
    detail: '',
    instance: failure.url ?? undefined,
    code: UNEXPECTED,
    extensions: {},
  };
}

function isHttpErrorResponse(failure: unknown): failure is HttpErrorResponse {
  if (failure === null || typeof failure !== 'object') {
    return false;
  }
  const candidate = failure as Record<string, unknown>;
  return typeof candidate['status'] === 'number' && 'error' in candidate;
}
