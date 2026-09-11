import { expect, test } from 'vitest';
import { unknownErrorCodes, unusedErrorCodes } from './error-codes';

// REQ-API-002
test('код сервера без словарной статьи назван', () => {
  expect(unknownErrorCodes(['player-absent', 'unexpected'], ['unexpected'])).toEqual(['player-absent']);
  expect(unknownErrorCodes(['unexpected'], ['unexpected', 'player-absent'])).toEqual([]);
});

test('статья словаря, которой не отвечает ни один код, названа', () => {
  expect(unusedErrorCodes(['unexpected'], ['unexpected', 'player-absent'])).toEqual(['player-absent']);
});

test('повторы не размножают ответ', () => {
  expect(unknownErrorCodes(['a', 'a', 'b'], [])).toEqual(['a', 'b']);
});
