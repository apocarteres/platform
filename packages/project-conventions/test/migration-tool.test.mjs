import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { findFlyway } from '../lib/migration-tool.mjs';
import { RECOMMENDATION, RULES } from '../lib/rules.mjs';

// REQ-DATA-ACCESS-008
test('Flyway в зависимостях проекта называется рекомендацией со ссылкой на обязательство, Liquibase — нет', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'migration-tool-'));
  try {
    await writeFile(path.join(root, 'pom.xml'), '<project>\n  <dependencies>\n    <dependency>\n      <groupId>org.liquibase</groupId>\n'
      + '      <artifactId>liquibase-core</artifactId>\n    </dependency>\n  </dependencies>\n</project>\n');
    await mkdir(path.join(root, 'service'), { recursive: true });
    await writeFile(path.join(root, 'service/pom.xml'), '<project>\n  <dependencies>\n    <dependency>\n      <groupId>org.flywaydb</groupId>\n'
      + '      <artifactId>flyway-core</artifactId>\n    </dependency>\n  </dependencies>\n</project>\n');
    await writeFile(path.join(root, 'service/build.gradle.kts'), 'dependencies {\n  implementation("org.flywaydb:flyway-database-postgresql")\n}\n');

    const found = await findFlyway(root);
    assert.deepEqual([...found.keys()].sort(), ['service/build.gradle.kts', 'service/pom.xml']);
    assert.equal(found.get('service/pom.xml')[0].line, 4);
    assert.match(found.get('service/pom.xml')[0].text, /Liquibase.*liquibase-migrations/);
    assert.equal(found.get('service/build.gradle.kts')[0].line, 2);

    const rule = RULES.find((one) => one.id === 'migration-tool');
    assert.equal(rule.level, RECOMMENDATION, 'рекомендация: заставляет обязательство, а не правило');
    assert.equal(rule.document, 'REQ-DATA-ACCESS');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
