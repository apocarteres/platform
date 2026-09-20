import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { findToolchainMismatches, secondPinnings, toolingFiles } from '../lib/toolchain.mjs';

const MISE = '[tools]\njava = "25"\nnode = "22.22.3"\nnpm = "10.9.4"\n';
const TOOLS = new Map([['java', '25'], ['node', '22.22.3'], ['npm', '10.9.4']]);

async function project(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pinning-'));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(path.join(root, path.dirname(name)), { recursive: true });
    await writeFile(path.join(root, name), content);
  }
  return root;
}

const pinnings = async (root) => (await findToolchainMismatches(root))
  .filter((problem) => problem.includes('вторым местом'));

// REQ-BUILD-004
test('закреплением считается значение, а не подстановка и не упоминание', () => {
  const cases = {
    'ARG NODE_VERSION': 0,
    'ARG NPM_VERSION=10.9.4': 1,
    'FROM eclipse-temurin:25-jdk': 1,
    'FROM eclipse-temurin:${JAVA_VERSION}-jdk': 0,
    'ARG MAVEN_VERSION=3.9.11': 0,
    '# node 22.22.3 в пояснении': 0,
    'RUN curl --max-time 300 https://example.test': 0,
    '  node-version: "22.22.3"': 1,
    'RUN npm install -g npm@10.9.4': 1,
  };

  for (const [line, expected] of Object.entries(cases)) {
    assert.equal(secondPinnings(line, TOOLS).length, expected, line);
  }
});

// REQ-BUILD-004
test('образ, берущий версии доводом сборки, проходит; тот же образ числом — нет', async () => {
  const derived = await project({
    'mise.toml': MISE,
    'scripts/build-runner/Dockerfile': 'ARG JAVA_VERSION\nARG NODE_VERSION\nFROM eclipse-temurin:${JAVA_VERSION}-jdk\n',
  });
  const pinned = await project({
    'mise.toml': MISE,
    'scripts/build-runner/Dockerfile': 'ARG JAVA_VERSION=25\nARG NODE_VERSION=22.22.3\nFROM eclipse-temurin:25-jdk\n',
  });
  try {
    assert.deepEqual(await pinnings(derived), [], 'свойство, которое потребитель держал дисциплиной, теперь держит проверка');

    const found = await pinnings(pinned);
    assert.equal(found.length, 3, found.join('\n'));
    assert.match(found[0], /Dockerfile:1: java 25 закреплена вторым местом/);
    assert.match(found[0], /версию берут из mise\.toml доводом сборки/, 'отказ называет выход');
  } finally {
    await rm(derived, { recursive: true, force: true });
    await rm(pinned, { recursive: true, force: true });
  }
});

// REQ-BUILD-004
test('описание конвейера сверяется наравне с образом', async () => {
  const root = await project({
    'mise.toml': MISE,
    '.github/workflows/check.yml': 'jobs:\n  check:\n    steps:\n      - uses: actions/setup-node@v4\n        with:\n          node-version: "22.22.3"\n',
  });
  try {
    const found = await pinnings(root);

    assert.equal(found.length, 1, found.join('\n'));
    assert.match(found[0], /\.github\/workflows\/check\.yml:6: node 22\.22\.3/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-BUILD-004
test('перечень сборочной оснастки включает образы на любой глубине и конвейер', async () => {
  const root = await project({
    'mise.toml': MISE,
    'Dockerfile': 'FROM scratch\n',
    'docker/build.dockerfile': 'FROM scratch\n',
    'scripts/build-runner/Dockerfile': 'FROM scratch\n',
    '.github/workflows/check.yml': 'jobs: {}\n',
    'docs/requirements/build.md': 'node 22.22.3 в тексте требования\n',
  });
  try {
    const found = await toolingFiles(root);

    assert.deepEqual(found, ['.github/workflows/check.yml', 'Dockerfile', 'docker/build.dockerfile', 'scripts/build-runner/Dockerfile']);
    assert.deepEqual(await pinnings(root), [], 'текст требования оснасткой не является и упоминанием версии не роняет проверку');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
