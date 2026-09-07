import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { findMoneyFloats, findMoneyViolations } from '../lib/money.mjs';
import { findOversizedFiles } from '../lib/filesize.mjs';
import { findConfigSecrets, findLiteralSecrets, sensitiveKey } from '../lib/secrets.mjs';

async function project(files) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'code-rules-'));
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(root, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return root;
}

test('денежная величина на double и float находится, десятичная — нет', () => {
  const source = [
    'class Billing {',
    '  private double totalPrice;',
    '  private float discountAmount;',
    '  private BigDecimal balance;',
    '  private double latitude;',
    '  double computeFee(int days) { return 0; }',
    '}',
  ].join('\n');
  const found = findMoneyFloats(source);
  assert.deepEqual(found.map((item) => item.line), [2, 3, 6]);
  assert.match(found[0].text, /double totalPrice/);
});

test('денежное слово в строке или комментарии нарушением не считается', () => {
  const source = [
    'class A {',
    '  // double totalPrice здесь только упомянут',
    '  String note = "double totalPrice";',
    '}',
  ].join('\n');
  assert.deepEqual(findMoneyFloats(source), []);
});

test('перечень денежных слов расширяется настройкой проекта', async () => {
  const root = await project({ 'src/A.java': 'class A {\n  private double dkpSpent;\n}\n' });
  try {
    const config = { sources: ['src'] };
    assert.equal((await findMoneyViolations(root, config)).size, 0, 'своё слово по умолчанию неизвестно');
    const extended = await findMoneyViolations(root, { ...config, moneyNames: ['dkp'] });
    assert.deepEqual([...extended.keys()], ['src/A.java']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('файл сверх предела даёт нарушение на каждую лишнюю строку, тесты не считаются', async () => {
  const long = `${Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join('\n')}\n`;
  const root = await project({
    'src/Big.java': long,
    'src/Small.java': 'class Small {}\n',
    'src/BigTest.java': long,
    'src/big.spec.ts': long,
  });
  try {
    const violations = await findOversizedFiles(root, { sources: ['src'], fileLines: 10 });
    assert.deepEqual([...violations.keys()], ['src/Big.java'], 'наборы тестов в проверке размера не участвуют');
    assert.equal(violations.get('src/Big.java').length, 3, 'считаются строки сверх предела');
    assert.equal(violations.get('src/Big.java')[0].line, 11);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('наборы тестов не считаются в любом языке проекта', async () => {
  const long = `${Array.from({ length: 12 }, (_, index) => `line ${index + 1}`).join('\n')}\n`;
  const root = await project({
    'src/test_live_flow.py': long,
    'src/flow_test.py': long,
    'src/flow_spec.rb': long,
    'src/tests/helper.mjs': long,
    'src/FlowSpec.java': long,
    'src/flow.py': long,
  });
  try {
    const violations = await findOversizedFiles(root, { sources: ['src'], fileLines: 10 });
    assert.deepEqual([...violations.keys()], ['src/flow.py'], 'считается только рабочий код');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('чувствительность свойства определяется последней частью имени', () => {
  for (const key of ['spring.datasource.password', 'client-secret', 'recaptcha.site-key', 'auth_token', 'api.key']) {
    assert.equal(sensitiveKey(key), true, key);
  }
  for (const key of ['token-validity-seconds', 'agent.signing.public-key', 'partition.name', 'password-policy-days']) {
    assert.equal(sensitiveKey(key), false, key);
  }
  assert.equal(sensitiveKey('clanlog.mail.sender', ['clanlog.mail.sender']), true, 'перечень проекта дополняет правило');
});

test('литеральное значение чувствительного свойства находится, подстановка и пустое — нет', () => {
  const properties = [
    '# spring.datasource.password=закомментировано',
    'spring.datasource.password=hunter2',
    'spring.data.redis.password=${REDIS_PASSWORD}',
    'app.api-key=',
    'app.timeout=30',
  ].join('\n');
  const found = findLiteralSecrets(properties, 'application.properties');
  assert.deepEqual(found.map((item) => item.line), [2]);

  const yaml = [
    'spring:',
    '  datasource:',
    '    password: ${DB_PASSWORD}',
    '  security:',
    '    client-secret: literal-value',
  ].join('\n');
  assert.deepEqual(findLiteralSecrets(yaml, 'application.yml').map((item) => item.line), [5]);
});

test('проверка секретов читает файлы конфигурации в объявленных источниках', async () => {
  const root = await project({
    'backend/src/main/resources/application.properties': 'spring.datasource.password=plain\n',
    'backend/src/main/resources/application-local.yml': 'redis:\n  password: ${REDIS_PASSWORD}\n',
  });
  try {
    const violations = await findConfigSecrets(root, { sources: ['backend/src'] });
    assert.deepEqual([...violations.keys()], ['backend/src/main/resources/application.properties']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
