import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { changesBetween, costSection } from '../lib/release/changes.mjs';
import { componentsOf } from '../lib/release/surface.mjs';
import { declareFullRun, fullRunId, fullRunObligation } from '../lib/release/full-run.mjs';
import { catalogueProblems } from '../lib/release/obligations.mjs';
import { closability, closeRelease, finishRelease, openNext } from '../lib/release/cycle.mjs';
import { writeReceipt } from '../lib/release/receipt.mjs';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const run = promisify(execFile);
const git = (root, ...args) => run('git', ['-C', root, ...args], { env: environmentWithoutGit() });
const DAY = new Date('2026-09-29T00:00:00Z');
const EMPTY = { rules: [], commands: [], subcommands: [], keys: {}, clauses: [], obligations: [], contract: [], components: [] };

function pom(boot, jackson) {
  const pinned = jackson === null ? '' : `
      <dependency>
        <groupId>tools.jackson</groupId>
        <artifactId>jackson-bom</artifactId>
        <version>\${jackson.version}</version>
        <type>pom</type>
        <scope>import</scope>
      </dependency>`;
  return `<project>
  <properties>
    <spring-boot.version>${boot}</spring-boot.version>
    ${jackson === null ? '' : `<jackson.version>${jackson}</jackson.version>`}
  </properties>
  <dependencyManagement>
    <dependencies>
      <dependency>
        <groupId>io.github.apocarteres.platform</groupId>
        <artifactId>platform-time</artifactId>
        <version>\${revision}</version>
      </dependency>${pinned}
      <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-dependencies</artifactId>
        <version>\${spring-boot.version}</version>
        <type>pom</type>
        <scope>import</scope>
      </dependency>
    </dependencies>
  </dependencyManagement>
</project>
`;
}

// REQ-DEPS-010
test('версии компонентов читаются из управления зависимостями, без артефактов самого ядра', () => {
  assert.deepEqual(componentsOf(pom('4.0.8', '3.1.7')), [
    { id: 'org.springframework.boot:spring-boot-dependencies', version: '4.0.8' },
    { id: 'tools.jackson:jackson-bom', version: '3.1.7' },
  ]);
  assert.deepEqual(componentsOf(null), []);
});

// REQ-DEPS-010, REQ-PUBLISHING-015
test('цена обновления называет изменённые версии компонентов и полный прогон, несовместимостью их не считая', () => {
  const before = { ...EMPTY, components: componentsOf(pom('4.0.8', null)) };
  const after = { ...EMPTY, components: componentsOf(pom('4.0.9', '3.1.7')) };
  const lines = costSection(changesBetween(before, after));
  assert.match(lines[0], /^Несовместимого нет/);
  const at = lines.findIndex((line) => line.startsWith('Версии компонентов (2)'));
  assert.ok(at !== -1, lines.join('\n'));
  assert.match(lines[at], /полный прогон/);
  assert.ok(lines.includes('- org.springframework.boot:spring-boot-dependencies 4.0.8 → 4.0.9'), lines.join('\n'));
  assert.ok(lines.includes('- tools.jackson:jackson-bom закреплено ядром: 3.1.7'), lines.join('\n'));
  assert.equal(costSection(changesBetween(before, before)).some((line) => line.startsWith('Версии компонентов')), false);
});

// REQ-DEPS-010, REQ-RELEASE-013
test('обязательство полного прогона — полноценная запись каталога со сроком в один выпуск', () => {
  const entry = fullRunObligation('13.2.1', ['tools.jackson:jackson-bom закреплено ядром: 3.1.7']);
  assert.equal(entry.id, fullRunId('13.2.1'));
  assert.equal(entry.id, 'full-run-13-2-1');
  assert.equal(entry.since, '13.2.1');
  assert.equal(entry.dueReleases, 1);
  assert.equal(entry.requirement, 'REQ-DEPS-010');
  assert.deepEqual(catalogueProblems([entry]), []);
  assert.ok(entry.ticket.problem.includes('tools.jackson:jackson-bom'));
  assert.ok(entry.ticket.required.some((line) => /[Сс]канер/.test(line)) && entry.ticket.required.some((line) => /verify/.test(line)));
});

