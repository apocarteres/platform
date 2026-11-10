import { createHash } from 'node:crypto';
import { createServer } from 'node:http';

const TERMINAL = new Set(['cancelled', 'superseded']);
const UNFROZEN = new Set(['unfreezeRelease', 'closeRelease', 'recloseRelease', 'defineFields']);

class Refusal extends Error {
  constructor(code, detail, status = 409) {
    super(detail);
    this.code = code;
    this.status = status;
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

const digestOf = (value) => createHash('sha256').update(JSON.stringify(canonical(value)), 'utf8').digest('hex');

export function ticketForm(id, overrides = {}) {
  return {
    id, aliases: [], title: `Задача ${id}`, url: `https://tracker.example/${id}`, status: 'backlog', priority: 'P2', scope: 'quality',
    release: null, questions: null, dependsOn: [], related: [], obligation: null, supersededBy: null, fields: {},
    sections: { whyNot: false, openQuestions: false, beforeDeploy: null, afterDeploy: null },
    ...overrides,
  };
}

export async function fakeStore({ key = 'DEMO', today = '2026-11-12', readKey = 'read-key', writeKey = 'write-key', contract = 1 } = {}) {
  const state = {
    tickets: new Map(), releases: [], obligations: new Map(), releasedCount: 0, fields: null, answers: new Map(), next: 1,
    requests: [], contract, down: false,
  };
  const open = () => state.releases.find((release) => ['draft', 'closing', 'in_progress', 'blocked'].includes(release.status)) ?? null;
  const released = (id) => id === 'before-cycle' || state.releases.some((release) => release.id === id && release.status === 'released')
    || !state.releases.some((release) => release.id === id);
  const find = (name) => [...state.tickets.values()].find((ticket) => ticket.id === name || ticket.aliases.includes(name)) ?? null;
  const inWorking = (ticket) => !TERMINAL.has(ticket.status) && !(ticket.status === 'done' && ticket.release !== null && released(ticket.release));
  const required = (value, what) => {
    if (typeof value !== 'string' || value.trim() === '') throw new Refusal('reason-required', `${what} требует причины`, 422);
  };
  const draft = (what) => {
    const release = open();
    if (release === null) throw new Refusal('release-not-open', `${what}: открытого выпуска нет`);
    if (release.status === 'closing') throw new Refusal('release-closing', `${what}: выпуск ${release.id} заморожен закрытием`);
    return release;
  };

  function working() {
    const tickets = [...state.tickets.values()].filter(inWorking);
    const inside = new Set(tickets.map((ticket) => ticket.id));
    const referenced = [...new Set(tickets.flatMap((ticket) => ticket.dependsOn))]
      .map(find).filter((ticket) => ticket !== null && !inside.has(ticket.id));
    const body = { tickets, referenced, fieldsDigest: state.fields === null ? null : digestOf(state.fields) };
    return { contract: state.contract, revision: digestOf(body).slice(0, 16), ...body };
  }

  const view = () => ({
    contract: state.contract,
    releasedCount: state.releasedCount,
    release: open(),
    obligations: [...state.obligations.values()],
  });

  const OPERATIONS = {
    openRelease({ id, tickets = [] }) {
      const already = open();
      if (already !== null) throw new Refusal('release-already-open', `выпуск ${already.id} уже открыт`);
      const [year, month] = today.split('-');
      const prefix = `RELEASE-${year}-${month}-`;
      const ordinal = 1 + Math.max(0, ...state.releases.filter((one) => one.id.startsWith(prefix)).map((one) => Number(one.id.slice(prefix.length))));
      const releaseId = id ?? `${prefix}${ordinal}`;
      if (state.releases.some((one) => one.id === releaseId)) throw new Refusal('release-id-taken', `номер ${releaseId} занят`);
      const named = tickets.map((name) => {
        const ticket = find(name);
        if (ticket === null) throw new Refusal('ticket-missing', `задачи ${name} нет`, 404);
        if (ticket.release !== null) throw new Refusal('ticket-in-release', `задача ${name} уже отнесена к ${ticket.release}`);
        return ticket;
      });
      for (const ticket of named) ticket.release = releaseId;
      state.releases.push({
        id: releaseId, status: 'draft', openedOn: today, named: named.map((ticket) => ticket.id), dropped: [], accounted: [], actions: [],
        result: null, retagged: [],
      });
    },
    dropTicket({ ticket: name, reason }) {
      const release = draft('снятие задачи');
      if (release.status !== 'draft') throw new Refusal('release-not-open', 'состав меняется только у выпуска в draft');
      required(reason, 'снятие задачи');
      const ticket = find(name);
      if (ticket === null || ticket.release !== release.id) throw new Refusal('ticket-missing', `задачи ${name} в составе нет`, 404);
      if (ticket.obligation !== null) throw new Refusal('ticket-is-obligation', `задача ${name} материализует обязательство`);
      ticket.release = null;
      release.named = release.named.filter((id) => id !== ticket.id);
      release.dropped.push({ ticket: ticket.id, reason, on: today });
    },
    cancelRelease({ reason }) {
      const release = draft('отмена выпуска');
      required(reason, 'отмена выпуска');
      release.status = 'cancelled';
      release.result = { cancelled: reason };
      for (const ticket of state.tickets.values()) if (ticket.release === release.id) ticket.release = null;
    },
    accountCommit({ sha, subject, reason }) {
      const release = draft('учёт коммита');
      if (release.status !== 'draft') throw new Refusal('release-not-open', 'учтённые коммиты меняются только у выпуска в draft');
      required(reason, 'учёт коммита');
      release.accounted.push({ sha, subject, reason });
    },
    markAction({ ticket, step, item, done, note }) {
      const release = draft('отметка действия');
      const action = release.actions.find((one) => one.ticket === ticket && one.step === step && one.item === item);
      if (action === undefined) throw new Refusal('ticket-missing', `действия ${step} №${item} у задачи ${ticket} нет`, 404);
      action.done = done;
      action.note = note;
    },
    deferObligation({ id, reason }) {
      required(reason, 'перенос обязательства');
      const record = state.obligations.get(id);
      if (record === undefined) throw new Refusal('ticket-missing', `обязательства ${id} в учёте нет`, 404);
      if (state.releasedCount - record.seenAtCount >= record.due) throw new Refusal('obligation-overdue', `обязательство ${id} просрочено`);
      record.deferred = { reason, on: today };
    },
    satisfyObligation({ id, ticket: name }) {
      const evidence = find(name);
      if (evidence === null) throw new Refusal('ticket-missing', `задачи ${name} нет`, 404);
      if (evidence.status !== 'done') throw new Refusal('evidence-not-done', `задача ${name} не выполнена`);
      for (const ticket of state.tickets.values()) {
        if (ticket.obligation === id && ticket.status !== 'done' && !TERMINAL.has(ticket.status)) {
          ticket.status = 'superseded';
          ticket.supersededBy = evidence.id;
          ticket.release = null;
        }
      }
      const record = state.obligations.get(id) ?? { id, ticket: evidence.id, due: 0, seenAtCount: state.releasedCount, deferred: null, closed: null };
      state.obligations.set(id, { ...record, deferred: null, closed: { ticket: evidence.id, on: today } });
    },
    freezeRelease() {
      const release = draft('заморозка');
      release.frozenFrom = release.status;
      release.status = 'closing';
      state.afterFreeze?.();
    },
    unfreezeRelease({ reason }) {
      required(reason, 'снятие заморозки');
      const release = open();
      if (release?.status !== 'closing') throw new Refusal('release-not-open', 'замороженного выпуска нет');
      release.status = release.frozenFrom;
    },
    defineFields({ fields }) {
      state.fields = fields;
    },
    takeObligations({ obligations }) {
      const release = draft('взятие обязательств');
      for (const one of obligations) {
        let ticket = [...state.tickets.values()].find((item) => item.obligation === one.id && !TERMINAL.has(item.status) && item.status !== 'done');
        if (ticket === undefined) {
          ticket = ticketForm(`${key}-${state.next}`, { title: one.title, priority: one.priority, scope: one.scope, obligation: one.id });
          state.next += 1;
          state.tickets.set(ticket.id, ticket);
        }
        ticket.release = release.id;
        const record = state.obligations.get(one.id);
        if (record === undefined || record.closed !== null) {
          state.obligations.set(one.id, { id: one.id, ticket: ticket.id, due: one.due, seenAtCount: state.releasedCount, deferred: null, closed: null });
        } else record.ticket = ticket.id;
      }
    },
    closeRelease(args) {
      const release = open();
      if (release === null || !['closing', 'draft'].includes(release.status)) throw new Refusal('release-not-open', 'закрывается выпуск в draft или closing');
      settle(release, args);
    },
    recloseRelease(args) {
      const release = open();
      if (release?.status !== 'closing' || release.frozenFrom !== 'in_progress') throw new Refusal('release-not-open', 'перезакрывается замороженный выпуск после первого шага');
      release.retagged.push({ from: release.result.commit, to: args.commit, reason: args.reason });
      settle(release, args);
    },
    finishRelease({ note, closedObligations = [] }) {
      const release = draft('завершающий шаг');
      if (release.status !== 'in_progress') throw new Refusal('release-not-open', 'завершается выпуск после первого шага закрытия');
      release.status = 'released';
      release.result = { ...release.result, note, releasedOn: today };
      state.releasedCount += 1;
      for (const closed of closedObligations) {
        const record = state.obligations.get(closed.id);
        if (record !== undefined) Object.assign(record, { deferred: null, closed: { ticket: closed.ticket, on: today } });
      }
    },
  };

  function settle(release, { commit, tag, composition, actions, receipt }) {
    const members = new Set(composition);
    for (const ticket of state.tickets.values()) {
      if (members.has(ticket.id)) ticket.release = release.id;
      else if (ticket.release === release.id && ticket.status !== 'done') ticket.release = null;
    }
    release.actions = actions;
    release.result = { commit, tag, receipt };
    release.status = 'in_progress';
  }

  function operate(body, idempotencyKey) {
    if (idempotencyKey && state.answers.has(idempotencyKey)) return state.answers.get(idempotencyKey);
    const { operation, ...args } = body;
    if (!Object.hasOwn(OPERATIONS, operation)) throw new Refusal('operation-unknown', `операции ${operation} нет`, 400);
    if (open()?.status === 'closing' && !UNFROZEN.has(operation)) {
      throw new Refusal('release-closing', `выпуск ${open().id} заморожен закрытием`);
    }
    if (state.failOperation === operation) {
      state.failOperation = null;
      throw new Refusal('store-down', 'хранилище временно недоступно', 503);
    }
    const touched = open();
    OPERATIONS[operation](args);
    const answer = { contract: state.contract, release: JSON.parse(JSON.stringify(open() ?? touched)) };
    if (idempotencyKey) state.answers.set(idempotencyKey, answer);
    return answer;
  }

  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const route = request.url.replace(/^\/api\/conventions\/[^/]+/, '');
      const send = (status, body, headers = {}) => {
        const text = body === null ? '' : JSON.stringify(body);
        state.requests.push({ method: request.method, route, status, bytes: text.length, operation: null });
        response.writeHead(status, { 'content-type': status >= 400 ? 'application/problem+json' : 'application/json', ...headers });
        response.end(text);
      };
      try {
        const token = (request.headers.authorization ?? '').replace(/^Bearer /, '');
        if (token !== readKey && token !== writeKey) throw new Refusal('unauthorized', 'ключ не принят', 401);
        const body = chunks.length === 0 ? null : JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (request.method === 'GET' && route === '/tickets/working') {
          const set = working();
          const etag = `"${set.revision}"`;
          if (request.headers['if-none-match'] === etag) send(304, null, { etag });
          else send(200, set, { etag });
        } else if (request.method === 'POST' && route === '/tickets/lookup') {
          if (body.ids.length > 500) throw new Refusal('lookup-too-large', 'не больше 500 номеров', 422);
          const tickets = [...new Set(body.ids.map(find).filter((ticket) => ticket !== null))];
          send(200, { contract: state.contract, tickets, missing: body.ids.filter((name) => find(name) === null) });
        } else if (request.method === 'GET' && route === '/releases/open') {
          send(200, view());
        } else if (request.method === 'POST' && route === '/operations') {
          if (token !== writeKey) throw new Refusal('forbidden', 'операция требует ключа записи', 403);
          const answer = operate(body, request.headers['idempotency-key']);
          send(200, answer);
          state.requests.at(-1).operation = body.operation;
        } else if (request.method === 'POST' && route === '/import') {
          if (token !== writeKey) throw new Refusal('forbidden', 'импорт требует ключа записи', 403);
          if (open() !== null) throw new Refusal('release-already-open', 'импорт выполняется между выпусками');
          for (const ticket of body.tickets ?? []) {
            if (state.dropOnImport === ticket.id) continue;
            const { body: text, ...form } = ticket;
            state.tickets.set(ticket.id, { ...ticketForm(ticket.id), ...form, text });
          }
          for (const release of body.releases ?? []) {
            state.releases = state.releases.filter((one) => one.id !== release.id);
            state.releases.push({ named: [], dropped: [], accounted: [], actions: [], result: null, retagged: [], ...release });
          }
          for (const record of body.obligations ?? []) state.obligations.set(record.id, record);
          if (body.releasedCount !== undefined) state.releasedCount = body.releasedCount;
          if (body.fields !== undefined) state.fields = body.fields;
          send(200, { contract: state.contract, tickets: (body.tickets ?? []).map((one) => one.id), releases: (body.releases ?? []).map((one) => one.id) });
        } else throw new Refusal('not-found', 'нет такого адреса', 404);
      } catch (failure) {
        if (!(failure instanceof Refusal)) throw failure;
        send(failure.status, { type: 'about:blank', title: 'Conflict', detail: 'Conflict', reason: failure.message, code: failure.code });
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/conventions/${key}`;

  return {
    url, readKey, writeKey, state, open, find,
    add(id, overrides = {}) {
      const ticket = ticketForm(id, overrides);
      state.tickets.set(id, ticket);
      return ticket;
    },
    setStatus(id, status) {
      const ticket = find(id);
      const release = open();
      if (release?.status === 'closing' && (ticket.release === release.id || (ticket.release === null && ticket.status === 'done'))) {
        throw new Refusal('release-closing', `выпуск ${release.id} заморожен закрытием`);
      }
      ticket.status = status;
    },
    operate: (operation, args = {}) => operate({ operation, ...args }, null),
    operationsSeen: () => state.requests.filter((one) => one.operation !== null).map((one) => one.operation),
    stop: () => new Promise((resolve) => server.close(resolve)),
  };
}
