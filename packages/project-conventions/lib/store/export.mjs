import { releaseTag, releases, ticketId, ticketTitle, tickets } from '../release/documents.mjs';
import { loadObligations, readState } from '../release/obligations.mjs';
import { deploymentActions } from '../docs/deployment-actions.mjs';
import { parseFrontMatter } from '../docs/ticket-model.mjs';
import { metadataDeclaration } from '../docs/project-metadata.mjs';
import { ticketFields } from './shape.mjs';

// REQ-STORE-022
export const IMPORT_BATCH = 200;

const list = (value) => (value ?? '').split(',').map((one) => one.trim()).filter(Boolean);
const orNull = (value) => (value === undefined || value === 'unassigned' ? null : value);

function bodyOf(content) {
  const parsed = parseFrontMatter(content);
  return content.split(/\r?\n/).slice(parsed.closingIndex + 1).join('\n').replace(/^\n+/, '');
}

const sectionText = (items) => (items.length === 0 ? null : items.map((item) => `- ${item}`).join('\n'));

// REQ-STORE-006, REQ-STORE-022
export function ticketExport(ticket, projectFields) {
  const metadata = ticket.metadata;
  const body = bodyOf(ticket.content);
  const actions = deploymentActions(body);
  return {
    id: ticketId(ticket),
    aliases: [],
    title: ticketTitle(ticket),
    url: null,
    status: metadata.get('status'),
    priority: orNull(metadata.get('priority')),
    scope: metadata.get('scope') ?? '',
    release: orNull(metadata.get('release')),
    questions: metadata.get('questions') ?? null,
    dependsOn: list(metadata.get('depends-on')),
    related: list(metadata.get('related')),
    obligation: metadata.get('obligation') ?? null,
    supersededBy: metadata.get('superseded-by') ?? null,
    fields: Object.fromEntries([...projectFields.keys()].filter((name) => metadata.has(name)).map((name) => [name, metadata.get(name)])),
    sections: {
      whyNot: /^## Почему не делаем\s*$/m.test(body),
      openQuestions: /^## Открытые вопросы\s*$/m.test(body),
      beforeDeploy: sectionText(actions.before),
      afterDeploy: sectionText(actions.after),
    },
    body,
  };
}

// REQ-STORE-012, REQ-STORE-022
function obligationExport(state, catalogue, exported, releasedOn) {
  const ids = new Set([...Object.keys(state.seen ?? {}), ...Object.keys(state.closed ?? {}), ...Object.keys(state.deferred ?? {})]);
  return [...ids].sort().map((id) => {
    const closed = state.closed?.[id];
    const deferred = state.deferred?.[id];
    const working = exported.find((ticket) => ticket.obligation === id);
    return {
      id,
      ticket: closed?.ticket ?? working?.id ?? null,
      due: catalogue.find((one) => one.id === id)?.dueReleases ?? null,
      seenAtCount: state.seen?.[id] ?? null,
      deferred: deferred === undefined ? null : { reason: deferred.reason ?? '', on: deferred.recordedAt ?? null },
      closed: closed === undefined ? null : { ticket: closed.ticket ?? null, on: releasedOn.get(closed.release) ?? null },
    };
  });
}

// REQ-STORE-022
export async function exportProject(root, config) {
  const scheme = config.release?.scheme ?? 'date';
  const projectFields = new Map([...metadataDeclaration(config).fields].filter(([, field]) => field.types.includes('ticket')));
  const exported = (await tickets(root)).map((ticket) => ticketExport(ticket, projectFields));
  const documents = await releases(root);
  const releasedOn = new Map(documents.map((release) => [release.metadata.get('id'), release.metadata.get('released-on') ?? null]));
  const state = await readState(root);
  const { obligations } = await loadObligations(root);
  return {
    tickets: exported,
    releases: documents.map((release) => ({
      id: release.metadata.get('id'),
      status: release.metadata.get('status'),
      openedOn: release.metadata.get('opened-on') ?? null,
      releasedOn: release.metadata.get('released-on') ?? null,
      commit: release.metadata.get('commit') ?? null,
      tag: releaseTag(release.metadata.get('id'), scheme),
      body: release.content,
    })),
    obligations: obligationExport(state, obligations, exported, releasedOn),
    releasedCount: state.releaseCount ?? 0,
    fields: ticketFields(config),
  };
}

// REQ-STORE-022
export function importRequests(exported) {
  const requests = [];
  for (let start = 0; start < exported.tickets.length; start += IMPORT_BATCH) {
    requests.push({ tickets: exported.tickets.slice(start, start + IMPORT_BATCH) });
  }
  requests.push({
    releases: exported.releases, obligations: exported.obligations, releasedCount: exported.releasedCount, fields: exported.fields,
  });
  return requests;
}
