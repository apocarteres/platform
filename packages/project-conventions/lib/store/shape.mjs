import { createHash } from 'node:crypto';
import { DEPLOYMENT_STEPS, deploymentActions } from '../docs/deployment-actions.mjs';

// REQ-STORE-006
const SECTION_OF = { before: 'beforeDeploy', after: 'afterDeploy' };

// REQ-STORE-006
export function asDocument(ticket) {
  const metadata = new Map([
    ['id', ticket.id],
    ['type', 'ticket'],
    ['status', ticket.status],
    ['priority', ticket.priority ?? 'unassigned'],
    ['scope', ticket.scope ?? ''],
    ['release', ticket.release ?? 'unassigned'],
  ]);
  if (ticket.questions) metadata.set('questions', ticket.questions);
  if ((ticket.dependsOn ?? []).length > 0) metadata.set('depends-on', ticket.dependsOn.join(', '));
  if (ticket.obligation) metadata.set('obligation', ticket.obligation);
  for (const [name, value] of Object.entries(ticket.fields ?? {})) {
    if (value !== null && value !== undefined) metadata.set(name, String(value));
  }
  const lines = [`# ${ticket.title ?? ticket.id}`, ''];
  for (const step of DEPLOYMENT_STEPS) {
    const text = ticket.sections?.[SECTION_OF[step.key]];
    if (typeof text === 'string' && text.trim() !== '') lines.push(`## ${step.title}`, '', text.trim(), '');
  }
  return {
    file: null,
    name: ticket.id,
    content: lines.join('\n'),
    metadata,
    aliases: ticket.aliases ?? [],
    title: ticket.title ?? ticket.id,
    url: ticket.url ?? null,
  };
}

// REQ-STORE-006
export function namesOf(document) {
  return [document.metadata.get('id'), ...document.aliases];
}

// REQ-RELEASE-049, REQ-STORE-010
export function actionsOf(composition, recorded = []) {
  const actions = [];
  for (const ticket of composition) {
    const id = ticket.metadata.get('id');
    const own = deploymentActions(ticket.content);
    for (const step of DEPLOYMENT_STEPS) {
      own[step.key].forEach((text, index) => {
        const kept = recorded.find((one) => one.done && one.ticket === id && one.step === step.key && one.text === text);
        actions.push({
          ticket: id, step: step.key, item: index + 1, text,
          done: kept !== undefined,
          note: kept?.note ?? null,
        });
      });
    }
  }
  return actions;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

// REQ-STORE-018
export function ticketFields(config) {
  const declared = config.metadata?.fields ?? {};
  return Object.fromEntries(Object.entries(declared).filter(([, field]) => (field?.types ?? []).includes('ticket')));
}

// REQ-STORE-018
export function fieldsDigest(fields) {
  return createHash('sha256').update(JSON.stringify(canonical(fields)), 'utf8').digest('hex');
}

// REQ-STORE-011
const MANIFEST_MARK = 'Conventions-manifest: 1';

// REQ-STORE-011
export function manifestMessage(manifest) {
  return [`Выпуск ${manifest.release}`, '', MANIFEST_MARK, JSON.stringify(manifest)].join('\n');
}

// REQ-STORE-011
export function manifestOf(message) {
  const lines = (message ?? '').split('\n');
  const mark = lines.findIndex((line) => line.trim() === MANIFEST_MARK);
  if (mark === -1) return null;
  try {
    const parsed = JSON.parse(lines.slice(mark + 1).join('\n').trim());
    return typeof parsed?.release === 'string' && typeof parsed?.commit === 'string' ? parsed : null;
  } catch {
    return null;
  }
}
