import { DEPLOYMENT_STEPS, deploymentActions } from '../docs/deployment-actions.mjs';
import { openRelease, releaseTag, replaceSection, sectionLines, ticketId, ticketLinkTarget, writeDocument } from './documents.mjs';
import { tagCommit } from './git.mjs';

// REQ-RELEASE-049
export const EXIT_CRITERIA = '## Критерии выхода';

// REQ-RELEASE-049
const ACTION_LINE = /^- \[( |x)\] (До развёртывания|После развёртывания), \[([^\]]+)\]\([^)]*\): (.*)$/;

const stepOf = (title) => DEPLOYMENT_STEPS.find((step) => step.title === title).key;
const titleOf = (key) => DEPLOYMENT_STEPS.find((step) => step.key === key).title;

function parsed(line, index) {
  const match = ACTION_LINE.exec(line);
  if (!match) return null;
  return { line, index, marked: match[1] === 'x', step: stepOf(match[2]), ticket: match[3], rest: match[4] };
}

// REQ-RELEASE-049
export function recordedActions(criteria) {
  return criteria.map(parsed).filter((entry) => entry !== null);
}

// REQ-RELEASE-049
export function collectedActions(root, composition, content) {
  const recorded = recordedActions(sectionLines(content, EXIT_CRITERIA));
  const collected = { before: [], after: [] };
  for (const ticket of composition) {
    const id = ticketId(ticket);
    const actions = deploymentActions(ticket.content);
    for (const step of DEPLOYMENT_STEPS) {
      for (const text of actions[step.key]) {
        const kept = recorded.find((entry) => entry.marked && entry.step === step.key && entry.ticket === id
          && (entry.rest === text || entry.rest.startsWith(`${text} — `)));
        collected[step.key].push(kept === undefined
          ? `- [ ] ${step.title}, [${id}](${ticketLinkTarget(root, ticket)}): ${text}`
          : kept.line);
      }
    }
  }
  return collected;
}

// REQ-RELEASE-049
export function keptActions(content) {
  const kept = { before: [], after: [] };
  for (const entry of recordedActions(sectionLines(content, EXIT_CRITERIA))) kept[entry.step].push(entry.line);
  return kept;
}

const markCommand = (entry, number, total) => `release mark ${entry.ticket} --step ${entry.step}`
  + `${total > 1 ? ` --item ${number}` : ''} --note "<чем подтверждено>"`;

// REQ-RELEASE-049
export function unmarkedActionProblems(content) {
  const recorded = recordedActions(sectionLines(content, EXIT_CRITERIA));
  return recorded.filter((entry) => !entry.marked).map((entry) => {
    const own = recorded.filter((other) => other.step === entry.step && other.ticket === entry.ticket);
    return `Действие «${titleOf(entry.step)}» задачи ${entry.ticket} не отмечено: ${entry.rest}.`
      + ` Отметьте его командой ${markCommand(entry, own.indexOf(entry) + 1, own.length)}`;
  });
}

// REQ-RELEASE-049
export function markedCriteria(criteria, { ticketId: id, step, item, note }) {
  if (!DEPLOYMENT_STEPS.some((known) => known.key === step)) {
    return { problems: [`Шаг развёртывания ${step ?? '(не указан)'} неизвестен: --step before или --step after`] };
  }
  const own = recordedActions(criteria).filter((entry) => entry.ticket === id && entry.step === step);
  if (own.length === 0) {
    return { problems: [`У задачи ${id} в критериях выхода нет действий «${titleOf(step)}»: действия выпуска и их задачи перечисляет release status`] };
  }
  if (item === undefined && own.length > 1) {
    return {
      problems: [`У задачи ${id} действий «${titleOf(step)}» ${own.length}: укажите номер ключом --item`,
        ...own.map((entry, index) => `  ${index + 1}. ${entry.rest}`)],
    };
  }
  const number = item ?? 1;
  if (!Number.isInteger(number) || number < 1 || number > own.length) {
    return { problems: [`Номер --item ${item} вне перечня: у задачи ${id} действий «${titleOf(step)}» ${own.length}`] };
  }
  const target = own[number - 1];
  if (target.marked) return { problems: [`Действие уже отмечено: ${target.rest}. Неотмеченные действия перечисляет release status`] };
  const marked = [...criteria];
  marked[target.index] = `${target.line.replace(/^- \[ \]/, '- [x]')} — ${note}`;
  return { criteria: marked, action: target.rest };
}

// REQ-RELEASE-049
export async function markDeploymentAction(root, { scheme, ticketId: id, step, item, note }) {
  if (!note || !note.trim()) {
    return { marked: false, problems: ['Действие развёртывания отмечается с указанием, чем оно подтверждено: ключ --note'] };
  }
  const release = await openRelease(root);
  if (release === null) {
    return { marked: false, problems: ['Незавершённого выпуска нет: выпуск открывается командой release open, а действия развёртывания попадают в его критерии выхода командой release close'] };
  }
  const releaseId = release.metadata.get('id');
  if (await tagCommit(root, releaseTag(releaseId, scheme)) === null) {
    return {
      marked: false,
      problems: [`Первый шаг закрытия ${releaseId} ещё не выполнен: действия развёртывания попадают в критерии выхода командой release close`],
    };
  }
  const result = markedCriteria(sectionLines(release.content, EXIT_CRITERIA), { ticketId: id, step, item, note: note.trim() });
  if (result.problems) return { marked: false, problems: result.problems };
  await writeDocument(release.file, replaceSection(release.content, EXIT_CRITERIA, result.criteria));
  return { marked: true, id: releaseId, ticket: id, step, action: result.action, note: note.trim() };
}
