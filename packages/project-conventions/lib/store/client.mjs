import { randomUUID } from 'node:crypto';

// REQ-STORE-004
export const CONTRACT = 1;

// REQ-STORE-005
export const LOOKUP_LIMIT = 500;

const TIMEOUT_MS = 20_000;

// REQ-STORE-008
export class StoreRefusal extends Error {
  constructor(code, detail, status) {
    super(`${detail} (${code})`);
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

// REQ-STORE-014
export class StoreUnreachable extends Error {}

// REQ-STORE-003
function keyOf(store, env, writing) {
  const names = writing ? [store.writeKeyEnv] : [store.readKeyEnv, store.writeKeyEnv];
  for (const name of names.filter((one) => one !== null)) {
    const value = env[name];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  const wanted = names.filter((one) => one !== null);
  if (wanted.length === 0) {
    throw new StoreUnreachable('Ключ записи хранилища не объявлен: назовите переменную окружения полем store.writeKeyEnv в .conventions.json');
  }
  throw new StoreUnreachable(`Ключа хранилища нет в окружении: задайте переменную ${wanted.join(' или ')}`);
}

async function refusalOf(response) {
  const body = await response.json().catch(() => null);
  const code = typeof body?.code === 'string' ? body.code : `http-${response.status}`;
  const detail = body?.reason ?? body?.detail ?? body?.title ?? `хранилище ответило ${response.status}`;
  return new StoreRefusal(code, String(detail), response.status);
}

// REQ-STORE-004
function accepted(body, what) {
  if (body === null || typeof body !== 'object') {
    throw new StoreRefusal('contract-shape', `ответ ${what} не объект JSON`, 200);
  }
  if (body.contract !== CONTRACT) {
    throw new StoreRefusal('contract-version',
      `хранилище исполняет контракт версии ${JSON.stringify(body.contract ?? null)}, а пакету правил нужна версия ${CONTRACT}:`
      + ' обновите хранилище либо пакет правил', 200);
  }
  return body;
}

// REQ-STORE-005, REQ-STORE-007
export function storeClient(store, { env = process.env, fetch: send = globalThis.fetch } = {}) {
  const requests = [];
  let workingSet = null;

  async function call(method, route, { body, writing = false, headers = {} } = {}) {
    const key = keyOf(store, env, writing);
    const request = { method, route, status: null };
    requests.push(request);
    let response;
    try {
      response = await send(`${store.url}${route}`, {
        method,
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${key}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (failure) {
      throw new StoreUnreachable(`Хранилище ${store.url} не отвечает: ${failure.cause?.code ?? failure.name ?? 'сеть'}`);
    }
    request.status = response.status;
    return response;
  }

  return {
    requests,

    // REQ-STORE-005
    async working() {
      const headers = workingSet === null ? {} : { 'if-none-match': `"${workingSet.revision}"` };
      const response = await call('GET', '/tickets/working', { headers });
      if (response.status === 304 && workingSet !== null) return workingSet;
      if (!response.ok) throw await refusalOf(response);
      const body = accepted(await response.json(), 'рабочего набора');
      workingSet = {
        revision: String(body.revision ?? ''),
        fieldsDigest: body.fieldsDigest ?? null,
        tickets: body.tickets ?? [],
        referenced: body.referenced ?? [],
      };
      return workingSet;
    },

    // REQ-STORE-005
    async lookup(ids, { withBody = false } = {}) {
      const unique = [...new Set(ids)];
      const tickets = [];
      const missing = [];
      for (let start = 0; start < unique.length; start += LOOKUP_LIMIT) {
        const response = await call('POST', '/tickets/lookup', { body: { ids: unique.slice(start, start + LOOKUP_LIMIT), ...(withBody ? { withBody: true } : {}) } });
        if (!response.ok) throw await refusalOf(response);
        const body = accepted(await response.json(), 'поиска по номерам');
        tickets.push(...(body.tickets ?? []));
        missing.push(...(body.missing ?? []));
      }
      return { tickets, missing };
    },

    // REQ-STORE-005
    async openRelease() {
      const response = await call('GET', '/releases/open');
      if (!response.ok) throw await refusalOf(response);
      const body = accepted(await response.json(), 'открытого выпуска');
      return {
        release: body.release ?? null,
        releasedCount: body.releasedCount ?? 0,
        obligations: body.obligations ?? [],
      };
    },

    // REQ-STORE-007
    async operate(operation, args = {}, idempotencyKey = null) {
      const response = await call('POST', '/operations', {
        body: { operation, ...args },
        writing: true,
        headers: { 'idempotency-key': idempotencyKey ?? `${operation}:${randomUUID()}` },
      });
      if (!response.ok) throw await refusalOf(response);
      return accepted(await response.json(), `операции ${operation}`);
    },

    // REQ-STORE-022
    async import(part) {
      const response = await call('POST', '/import', { body: { contract: CONTRACT, ...part }, writing: true });
      if (!response.ok) throw await refusalOf(response);
      return accepted(await response.json(), 'импорта');
    },

    // REQ-STORE-003
    canWrite() {
      return store.writeKeyEnv !== null && typeof env[store.writeKeyEnv] === 'string' && env[store.writeKeyEnv].trim() !== '';
    },
  };
}
