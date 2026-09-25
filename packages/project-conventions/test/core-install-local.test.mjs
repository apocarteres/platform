import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(here, '../../..');

const COUNTING_WEB_BUILD = `#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")/.." && pwd)"
echo "$1" >> "$ROOT_DIR/web-calls.log"
for manifest in "$ROOT_DIR"/packages/*/package.json; do
  node -e "process.exit(require('$manifest').scripts?.build ? 0 : 1)" || continue
  name="$(basename "$(dirname "$manifest")")"
  mkdir -p "$ROOT_DIR/target/packages/$name"
  node -e "const m = require('$manifest'); m.built = true; console.log(JSON.stringify(m))" > "$ROOT_DIR/target/packages/$name/package.json"
done
`;

async function pkg(root, name, scripts, extra = {}) {
  await mkdir(path.join(root, 'packages', name), { recursive: true });
  await writeFile(path.join(root, 'packages', name, 'package.json'),
    JSON.stringify({ name: `@core/${name}`, version: '0.0.0', scripts, ...extra }));
}

async function sandbox() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'install-local-'));
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await copyFile(path.join(CORE, 'scripts/install-local.sh'), path.join(root, 'scripts/install-local.sh'));
  await writeFile(path.join(root, 'scripts/web.sh'), COUNTING_WEB_BUILD);
  await writeFile(path.join(root, 'mvnw'), '#!/usr/bin/env bash\nexit 0\n');
  await Promise.all(['scripts/install-local.sh', 'scripts/web.sh', 'mvnw'].map((file) => chmod(path.join(root, file), 0o755)));
  return root;
}

async function webCalls(root) {
  try {
    return (await readFile(path.join(root, 'web-calls.log'), 'utf8')).trim().split('\n');
  } catch {
    return [];
  }
}

async function packed(root, archive) {
  const { stdout } = await run('tar', ['-xzOf', path.join(root, 'target/local-packages', archive), 'package/package.json']);
  return JSON.parse(stdout);
}

// REQ-PUBLISHING-011, CORE-OPS-101
test('install-local собирает клиентские пакеты один раз и пакует каждый публикуемый', async () => {
  const root = await sandbox();
  try {
    await pkg(root, 'first', { build: 'true' });
    await pkg(root, 'second', { build: 'true' });
    await pkg(root, 'plain', {});

    await run(path.join(root, 'scripts/install-local.sh'), ['1.2.3'], { cwd: root });

    assert.deepEqual(await webCalls(root), ['build'], 'web.sh build собирает все пакеты, значит вызывается один раз');
    const archives = (await readdir(path.join(root, 'target/local-packages'))).sort();
    assert.deepEqual(archives, ['core-first-1.2.3.tgz', 'core-plain-1.2.3.tgz', 'core-second-1.2.3.tgz']);
    assert.equal((await packed(root, 'core-first-1.2.3.tgz')).built, true, 'пакет со сборкой пакуется из собранного');
    assert.equal((await packed(root, 'core-second-1.2.3.tgz')).built, true, 'пакет со сборкой пакуется из собранного');
    assert.equal((await packed(root, 'core-plain-1.2.3.tgz')).built, undefined, 'пакет без сборки пакуется из исходника');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-PUBLISHING-011, CORE-OPS-101
test('install-local не собирает, если сборка нужна только непубликуемому пакету', async () => {
  const root = await sandbox();
  try {
    await pkg(root, 'plain', {});
    await pkg(root, 'internal', { build: 'true' }, { publishable: false });

    await run(path.join(root, 'scripts/install-local.sh'), ['1.2.3'], { cwd: root });

    assert.deepEqual(await webCalls(root), []);
    assert.deepEqual(await readdir(path.join(root, 'target/local-packages')), ['core-plain-1.2.3.tgz']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
