import { CYCLE_TRAILER, REVERT_LABEL, commitStanding, revertCommit, ticketOf } from './commits.mjs';

// REQ-RELEASE-042
export const HOLDS = new Set(['не называет задачу', 'задача не заведена', 'задача вне состава']);

// REQ-RELEASE-036, REQ-RELEASE-037, REQ-STORE-014
export function commitHolds(beyondBaseline, context, { releaseId, releaseOf, where = 'в docs/tickets' }) {
  const { areas, prefix, stages, pattern = null } = context;
  const problems = [];
  const outside = new Map();
  for (const commit of beyondBaseline) {
    const standing = commitStanding(commit, context);
    if (!HOLDS.has(standing)) continue;
    if (standing === 'не называет задачу') {
      // REQ-RELEASE-039
      problems.push(`Коммит ${commit.sha.slice(0, 8)} не называет задачу: «${commit.subject}»\n  `
        + wayOutOfAnUnnamedCommit(releaseId, prefix, commit.sha.slice(0, 8)));
      continue;
    }
    // REQ-PROJECT-PROCESS-023
    if (standing === 'задача не заведена') {
      problems.push(`Коммит ${commit.sha.slice(0, 8)} называет ${ticketOf(commit, areas, prefix, stages, pattern)}, а задачи нет ${where}: «${commit.subject}»\n  `
        + `Заведите задачу с этим идентификатором либо учтите коммит: release account ${commit.sha.slice(0, 8)} --reason "<причина>"`);
      continue;
    }
    const ticket = ticketOf(commit, areas, prefix, stages, pattern);
    if (!outside.has(ticket)) outside.set(ticket, []);
    outside.get(ticket).push(commit);
  }

  // REQ-RELEASE-037
  for (const [ticket, commits] of outside) {
    if (revertCommit(commits[0], areas, prefix, stages, pattern)) continue;
    const named = commits.map(
      (commit) => `Коммит ${commit.sha.slice(0, 8)} относится к задаче ${ticket} вне состава выпуска: «${commit.subject}»`,
    );
    // REQ-RELEASE-039
    named.push(wayIntoComposition(ticket, releaseOf(ticket), commits));
    problems.push(named.join('\n  '));
  }
  return problems;
}

// REQ-RELEASE-039
function wayOutOfAnUnnamedCommit(releaseId, prefix, sha) {
  const example = prefix ? `${prefix}-OPS-001` : 'OPS-001';
  return `Выхода четыре. Коммит ещё не отправлен: назовите задачу идентификатором в начале заголовка (${example} ...);`
    + ` если коммит обслуживает сам выпуск — поставьте в тело строку ${CYCLE_TRAILER}: ${releaseId}`
    + ' (именно в тело, заголовок для этого не годится);'
    + ` если коммит отменяет прежнюю работу — метку ${REVERT_LABEL} сразу после идентификатора задачи.`
    + ` Коммит уже отправлен: учтите его в выпуске командой release account ${sha} --reason "<причина>"`
    + ' — это единственный выход, не переписывающий общую историю (REQ-RELEASE-041)';
}

// REQ-RELEASE-039
function wayIntoComposition(ticket, assigned, commits) {
  const way = assigned !== 'unassigned'
    ? `Задача ${ticket} уже отнесена к ${assigned} и в состав этого выпуска не вносится (REQ-RELEASE-007): работа после её выпуска оформляется новой задачей, а ненужная — отменяется коммитом с меткой !revert`
    : `Задача ${ticket} вносится в состав так: доведите её до выполненного состояния — состав подберёт её сам (REQ-RELEASE-007), — либо отмените её коммиты коммитом с меткой !revert`;
  // REQ-RELEASE-041, REQ-RELEASE-042
  const accounts = commits.map((commit) => `release account ${commit.sha.slice(0, 8)} --reason "<причина>"`).join('; ');
  return `${way}. Коммит, который выпуску не мешает — например, запись хода задачи, задевшая документ рядом с ней (REQ-RELEASE-040), — учтите в выпуске: ${accounts} (REQ-RELEASE-041)`;
}
