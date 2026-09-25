import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTRACT, COPY, TYPES, contractTypes } from '../scripts/contract-types.mjs';

// REQ-NOTIFICATIONS-008
describe('типы клиента из контракта', () => {
  it('файл типов совпадает с тем, что даёт контракт: npm run contract-types после правки контракта', () => {
    expect(readFileSync(TYPES, 'utf8')).toBe(contractTypes(JSON.parse(readFileSync(CONTRACT, 'utf8'))));
  });

  it('копия контракта в пакете совпадает с контрактом platform-notifications', () => {
    expect(readFileSync(COPY, 'utf8')).toBe(readFileSync(CONTRACT, 'utf8'));
  });
});
