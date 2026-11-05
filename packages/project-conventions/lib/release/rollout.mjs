import { shipsResult, ticketId, ticketLinkTarget } from './documents.mjs';

const dependencies = (ticket) => (ticket.metadata.get('depends-on') ?? '').split(',').map((one) => one.trim()).filter(Boolean);

// REQ-RELEASE-050
export function dependencyProblems(composition, everyTicket, existing) {
  const members = new Set(composition.map(ticketId));
  const byId = new Map(everyTicket.map((ticket) => [ticketId(ticket), ticket]));
  const released = new Set(existing.filter((release) => release.metadata.get('status') === 'released').map((release) => release.metadata.get('id')));
  const problems = [];
  for (const ticket of composition) {
    const id = ticketId(ticket);
    for (const target of dependencies(ticket)) {
      const dependency = byId.get(target);
      if (dependency === undefined || members.has(target)) continue;
      const status = dependency.metadata.get('status');
      const release = dependency.metadata.get('release') ?? 'unassigned';
      if (status === 'cancelled' || status === 'superseded') {
        problems.push(`Задача ${id} состава зависит от ${target}, а та ${status === 'cancelled' ? 'отменена' : 'заменена'} (${status}):`
          + ` снимите зависимость из depends-on задачи ${id} или перенаправьте её на задачу, которая выходит`);
      } else if (!shipsResult(dependency) || !(released.has(release) || release === 'before-cycle')) {
        problems.push(`Задача ${id} состава зависит от ${target}, которая не выпущена и в состав не входит (${status}, release: ${release}):`
          + ` доведите ${target} до выполненного состояния, чтобы она вышла в этом же выпуске, либо снимите ${id} из состава командой release drop с причиной`);
      }
    }
  }
  try {
    rolloutSteps(composition);
  } catch (error) {
    problems.push(`${error.message}: порядок раската не определён — снимите одну из связей depends-on`);
  }
  return problems;
}

// REQ-RELEASE-050
export function rolloutSteps(composition) {
  const byId = new Map(composition.map((ticket) => [ticketId(ticket), ticket]));
  const steps = new Map();
  const step = (id, trail) => {
    if (steps.has(id)) return steps.get(id);
    if (trail.has(id)) throw new Error(`Цикл зависимостей в составе: ${[...trail, id].join(' → ')}`);
    const own = dependencies(byId.get(id)).filter((target) => byId.has(target));
    const value = 1 + Math.max(0, ...own.map((target) => step(target, new Set([...trail, id]))));
    steps.set(id, value);
    return value;
  };
  for (const id of byId.keys()) step(id, new Set());
  return steps;
}

// REQ-RELEASE-050
export function inRolloutOrder(composition) {
  const steps = rolloutSteps(composition);
  return composition.map((ticket, index) => ({ ticket, index }))
    .sort((left, right) => steps.get(ticketId(left.ticket)) - steps.get(ticketId(right.ticket)) || left.index - right.index)
    .map((entry) => entry.ticket);
}

// REQ-RELEASE-021, REQ-RELEASE-050
export function compositionRows(root, composition) {
  const steps = rolloutSteps(composition);
  return [
    '| Задача | Причина включения | Порядок |',
    '|---|---|---|',
    ...inRolloutOrder(composition).map((ticket) => {
      const obligation = ticket.metadata.get('obligation');
      const reason = obligation === undefined
        ? (ticket.metadata.get('priority') === 'unassigned'
          ? 'Закрыта в этом выпуске'
          : `Закрыта в этом выпуске, приоритет ${ticket.metadata.get('priority')}`)
        : `Обязательство ядра \`${obligation}\`, закрыто в этом выпуске`;
      return `| [${ticketId(ticket)}](${ticketLinkTarget(root, ticket)}) | ${reason} | ${steps.get(ticketId(ticket))} |`;
    }),
  ];
}
