import { expect, test } from 'vitest';
import { problemDetailOf } from './problem-detail';

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
