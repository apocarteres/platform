import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { MISE_FILE, miseTools } from './toolchain.mjs';

// REQ-BUILD-013
export const MANIFEST = 'package.json';

// REQ-BUILD-013
export const LOCKFILE = 'package-lock.json';

// REQ-BUILD-013
export const INSTALLED_MARK = 'node_modules/.package-lock.json';

// REQ-BUILD-013
export const DEFAULT_TOOLS = ['node', 'npm'];

async function readOrNull(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function present(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

// REQ-BUILD-013
export async function fingerprint(root, directory, tools = DEFAULT_TOOLS) {
  const mise = await readOrNull(path.join(root, MISE_FILE));
  if (mise === null) return { error: `${MISE_FILE} отсутствует: версии инструментов закрепляются им (REQ-BUILD-004)` };
  const declared = miseTools(mise);
  const missing = tools.filter((tool) => declared.get(tool) === undefined);
  if (missing.length > 0) {
    return { error: `в ${MISE_FILE} не объявлены: ${missing.join(', ')} — отпечаток считается от закреплённых версий` };
  }
  const manifest = await readOrNull(path.join(root, directory, MANIFEST));
  if (manifest === null) return { error: `в ${directory} нет ${MANIFEST}` };
  const lock = await readOrNull(path.join(root, directory, LOCKFILE));
  if (lock === null) return { error: `в ${directory} нет ${LOCKFILE}: без него состав зависимостей не закреплён` };
  const digest = createHash('sha256');
  for (const tool of tools) digest.update(`${tool}=${declared.get(tool)}\n`);
  digest.update(manifest);
  digest.update(lock);
  return { value: digest.digest('hex') };
}

// REQ-BUILD-013
export async function dependenciesUnchanged(root, { directory, state, tools = DEFAULT_TOOLS }) {
  const computed = await fingerprint(root, directory, tools);
  if (computed.error !== undefined) return { unchanged: false, reason: computed.error };
  if (!await present(path.join(root, directory, INSTALLED_MARK))) {
    return { unchanged: false, reason: `зависимости не установлены: нет ${directory}/${INSTALLED_MARK}`, value: computed.value };
  }
  const stored = (await readOrNull(path.join(root, state)))?.trim() ?? null;
  if (stored === null) return { unchanged: false, reason: `отпечаток не записан: нет ${state}`, value: computed.value };
  if (stored !== computed.value) {
    return { unchanged: false, reason: 'версии инструментов или состав зависимостей изменились', value: computed.value };
  }
  return { unchanged: true, value: computed.value };
}

// REQ-BUILD-013
export async function recordDependencies(root, { directory, state, tools = DEFAULT_TOOLS }) {
  const computed = await fingerprint(root, directory, tools);
  if (computed.error !== undefined) return { recorded: false, reason: computed.error };
  const target = path.join(root, state);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${computed.value}\n`);
  return { recorded: true, value: computed.value };
}
