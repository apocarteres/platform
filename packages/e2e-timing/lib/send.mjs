// REQ-E2E-TIMING-005, REQ-E2E-TIMING-006
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);
export const SEND_TIMEOUT_MS = 10_000;

export function sendTarget(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  return u.protocol === 'https:' || (u.protocol === 'http:' && LOCAL.has(u.hostname)) ? u : null;
}

export async function send(line, env = process.env, fetchImpl = fetch) {
  const url = (env['E2E_TIMING_URL'] ?? '').trim();
  if (!url) return '[e2e-timing] наблюдение не задано (E2E_TIMING_URL) — только файлы';
  const target = sendTarget(url);
  if (!target) return '[e2e-timing] не отправлено: E2E_TIMING_URL — только https (http — только localhost)';
  const headers = { 'Content-Type': 'application/json' };
  const tokenFile = (env['E2E_TIMING_TOKEN_FILE'] ?? '').trim();
  try {
    if (tokenFile) headers['Authorization'] = 'Bearer ' + readFileSync(tokenFile.replace(/^~(?=\/)/, homedir()), 'utf8').trim();
    const r = await fetchImpl(target, { method: 'POST', headers, body: line, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
    return r.ok ? `[e2e-timing] отправлено в наблюдение: ${r.status}` : `[e2e-timing] не отправлено в наблюдение: HTTP ${r.status}`;
  } catch (e) {
    return `[e2e-timing] не отправлено в наблюдение: ${e?.name ?? 'Error'}: ${e?.message ?? e}`;
  }
}
