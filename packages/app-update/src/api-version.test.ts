import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { API_VERSION_HEADER, apiVersionHeader, isApiVersion } from './api-version';
import { provideAppUpdate, UPDATE_IGNORED } from './app-update';

interface Vectors {
  readonly header: string;
  readonly valid: readonly { readonly header: string; readonly version: number }[];
  readonly invalidVersions: readonly number[];
}

const VECTORS = JSON.parse(readFileSync(
  path.resolve(process.cwd(), '../../platform-api-version/src/test/resources/api-version-vectors.json'),
  'utf8',
)) as Vectors;

// REQ-CLIENT-UPDATE-007
describe('общие примеры версии API', () => {
  it('имя заголовка совпадает с сервером', () => {
    expect(API_VERSION_HEADER).toBe(VECTORS.header);
  });

  it('допустимая версия записывается в заголовок так, как его читает сервер', () => {
    for (const { header, version } of VECTORS.valid) {
      expect(isApiVersion(version)).toBe(true);
      expect(apiVersionHeader(version)).toBe(header);
    }
  });

  it('недопустимую версию не принимает объявление механизма', () => {
    for (const version of [...VECTORS.invalidVersions, Number.NaN]) {
      expect(isApiVersion(version)).toBe(false);
      expect(() => provideAppUpdate({ apiVersion: version, available: UPDATE_IGNORED, required: class {} }))
        .toThrowError(/версия API .* недопустима/);
    }
  });
});
