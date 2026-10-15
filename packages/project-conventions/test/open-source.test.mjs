import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { environmentWithoutGit } from '../lib/release/git.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(here, '../../..');
const SELF = path.relative(CORE, fileURLToPath(import.meta.url));
const read = (file) => readFile(path.join(CORE, file), 'utf8');

// CORE-DOC-020
test('ядро открыто по Apache-2.0: LICENSE, NOTICE, POM и каждый пакет npm', async () => {
  const license = await read('LICENSE');
  assert.match(license, /Apache License\s+Version 2\.0, January 2004/);
  assert.match(license, /END OF TERMS AND CONDITIONS/);
  assert.match(await read('NOTICE'), /Copyright \d{4}/);

  const pom = await read('pom.xml');
  assert.match(pom, /<licenses>\s*<license>\s*<name>Apache-2\.0<\/name>/, 'родительский POM называет лицензию — модули её наследуют');
  assert.match(pom, /<scm>[\s\S]*github\.com\/apocarteres\/platform[\s\S]*<\/scm>/);
  const bom = await read('platform-bom/pom.xml');
  assert.match(bom, /<licenses>\s*<license>\s*<name>Apache-2\.0<\/name>/, 'BOM без родителя называет лицензию сам');

  for (const name of await readdir(path.join(CORE, 'packages'))) {
    const manifest = JSON.parse(await read(`packages/${name}/package.json`));
    assert.equal(manifest.license, 'Apache-2.0', `packages/${name}/package.json`);
  }
});

// CORE-DOC-022
test('внешний читатель находит README на двух языках, порядок сообщения об уязвимости и участия', async () => {
  const readme = await read('README.md');
  assert.match(readme, /^## English$/m);
  assert.match(readme, /^## Русский$/m);
  assert.match(readme, /FSL-1\.1-ALv2/, 'README называет лицензию Liquibase, которую ядро тянет транзитивно');
  assert.match(readme, /Apache-2\.0/);
  // REQ-ADOPTION-028
  assert.match(readme, /"stack": \[\]/, 'README говорит, что можно взять только правила');
  assert.ok(readme.indexOf('project-conventions') < readme.indexOf('platform-auth'), 'правила — первыми, библиотеки — по желанию');
  const security = await read('SECURITY.md');
  assert.match(security, /security\/advisories\/new/, 'уязвимость сообщается закрыто, не публичной заявкой');
  assert.match(await read('CONTRIBUTING.md'), /REQ-ADOPTION-019/);
});

// CORE-DOC-021
const CONSUMERS = /zavpn|clanlog/i;

// CORE-DOC-021
const RECORDS = ['docs/tickets/', 'docs/releases/', '.conventions/baseline.json'];

// CORE-DOC-021
test('названия проектов-потребителей остались только в записях: задачах, выпусках и ограничителе', () => {
  let found = '';
  try {
    found = execFileSync('git', ['-C', CORE, 'grep', '-l', '-i', '-E', CONSUMERS.source, '--', '.'],
      { env: environmentWithoutGit(), encoding: 'utf8' });
  } catch (failure) {
    if (failure.status !== 1) throw failure;
  }
  const listed = found.split('\n').filter(Boolean);
  const outside = listed.filter((file) => file !== SELF && !RECORDS.some((prefix) => file.startsWith(prefix)));
  assert.deepEqual(outside, []);
});
