import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(here, '../../..');

function imported(pom, artifact, from = 0) {
  const at = pom.indexOf(`<artifactId>${artifact}</artifactId>`, from);
  if (at === -1) return null;
  const version = /<version>([^<]+)<\/version>/.exec(pom.slice(at, at + 400))?.[1];
  const property = /^\$\{(.+)\}$/.exec(version ?? '')?.[1];
  const value = property ? new RegExp(`<${property.replaceAll('.', '\\.')}>([^<]+)</`).exec(pom)?.[1] : version;
  return { at, version: value };
}

function atLeast(version, fixed) {
  const one = version.split('.').map(Number);
  const other = fixed.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (one[index] !== other[index]) return one[index] > other[index];
  }
  return true;
}

// REQ-DEPS-004, REQ-DEPS-005
test('корневой POM закрепляет исправленные наборы Jackson раньше набора Spring Boot', async () => {
  const pom = await readFile(path.join(CORE, 'pom.xml'), 'utf8');
  const boot = imported(pom, 'spring-boot-dependencies');
  for (const [artifact, fixed] of [['jackson-bom', '3.1.6'], ['jackson-bom', '2.21.6']]) {
    const groupAt = pom.indexOf(fixed.startsWith('3.') ? '<groupId>tools.jackson</groupId>' : '<groupId>com.fasterxml.jackson</groupId>');
    assert.notEqual(groupAt, -1, `набор ${artifact} ${fixed.slice(0, 1)}.x не импортирован`);
    const declared = imported(pom, artifact, groupAt);
    assert.ok(declared !== null, `набор ${artifact} ${fixed.slice(0, 1)}.x не импортирован`);
    assert.ok(atLeast(declared.version, fixed), `${artifact} ${declared.version} ниже исправленного ${fixed}`);
    assert.ok(groupAt < boot.at, `${artifact} ${fixed.slice(0, 1)}.x объявлен после spring-boot-dependencies: при импорте побеждает первый`);
  }
});
