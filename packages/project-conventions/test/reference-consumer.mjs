import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { DELIVERED_DOCUMENTS } from '../lib/documents.mjs';
import { updateTicketIndexes } from '../lib/docs/tickets-index.mjs';
import { updateReleaseIndex } from '../lib/docs/releases-index.mjs';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const run = promisify(execFile);
const git = (root, ...args) => run('git', ['-C', root, ...args], { env: environmentWithoutGit() });
const here = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(here, '../../..');

export const PREFIX = 'REF';
export const SEEDED_RELEASES = 10;

// REQ-ADOPTION-016
async function deliverRules(root) {
  const target = path.join(root, 'node_modules/@apocarteres/project-conventions/docs');
  await mkdir(target, { recursive: true });
  for (const name of DELIVERED_DOCUMENTS) {
    await cp(path.join(CORE, 'docs/requirements', name), path.join(target, name));
  }
}

export async function refreshIndexes(root) {
  await updateTicketIndexes(root, { check: false });
  await updateReleaseIndex(root, { check: false });
}

function releaseDocument(ordinal, date) {
  return `---\nid: RELEASE-2026-09-${ordinal}\ntype: release\nstatus: released\nauthority: supporting\nscope: release\nopened-on: ${date}\n`
    + `released-on: ${date}\ncommit: ${'b'.repeat(40)}\n---\n\n`
    + `# Выпуск 2026.09.${ordinal}\n\n## Цель\nВыпустить накопленное.\n\n`
    + '## Состав\n| Задача | Причина включения |\n|---|---|\n'
    + `| [${PREFIX}-QUAL-${String(ordinal).padStart(3, '0')}](../tickets/closed/${PREFIX}-QUAL-${String(ordinal).padStart(3, '0')}-work.md) | Закрыта в этом выпуске |\n\n`
    + '## Критерии выхода\n- [x] Проверки пройдены — набор check завершился успешно\n\n'
    + '## Не входит\nРабота следующих выпусков.\n\n## Результат\nАртефакты опубликованы.\n';
}

function ticketDocument(id, status, release) {
  return `---\nid: ${id}\ntype: ticket\nstatus: ${status}\nscope: quality\nauthority: supporting\n`
    + `priority: P2\nrelease: ${release}\n---\n\n# ${id}\n\nРабота проекта-потребителя.\n`;
}

