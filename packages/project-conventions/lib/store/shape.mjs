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
    conditions: conditionsOf(ticket),
  };
}

// REQ-STORE-025
export const PHASES = ['before-release', 'after-release'];
// REQ-STORE-025
export const STATES = ['pending', 'done', 'not-required'];

// REQ-STORE-025
function conditionsOf(ticket) {
  return (Array.isArray(ticket.conditions) ? ticket.conditions : [])
    .map((one) => ({ key: String(one?.key ?? ''), phase: String(one?.phase ?? ''), state: String(one?.state ?? '') }));
}

// REQ-STORE-025
export function pendingBefore(document) {
  return document.conditions.filter((one) => one.phase === 'before-release' && one.state === 'pending');
}

// REQ-STORE-006
export function namesOf(document) {
  return [document.metadata.get('id'), ...document.aliases];
}

// REQ-RELEASE-052
const spaced = (text) => text.replace(/\s+/g, ' ').trim();

// REQ-RELEASE-049, REQ-STORE-010, REQ-RELEASE-052
export function actionsOf(composition, recorded = []) {
  const actions = [];
  for (const ticket of composition) {
    const id = ticket.metadata.get('id');
    const own = deploymentActions(ticket.content);
    for (const step of DEPLOYMENT_STEPS) {
      own[step.key].forEach((text, index) => {
        const item = index + 1;
        const kept = recorded.find((one) => one.done && one.ticket === id && one.step === step.key && Number(one.item) === item);
        const recordedText = typeof kept?.text === 'string' && spaced(kept.text) !== spaced(text) ? { recorded: kept.text } : {};
        actions.push({
          ticket: id, step: step.key, item, text,
          done: kept !== undefined,
          note: kept?.note ?? null,
          ...recordedText,
        });
      });
    }
  }
  return actions;
}

// REQ-STORE-022
export function ticketFields(config) {
  const declared = config.metadata?.fields ?? {};
  return Object.fromEntries(Object.entries(declared).filter(([, field]) => (field?.types ?? []).includes('ticket')));
}

// REQ-STORE-011, REQ-STORE-025
export function manifestComposition(composition) {
  return composition.map((ticket) => ({
    id: ticket.metadata.get('id'),
    title: ticket.title,
    ...(ticket.conditions.length > 0 ? { conditions: ticket.conditions } : {}),
  }));
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
