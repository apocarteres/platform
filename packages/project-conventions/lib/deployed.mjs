import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

// REQ-DEPLOYMENT-016
export async function checksum(file) {
  try {
    return { value: createHash('sha256').update(await readFile(file)).digest('hex') };
  } catch (failure) {
    if (failure.code === 'ENOENT') return { error: `артефакта нет: ${file}` };
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
