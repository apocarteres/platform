// REQ-CLIENT-UPDATE-006
export const API_VERSION_HEADER = 'X-Api-Version';

// REQ-CLIENT-UPDATE-006
export const OUTDATED_CODE = 'client-outdated';

// REQ-CLIENT-UPDATE-007
const HIGHEST = 999_999_999;

// REQ-CLIENT-UPDATE-007
export function isApiVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= HIGHEST;
}

// REQ-CLIENT-UPDATE-007
export function apiVersionHeader(version: number): string {
  if (!isApiVersion(version)) {
    throw new Error(`Версия API ${String(version)} недопустима: целое число от 1 до ${HIGHEST}`);
  }
  return String(version);
}
