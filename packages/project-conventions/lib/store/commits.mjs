import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { commitStanding, commitsInRange, ticketsOf } from '../release/commits.mjs';
import { withoutOlderThan } from '../release/cycle.mjs';
import { NOT_A_REPOSITORY, repositoryAt } from '../release/git.mjs';
import { StoreRefusal, StoreUnreachable } from './client.mjs';

// REQ-STORE-014
export const KNOWN_FILE = 'target/store/known-ids.json';

// REQ-STORE-014
export async function knownIds(root) {
  try {
    const parsed = JSON.parse(await readFile(path.join(root, KNOWN_FILE), 'utf8'));
    return new Set(Array.isArray(parsed.ids) ? parsed.ids : []);
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return new Set();
    throw error;
  }
}

async function remember(root, ids) {
  const file = path.join(root, KNOWN_FILE);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ ids: [...ids].sort() }, null, 2)}\n`);
}

// REQ-QUALITY-004, REQ-PROJECT-PROCESS-023, REQ-STORE-014
export async function commitsWithoutATicket(root, range, { config, store, client, strict = false }) {
  if (!await repositoryAt(root)) throw new Error(NOT_A_REPOSITORY);
  const baseline = config.commitRuleSince ?? null;
  if (baseline === null) return { found: [], warnings: [] };
  const commits = await withoutOlderThan(root, await commitsInRange(root, range), baseline);
  const namedBy = (commit) => ticketsOf(commit, [], null, new Set(), store.idPattern);
  const known = await knownIds(root);
  const unknown = [...new Set(commits.flatMap(namedBy))].filter((id) => !known.has(id));
  let unreachable = null;
  const unverified = new Set();
  if (unknown.length > 0) {
    try {
      const { tickets } = await client.lookup(unknown);
      for (const ticket of tickets) for (const name of [ticket.id, ...(ticket.aliases ?? [])]) known.add(name);
      await remember(root, known);
    } catch (failure) {
      if (!(failure instanceof StoreUnreachable) && !(failure instanceof StoreRefusal)) throw failure;
      unreachable = failure.message;
      for (const id of unknown) unverified.add(id);
    }
  }
  const context = {
    members: new Set(), cancelled: new Set(), accounted: [], areas: [], prefix: config.ticketPrefix ?? null, stages: new Set(),
    existing: new Set([...known, ...unverified]), pattern: store.idPattern, records: false,
  };
  const failing = (one) => one.standing === 'не называет задачу' || one.standing === 'задача не заведена';
  const judged = (accounted) => commits
    .map((commit) => ({ ...commit, standing: commitStanding(commit, { ...context, accounted }), named: namedBy(commit)[0] ?? null }));
  let verdicts = judged([]);
  if (verdicts.some(failing)) {
    try {
      const open = await client.openRelease();
      verdicts = judged((open.release?.accounted ?? []).map((row) => row.sha));
    } catch (failure) {
      if (!(failure instanceof StoreUnreachable) && !(failure instanceof StoreRefusal)) throw failure;
      unreachable ??= failure.message;
    }
  }
  const doubtful = verdicts.filter((one) => !failing(one) && one.standing !== 'обслуживает выпуск'
    && namedBy(one).length > 0 && !namedBy(one).some((id) => known.has(id)));
  const warnings = [];
  const found = verdicts.filter(failing);
  if (doubtful.length > 0) {
    const lines = doubtful.map((one) => `${one.sha.slice(0, 8)}: ${one.named} — хранилище недоступно, номер не проверен: «${one.subject}»`);
    if (strict) found.push(...doubtful.map((one) => ({ ...one, standing: 'номер не проверен' })));
    else warnings.push(...lines);
  }
  return { found, warnings, unreachable };
}