// REQ-DEPS-010
test('выпуск ядра со сменой версий без обязательства полного прогона не закрывается; команда его объявляет', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'full-run-'));
  const catalogue = path.join(root, 'packages/project-conventions/obligations.json');
  try {
    await mkdir(path.join(root, 'docs/releases'), { recursive: true });
    await mkdir(path.join(root, 'docs/tickets/closed'), { recursive: true });
    await mkdir(path.dirname(catalogue), { recursive: true });
    await writeFile(catalogue, `${JSON.stringify({ obligations: [] }, null, 2)}\n`);
    await writeFile(path.join(root, '.gitignore'), 'target/\n');
    await writeFile(path.join(root, 'pom.xml'), pom('4.0.8', null));
    await writeFile(path.join(root, '.conventions.json'), JSON.stringify({ sources: [], release: { scheme: 'semver' } }));
    await git(root, 'init', '--quiet');
    await git(root, 'config', 'user.email', 'test@example.test');
    await git(root, 'config', 'user.name', 'Test');

    const ship = async (version, change) => {
      assert.equal((await openNext(root, { scheme: 'semver', version, today: DAY })).opened, true);
      await change();
      await writeFile(path.join(root, `docs/tickets/closed/CORE-OPS-9${version.replaceAll('.', '')}-work.md`),
        `---\nid: CORE-OPS-9${version.replaceAll('.', '')}\ntype: ticket\nstatus: done\nscope: quality\nauthority: supporting\n`
        + 'priority: P2\nrelease: unassigned\n---\n\n# Работа\n');
      await git(root, 'add', '-A');
      await git(root, 'commit', '--quiet', '-m', `Выпуск ${version}\n\nRelease-cycle: RELEASE-${version.replaceAll('.', '-')}`);
      const head = (await git(root, 'rev-parse', 'HEAD')).stdout.trim();
      await writeReceipt(root, { commit: head, completedAt: DAY, checks: ['verify'], run: { command: 'mise run verify', exitCode: 0 } });
    };

    await ship('1.0.0', async () => undefined);
    assert.equal((await closeRelease(root, { scheme: 'semver' })).closed, true);
    assert.equal((await finishRelease(root, { scheme: 'semver', today: DAY, note: 'публикация' })).finished, true);
    await git(root, 'add', '-A');
    await git(root, 'commit', '--quiet', '-m', 'Выпущен 1.0.0\n\nRelease-cycle: RELEASE-1-0-0');

    await ship('1.0.1', () => writeFile(path.join(root, 'pom.xml'), pom('4.0.8', '3.1.7')));
    const held = await closability(root, { scheme: 'semver' });
    const refusal = held.problems.find((problem) => problem.includes('full-run-1-0-1'));
    assert.ok(refusal !== undefined, held.problems.join('\n'));
    assert.match(refusal, /release full-run/);

    const declared = await declareFullRun(root, { scheme: 'semver' });
    assert.equal(declared.declared, true, JSON.stringify(declared.problems));
    const written = JSON.parse(await readFile(catalogue, 'utf8')).obligations;
    assert.deepEqual(written.map((one) => one.id), ['full-run-1-0-1']);
    assert.ok(written[0].ticket.problem.includes('tools.jackson:jackson-bom закреплено ядром: 3.1.7'));
    assert.equal((await declareFullRun(root, { scheme: 'semver' })).declared, false, 'повторное объявление не дублирует запись');

    await git(root, 'add', '-A');
    await git(root, 'commit', '--quiet', '-m', 'Обязательство полного прогона\n\nRelease-cycle: RELEASE-1-0-1');
    const head = (await git(root, 'rev-parse', 'HEAD')).stdout.trim();
    await writeReceipt(root, { commit: head, completedAt: DAY, checks: ['verify'], run: { command: 'mise run verify', exitCode: 0 } });
    const after = await closability(root, { scheme: 'semver' });
    assert.deepEqual(after.problems.filter((problem) => problem.includes('full-run')), [], after.problems.join('\n'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
