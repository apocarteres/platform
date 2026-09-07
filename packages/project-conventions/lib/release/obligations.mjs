import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// REQ-RELEASE-012, REQ-RELEASE-015
export const STATE_FILE = '.conventions/obligations.json';
export const DIRECTIVE = 'директива';

const packageRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

// REQ-RELEASE-012
export async function loadObligations(root) {
  const candidates = [
    { file: path.join(root, 'packages/project-conventions/obligations.json'), core: true },
    { file: path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'), core: false },
    { file: path.join(packageRoot, 'obligations.json'), core: false },
  ];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(await readFile(candidate.file, 'utf8'));
      return { obligations: parsed.obligations, isCore: candidate.core };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return { obligations: [], isCore: false };
}

export async function declaredObligations(root) {
  return (await loadObligations(root)).obligations;
}

export async function readState(root) {
  try {
    return JSON.parse(await readFile(path.join(root, STATE_FILE), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { releaseCount: 0, seen: {}, closed: {}, deferred: {} };
  }
}

export async function writeState(root, state) {
  const file = path.join(root, STATE_FILE);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(state, null, 2)}\n`);
}

export function obligationState(obligation, state) {
  if (state.closed?.[obligation.id]) return { status: 'closed', ...state.closed[obligation.id] };
  const seenAt = state.seen?.[obligation.id];
  if (seenAt === undefined) return { status: 'new' };
  const elapsed = (state.releaseCount ?? 0) - seenAt;
  return {
    status: elapsed >= obligation.dueReleases ? 'overdue' : 'open',
    seenAt,
    elapsed,
    remaining: obligation.dueReleases - elapsed,
    deferral: state.deferred?.[obligation.id],
  };
}

export function directiveObligations(obligations) {
  return obligations.filter((obligation) => obligation.level === DIRECTIVE);
}

export function overdueObligations(obligations, state, isCore = false) {
  if (isCore) return [];
  return directiveObligations(obligations)
    .map((obligation) => ({ obligation, state: obligationState(obligation, state) }))
    .filter((entry) => entry.state.status === 'overdue');
}

export function pendingObligations(obligations, state, isCore = false) {
  if (isCore) return [];
  return directiveObligations(obligations)
    .map((obligation) => ({ obligation, state: obligationState(obligation, state) }))
    .filter((entry) => entry.state.status !== 'closed');
}
