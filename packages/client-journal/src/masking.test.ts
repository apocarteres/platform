import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import { MASK, MASK_INPUT_LIMIT, barePath, masked } from './masking';

interface Vectors {
  readonly mask: string;
  readonly masked: readonly { readonly input: string; readonly output: string }[];
  readonly paths: readonly { readonly url: string; readonly path: string }[];
}

const VECTORS = JSON.parse(readFileSync(path.resolve(process.cwd(), 'masking-vectors.json'), 'utf8')) as Vectors;

// REQ-CLIENT-JOURNAL-005
describe('общие примеры маскирования', () => {
  it('знак маски совпадает с общим', () => {
    expect(MASK).toBe(VECTORS.mask);
  });

  it('маскирование даёт записанный результат', () => {
    for (const { input, output } of VECTORS.masked) expect(masked(input), input).toBe(output);
  });

  it('от адреса остаётся путь без источника, строки запроса и фрагмента', () => {
    for (const { url, path: bare } of VECTORS.paths) expect(barePath(url), url).toBe(bare);
  });
});

// REQ-CLIENT-JOURNAL-004
describe('работа маскирования ограничена', () => {
  it('текст длиннее предела обрезается до маскирования', () => {
    const long = `${'a '.repeat(MASK_INPUT_LIMIT)}ivan@example.org`;
    const result = masked(long);
    expect(result.length).toBe(MASK_INPUT_LIMIT);
    expect(result).not.toContain('@');
  });
});
