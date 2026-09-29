import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compareReleaseIds, openRelease, releases, releaseTag } from './documents.mjs';
import { upgradeCost } from './changes.mjs';
import { tagExists } from './git.mjs';

// REQ-DEPS-010
export const CORE_CATALOGUE = 'packages/project-conventions/obligations.json';

// REQ-DEPS-010
export function fullRunId(version) {
  return `full-run-${version.replaceAll('.', '-')}`;
}

// REQ-DEPS-010
export function fullRunObligation(version, components) {
  return {
    id: fullRunId(version),
    title: `Полный прогон после смены версий компонентов ядром ${version}`,
    requirement: 'REQ-DEPS-010',
    level: 'директива',
    since: version,
    dueReleases: 1,
    slug: `full-run-${version.replaceAll('.', '-')}`,
    area: 'OPS',
    ticket: {
      scope: 'dependencies, testing',
      priority: 'P1',
      problem: `Ядро ${version} сменило версии компонентов платформы: ${components.join('; ')}. `
        + 'Набор verify это ловит лишь в той мере, в какой покрывает службу; сканер зависимостей и сценарии стенда в него могут не входить.',
      required: [
        'Полный набор verify на коммите с новой версией ядра (REQ-RELEASE-027).',
        'Сканер зависимостей проекта на той же сборке — без новых находок либо с записанным решением по каждой.',
        'Сценарии стенда, если проект их ведёт, — на службе с новой версией ядра.',
      ],
      acceptance: [
        'Задача называет, чем выполнен каждый шаг, и итог каждого.',
        'Проект без сканера или без стенда называет это в задаче, а не пропускает шаг молча.',
      ],
    },
  };
}

// REQ-DEPS-010
export function fullRunProblem(cost, obligations, version) {
  if (cost === null || version === null || (cost.changes.components ?? []).length === 0) return null;
  const id = fullRunId(version);
  if (obligations.some((one) => one.id === id)) return null;
  return `Выпуск ${version} меняет версии компонентов (${cost.changes.components.join('; ')}), а обязательства ${id} в каталоге нет:`
    + ' потребитель обязан пройти полный прогон (REQ-DEPS-010). Объявите его командой conventions release full-run'
    + ' и зафиксируйте каталог до записи расписки — он лежит в дереве кода';
}

// REQ-DEPS-010
async function previousTag(root, scheme) {
  const released = (await releases(root))
    .filter((release) => release.metadata.get('status') === 'released')
    .map((release) => release.metadata.get('id'))
    .sort(compareReleaseIds)
    .reverse();
  for (const id of released) {
    const tag = releaseTag(id, scheme);
    if (await tagExists(root, tag)) return tag;
  }
  return null;
}

// REQ-DEPS-010
export async function declareFullRun(root, { scheme }) {
  const release = await openRelease(root);
  if (release === null) return { declared: false, problems: ['Открытого выпуска нет: обязательство полного прогона объявляется в открытом выпуске — откройте его командой release open'] };
  const version = releaseTag(release.metadata.get('id'), scheme).replace(/^v/, '');
  const cost = await upgradeCost(root, { from: await previousTag(root, scheme), content: release.content });
  const components = cost?.changes.components ?? [];
  if (components.length === 0) return { declared: false, problems: [`Выпуск ${version} версий компонентов не меняет: полный прогон не требуется, закрывайте выпуск командой release close`] };
  const file = path.join(root, CORE_CATALOGUE);
  const catalogue = JSON.parse(await readFile(file, 'utf8'));
  if (catalogue.obligations.some((one) => one.id === fullRunId(version))) {
    return { declared: false, problems: [`Обязательство ${fullRunId(version)} уже объявлено: зафиксируйте каталог и закрывайте выпуск командой release close`] };
  }
  catalogue.obligations.push(fullRunObligation(version, components));
  await writeFile(file, `${JSON.stringify(catalogue, null, 2)}\n`);
  return { declared: true, id: fullRunId(version), file: CORE_CATALOGUE };
}
