import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deployment, knownEnvironment } from './components.mjs';
import { checksum } from './deployed.mjs';
import { headCommit, tagOfHead } from './release/git.mjs';
import { systemNow } from './now.mjs';

// REQ-DEPLOYMENT-002
export const MANIFEST = 'target/deploy/manifest.json';

// REQ-DEPLOYMENT-002
export async function buildManifest(root, config, { environment, only = null, reason = null }) {
  if (!knownEnvironment(config, environment)) {
    const { environments } = deployment(config);
    return {
      written: false,
      reason: `среда ${environment} не объявлена; объявлены: ${environments.join(', ') || 'ни одной'}.`
        + ' Назовите объявленную либо добавьте её в deployment.environments',
    };
  }
  const declared = deployment(config).components;
  const chosen = only === null ? declared : declared.filter((one) => only.includes(one.name));
  const unknown = only === null ? [] : only.filter((name) => !declared.some((one) => one.name === name));
  if (unknown.length > 0) return { written: false, reason: `составляющие не объявлены: ${unknown.join(', ')}` };
  const components = [];
  for (const one of chosen) {
    const sum = await checksum(path.resolve(root, one.artifact));
    if (sum.error !== undefined) return { written: false, reason: `${one.name}: ${sum.error}` };
    components.push({ name: one.name, artifact: one.artifact, sha256: sum.value });
  }
  const tag = await tagOfHead(root);
  if (tag === null && reason === null) {
    return {
      written: false,
      reason: 'выпускаемый коммит не помечен тегом: развёртывание непомеченного выполняется явно и записывается причиной (REQ-DEPLOYMENT-016)',
    };
  }
  return {
    written: true,
    manifest: {
      environment,
      commit: await headCommit(root),
      releaseTag: tag,
      untaggedReason: tag === null ? reason : null,
      createdAt: systemNow().toISOString(),
      components,
    },
  };
}

// REQ-DEPLOYMENT-002
export async function writeManifest(root, manifest, file = MANIFEST) {
  const target = path.resolve(root, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`);
  return target;
}

// REQ-DEPLOYMENT-002
export function journalLine(manifest) {
  const what = manifest.components.map((one) => one.name).join(',') || 'ничего';
  const mark = manifest.releaseTag === null ? `tag=none exception=${manifest.untaggedReason}` : `tag=${manifest.releaseTag}`;
  return `${manifest.createdAt} env=${manifest.environment} commit=${manifest.commit} ${mark} components=${what}\n`;
}

// REQ-DEPLOYMENT-002
export async function appendJournal(file, manifest) {
  await mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await appendFile(path.resolve(file), journalLine(manifest));
  return path.resolve(file);
}
