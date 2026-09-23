import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// REQ-DEPLOYMENT-017
async function fileSum(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

// REQ-DEPLOYMENT-017
async function treeEntries(directory) {
  const found = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = [];
  const strange = [];
  for (const entry of found) {
    const name = path.relative(directory, path.join(entry.parentPath, entry.name));
    if (entry.isFile()) files.push(name);
    else if (!entry.isDirectory()) strange.push(name);
  }
  return { files, strange: strange.sort() };
}

// REQ-DEPLOYMENT-017
export function sumOfTree(entries) {
  const hash = createHash('sha256');
  const ordered = [...entries].sort((one, other) => (one.name < other.name ? -1 : 1));
  for (const { name, sum } of ordered) hash.update(`${name}\u0000${sum}\n`);
  return hash.digest('hex');
}

// REQ-DEPLOYMENT-017
async function treeSum(directory) {
  const { files, strange } = await treeEntries(directory);
  if (strange.length > 0) {
    return { error: `в дереве ${directory} есть не файл и не каталог: ${strange.join(', ')};`
      + ' сумма такого содержимого ничего не доказывает' };
  }
  if (files.length === 0) {
    return { error: `артефакт пуст: ${directory};`
      + ' у любых двух пустых каталогов сумма одна и та же, и сверка бы прошла, ничего не доказав' };
  }
  const entries = [];
  for (const file of files) entries.push({ name: file, sum: await fileSum(path.join(directory, file)) });
  return { value: sumOfTree(entries) };
}

// REQ-DEPLOYMENT-016, REQ-DEPLOYMENT-017
export async function checksum(artifact) {
  try {
    const about = await stat(artifact);
    if (about.isDirectory()) return await treeSum(artifact);
    return { value: await fileSum(artifact) };
  } catch (failure) {
    if (failure.code === 'ENOENT') return { error: `артефакта нет: ${artifact} — соберите его шагом сборки составляющей либо проверьте путь в объявлении` };
    throw failure;
  }
}

// REQ-DEPLOYMENT-016
export async function labelOf(container, label, { docker = 'docker' } = {}) {
  try {
    const { stdout } = await run(docker, ['inspect', '-f', `{{ index .Config.Labels "${label}" }}`, container]);
    const value = stdout.trim();
    if (value === '' || value === '<no value>') {
      return { error: `в контейнере ${container} нет метки ${label}: образ собран не тем шагом` };
    }
    return { value };
  } catch (failure) {
    return { error: `контейнер ${container} не опрошен: ${String(failure.stderr ?? failure.message).trim().split('\n')[0]}` };
  }
}

// REQ-DEPLOYMENT-016
function verdict(built, running, where) {
  if (built.error !== undefined) return { proved: false, reason: built.error };
  if (running.error !== undefined) return { proved: false, reason: running.error };
  if (built.value !== running.value) {
    return {
      proved: false,
      reason: `развёрнуто не собранное: ${where} несёт ${running.value.slice(0, 12)}, а собрано ${built.value.slice(0, 12)}.`
        + ' Так выглядит кешированный слой образа, несостоявшаяся замена файла или перезапуск прежнего контейнера',
    };
  }
  return { proved: true, value: built.value };
}

// REQ-DEPLOYMENT-016
export async function deployedInContainer(root, { artifact, container, label, docker }) {
  return verdict(
    await checksum(path.resolve(root, artifact)),
    await labelOf(container, label, { docker }),
    `контейнер ${container}`,
  );
}

// REQ-DEPLOYMENT-016
export async function deployedAsFile(root, { artifact, installed }) {
  return verdict(
    await checksum(path.resolve(root, artifact)),
    await checksum(installed),
    `установленный ${installed}`,
  );
}
