import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { launchKeys } from '../lib/jvm.mjs';

const run = promisify(execFile);
const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'conventions.mjs');

// REQ-QUALITY-003, REQ-QUALITY-017
async function jdkHere() {
  try {
    await run('javac', ['-version']);
    await run('jar', ['--version']);
    return true;
  } catch {
    return false;
  }
}

// REQ-QUALITY-017
async function service() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jvm-launch-'));
  await writeFile(path.join(root, 'Main.java'),
    'public class Main {\n  public static void main(String[] args) {\n    System.out.println("служба поднялась");\n  }\n}\n');
  await run('javac', ['-d', path.join(root, 'classes'), path.join(root, 'Main.java')]);
  await run('jar', ['--create', '--file', path.join(root, 'app.jar'), '--main-class', 'Main', '-C', path.join(root, 'classes'), '.']);
  return root;
}

// REQ-QUALITY-017
async function launch(keys, jar) {
  try {
    const { stdout, stderr } = await run('java', [...keys, '-jar', jar]);
    return { code: 0, output: `${stdout}${stderr}` };
  } catch (failure) {
    return { code: failure.code, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

// REQ-DEPLOYMENT-011, REQ-DEPLOYMENT-030
async function declaring(environments) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'jvm-args-'));
  await writeFile(path.join(root, '.conventions.json'),
    JSON.stringify({ sources: [], deployment: { environments, components: { backend: { artifact: 'target/app.jar' } } } }));
  return root;
}

// REQ-DEPLOYMENT-011
async function delivered(...args) {
  const root = await declaring(['qa', 'production']);
  try {
    const { stdout } = await run(process.execPath, [cli, 'jvm-args', ...args, '--root', root]);
    return stdout.trim().split('\n');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// REQ-DEPLOYMENT-030
async function refused(environments, ...args) {
  const root = await declaring(environments);
  try {
    await run(process.execPath, [cli, 'jvm-args', ...args, '--root', root]);
    return { code: 0, output: '' };
  } catch (failure) {
    return { code: failure.code, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// REQ-DEPLOYMENT-030
test('рабочей среде поставка добавляет профиль production, не затирая профилей проекта', async () => {
  assert.deepEqual(await delivered('--env', 'production', '--archive', 'app.jsa'),
    ['-XX:+AutoCreateSharedArchive', '-XX:SharedArchiveFile=app.jsa', '-Dspring.profiles.include=production']);
  assert.deepEqual(await delivered('--env', 'production', '--aot', 'app.aot'),
    ['-XX:AOTCache=app.aot', '-Dspring.profiles.include=production']);
});

// REQ-DEPLOYMENT-030
test('прочим средам профиль production не поставляется', async () => {
  assert.deepEqual(await delivered('--env', 'qa', '--archive', 'app.jsa'),
    ['-XX:+AutoCreateSharedArchive', '-XX:SharedArchiveFile=app.jsa']);
});

// REQ-DEPLOYMENT-030, REQ-RELEASE-039
test('без среды и с необъявленной средой поставка отказывает и называет объявленные', async () => {
  const missing = await refused(['qa', 'production'], '--archive', 'app.jsa');
  assert.notEqual(missing.code, 0, missing.output);
  assert.match(missing.output, /--env/);
  assert.match(missing.output, /qa, production/);

  const typo = await refused(['qa', 'production'], '--env', 'prodution', '--archive', 'app.jsa');
  assert.notEqual(typo.code, 0, 'опечатка в имени среды не должна молча снимать профиль');
  assert.match(typo.output, /prodution/);
  assert.match(typo.output, /qa, production/);

  const undeclared = await refused([], '--env', 'production', '--archive', 'app.jsa');
  assert.notEqual(undeclared.code, 0, undeclared.output);
});

const jdk = await jdkHere();
const skip = jdk ? false : 'JDK здесь не установлен: проверка запуском требует javac и jar закреплённой версии';

// REQ-DEPLOYMENT-011, REQ-DEPLOYMENT-012, REQ-QUALITY-017
test('поставленные ключи запускают службу и записывают архив классов, второй запуск им пользуется', { skip }, async () => {
  const root = await service();
  const archive = path.join(root, 'app.jsa');
  try {
    const keys = await delivered('--env', 'qa', '--archive', archive);
    const first = await launch(keys, path.join(root, 'app.jar'));
    assert.equal(first.code, 0, first.output);
    assert.match(first.output, /служба поднялась/);
    assert.ok((await stat(archive)).size > 0, 'первый запуск записал архив');

    const second = await launch([...keys, '-Xlog:cds'], path.join(root, 'app.jar'));
    assert.equal(second.code, 0, second.output);
    assert.ok(second.output.includes(`Opened shared archive file ${archive}`), 'второй запуск открыл записанный архив');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-DEPLOYMENT-012, REQ-DEPLOYMENT-013, REQ-QUALITY-017
test('архив классов и кеш AOT несовместимы: виртуальная машина отказывает, поставка сочетания не выдаёт', { skip }, async () => {
  const root = await service();
  try {
    const both = await launch(
      [`-XX:AOTCache=${path.join(root, 'app.aot')}`, `-XX:SharedArchiveFile=${path.join(root, 'app.jsa')}`],
      path.join(root, 'app.jar'),
    );
    assert.notEqual(both.code, 0, 'сочетание не запускается');
    assert.match(both.output, /AOTCache cannot be used at the same time with .*SharedArchiveFile/);

    const qa = { environment: 'qa', environments: ['qa'] };
    assert.match(launchKeys({ archive: 'a', aot: 'b', ...qa }).problems[0], /взаимно исключают/);
    assert.deepEqual(launchKeys({ aot: 'app.aot', ...qa }).keys, ['-XX:AOTCache=app.aot']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
