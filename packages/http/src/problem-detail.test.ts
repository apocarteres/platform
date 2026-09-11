import { expect, test } from 'vitest';
import { problemDetailOf } from './problem-detail';
import type { ProblemDetail } from './problem-detail';
import { ApiFailure } from './sanitising-interceptor';

// REQ-API-001
test('тело с кодом разбирается в ProblemDetail', () => {
  const parsed = problemDetailOf({
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: 'Not Found',
    instance: '/players/17',
    code: 'player-absent',
  }, 404);

  expect(parsed).toEqual({
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: 'Not Found',
    instance: '/players/17',
    code: 'player-absent',
    extensions: {},
  });
});

test('тело без кода контрактом не считается', () => {
  expect(problemDetailOf({ title: 'Not Found', status: 404 }, 404)).toBeNull();
  expect(problemDetailOf({ code: '' }, 400)).toBeNull();
  expect(problemDetailOf('отказ шлюза', 502)).toBeNull();
  expect(problemDetailOf(null, 500)).toBeNull();
});

test('статус ответа подставляется, когда в теле его нет', () => {
  const parsed = problemDetailOf({ code: 'unexpected' }, 500);
  expect(parsed?.status).toBe(500);
  expect(parsed?.type).toBe('about:blank');
  expect(parsed?.instance).toBeUndefined();
});

// REQ-API-007
test('поля расширения сохраняются рядом с обязательными', () => {
  const parsed = problemDetailOf({
    type: 'about:blank',
    title: 'Conflict',
    status: 409,
    detail: 'Недостаточно остатка',
    code: 'stock-short',
    requestedQuantity: 12,
    availableQuantity: 5,
    blockedItems: ['a-1', 'a-2'],
  }, 409);

  expect(parsed?.extensions).toEqual({
    requestedQuantity: 12,
    availableQuantity: 5,
    blockedItems: ['a-1', 'a-2'],
  });
  expect(parsed?.code).toBe('stock-short');
  expect(parsed?.detail).toBe('Недостаточно остатка');
});

// REQ-API-007
test('без собственных полей расширения пусты, а не отсутствуют', () => {
  expect(problemDetailOf({ code: 'unexpected' }, 500)?.extensions).toEqual({});
});

// REQ-PUBLISHING-004
test('ProblemDetail без расширений остаётся допустимым значением типа', () => {
  const handmade: ProblemDetail = {
    type: 'about:blank', title: 'Not Found', status: 404, detail: '', code: 'player-absent',
  };
  expect(new ApiFailure(handmade).extensions).toEqual({});
});