// CORE-ARC-005
export async function referenceConsumer() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'reference-consumer-'));
  await mkdir(path.join(root, 'docs/releases'), { recursive: true });
  await mkdir(path.join(root, 'docs/tickets/closed'), { recursive: true });
  await mkdir(path.join(root, 'src/main/java/net/example/inventory/internal'), { recursive: true });
  await mkdir(path.join(root, 'node_modules/@apocarteres/project-conventions'), { recursive: true });
  await deliverRules(root);
  await writeFile(
    path.join(root, 'node_modules/@apocarteres/project-conventions/obligations.json'),
    JSON.stringify({ obligations: [] }),
  );
  await writeFile(path.join(root, '.gitignore'), 'target/\nnode_modules/\n');

  // REQ-JAVA-MODULES-001
  await writeFile(
    path.join(root, 'src/main/java/net/example/inventory/InventoryContract.java'),
    'package net.example.inventory;\n\nimport net.example.inventory.internal.InventoryStore;\n\n'
    + 'public final class InventoryContract {\n  public String read() {\n    return new InventoryStore().read();\n  }\n}\n',
  );
  await writeFile(
    path.join(root, 'src/main/java/net/example/inventory/internal/InventoryStore.java'),
    'package net.example.inventory.internal;\n\npublic final class InventoryStore {\n'
    + '  public String read() {\n    return "склад";\n  }\n}\n',
  );

  // CORE-ARC-005
  await writeFile(path.join(root, 'docs/INDEX.md'),
    '---\nid: IDX-DOCUMENTATION\ntype: index\nstatus: active\nscope: documentation\nauthority: navigation\n---\n\n'
    + '# Документация проекта-потребителя\n\nТочка входа в задачи и выпуски.\n\n'
    + '## Каталог\n\n- [Требования](REQUIREMENTS.md)\n- [Архитектурные решения](decisions/INDEX.md)\n'
    + '- [Эксплуатационные инструкции](runbooks/INDEX.md)\n- [Выпуски](releases/INDEX.md)\n'
    + '- [Открытые задачи](tickets/INDEX.md)\n- [Закрытые задачи](tickets/closed/INDEX.md)\n');
  await writeFile(path.join(root, 'docs/REQUIREMENTS.md'),
    '---\nid: IDX-REQUIREMENTS\ntype: index\nstatus: active\nscope: documentation\nauthority: navigation\n---\n\n'
    + '# Требования проекта\n\nПравила платформы доставлены пакетом и здесь не повторяются.\n');
  await mkdir(path.join(root, 'docs/decisions'), { recursive: true });
  await writeFile(path.join(root, 'docs/decisions/INDEX.md'),
    '---\nid: IDX-DECISIONS\ntype: index\nstatus: active\nscope: architecture\nauthority: navigation\n---\n\n'
    + '# Архитектурные решения\n\nРешений пока нет.\n');
  await mkdir(path.join(root, 'docs/runbooks'), { recursive: true });
  await writeFile(path.join(root, 'docs/runbooks/INDEX.md'),
    '---\nid: IDX-RUNBOOKS\ntype: index\nstatus: active\nscope: operations\nauthority: navigation\n---\n\n'
    + '# Эксплуатационные инструкции\n\nИнструкций пока нет.\n');
  await git(root, 'init', '--quiet');
  await git(root, 'config', 'user.email', 'consumer@example.test');
  await git(root, 'config', 'user.name', 'Consumer');
  await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: ['src'], ticketPrefix: PREFIX }));
  await git(root, 'add', '-A');
  await git(root, 'commit', '--quiet', '-m', 'состояние до принятия правила о коммитах');
  const { stdout } = await git(root, 'rev-parse', 'HEAD');
  const baseline = stdout.trim();
  await writeFile(
    path.join(root, '.conventions.json'),
    JSON.stringify({ sources: ['src'], ticketPrefix: PREFIX, commitRuleSince: baseline }),
  );

  // CORE-OPS-033
  for (let ordinal = 1; ordinal <= SEEDED_RELEASES; ordinal += 1) {
    const id = `${PREFIX}-QUAL-${String(ordinal).padStart(3, '0')}`;
    await writeFile(path.join(root, `docs/tickets/closed/${id}-work.md`), ticketDocument(id, 'done', `RELEASE-2026-09-${ordinal}`));
    await writeFile(
      path.join(root, `src/main/java/net/example/inventory/internal/Step${ordinal}.java`),
      `package net.example.inventory.internal;\n\nfinal class Step${ordinal} {\n}\n`,
    );
    await git(root, 'add', '-A');
    await git(root, 'commit', '--quiet', '-m', `${id} работа по задаче выпуска`);
    await writeFile(path.join(root, `docs/releases/RELEASE-2026-09-${ordinal}.md`), releaseDocument(ordinal, '2026-09-10'));
    await git(root, 'add', '-A');
    await git(root, 'commit', '--quiet', '-m', `Выпущен 2026.09.${ordinal}\n\nRelease-cycle: RELEASE-2026-09-${ordinal}`);
    await git(root, 'tag', '-a', `2026.09.${ordinal}`, '-m', `Выпуск 2026.09.${ordinal}`);
  }
  await refreshIndexes(root);
  await git(root, 'add', '-A');
  await git(root, 'commit', '--quiet', '-m', 'Сводки проекта\n\nRelease-cycle: RELEASE-2026-09-10');
  return { root, baseline, git: (...args) => git(root, ...args) };
}
