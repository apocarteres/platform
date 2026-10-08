import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { checkMail, findMailProblems, mail } from '../lib/mail.mjs';

const DOMAIN = 'shop.example.test';

function declared(extra = {}) {
  return { mail: { domain: DOMAIN, dkim: ['provider'], returnPath: `send.${DOMAIN}`, ...extra } };
}

// REQ-MAIL-002
function zone(records) {
  const asked = [];
  return {
    asked,
    lookup: async (name, type) => {
      asked.push(`${type} ${name}`);
      return records[`${type} ${name}`] ?? [];
    },
  };
}

const GOOD = {
  [`TXT provider._domainkey.${DOMAIN}`]: ['v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC'],
  [`TXT send.${DOMAIN}`]: ['v=spf1 include:amazonses.com ~all'],
  [`MX send.${DOMAIN}`]: ['feedback-smtp.example.test'],
  [`TXT _dmarc.${DOMAIN}`]: ['v=DMARC1; p=quarantine; rua=mailto:dmarc@shop.example.test'],
};

// REQ-MAIL-001
test('без раздела молчит, полное объявление принимается, изъяны названы', async () => {
  assert.deepEqual(mail({}), { declared: false, problems: [] });
  const section = mail(declared());
  assert.deepEqual(section.problems, []);
  assert.equal(section.returnPath, `send.${DOMAIN}`);
  assert.equal(mail({ mail: { domain: DOMAIN, dkim: ['provider'] } }).returnPath, DOMAIN, 'без адреса возврата SPF ищется у самого домена');

  const problems = mail({ mail: { domain: 'Shop', dkim: [], returnPath: 'elsewhere.test', apiKey: 'x', extra: 1 } }).problems;
  for (const expected of [/домен domain/, /селекторы DKIM/, /returnPath — домен отправителя или его поддомен/,
    /apiKey похоже на учётные данные/, /неизвестное поле extra/]) {
    assert.ok(problems.some((problem) => expected.test(problem)), `${expected}: ${problems.join('; ')}`);
  }

  const root = await mkdtemp(path.join(os.tmpdir(), 'mail-'));
  try {
    await writeFile(path.join(root, '.conventions.json'), '{\n  "sources": ["src"],\n  "mail": { "domain": "x" }\n}\n');
    assert.equal((await findMailProblems(root, { mail: { domain: 'x' } })).get('.conventions.json')[0].line, 3);
    assert.equal((await findMailProblems(root, {})).size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// REQ-MAIL-002, REQ-MAIL-003
test('проверка: полный домен проходит, ужесточённый DMARC — без совета', async () => {
  const dns = zone(GOOD);
  assert.deepEqual(await checkMail(mail(declared()), dns), { problems: [], advisories: [] });
  assert.ok(dns.asked.includes(`TXT _dmarc.${DOMAIN}`), dns.asked.join('\n'));
});

// REQ-MAIL-002
test('проверка называет каждую отсутствующую или неверную запись', async () => {
  const dns = zone({
    [`TXT provider._domainkey.${DOMAIN}`]: ['v=DKIM1; k=rsa; p='],
    [`TXT send.${DOMAIN}`]: ['v=spf1 include:a.test ~all', 'v=spf1 include:b.test ~all'],
  });
  const { problems } = await checkMail(mail(declared({ dkim: ['provider', 'second'] })), dns);
  assert.deepEqual(problems, [
    `DKIM provider._domainkey.${DOMAIN}: ключ отозван — p= пуст`,
    `DKIM second._domainkey.${DOMAIN}: записи нет`,
    `SPF send.${DOMAIN}: записей v=spf1 две — получатель отвергнет обе, нужна одна`,
    `MX send.${DOMAIN}: записи нет — отказы доставки некуда вернуть`,
    `DMARC _dmarc.${DOMAIN}: записи нет — подделка писем от имени домена ничем не отсекается`,
  ]);
});

// REQ-MAIL-003
test('DMARC p=none — совет ужесточить, а не отказ; политика без p= — отказ', async () => {
  const relaxed = zone({ ...GOOD, [`TXT _dmarc.${DOMAIN}`]: ['v=DMARC1; p=none; rua=mailto:dmarc@shop.example.test'] });
  const found = await checkMail(mail(declared()), relaxed);
  assert.deepEqual(found.problems, []);
  assert.match(found.advisories[0], /p=none.*quarantine.*reject/);

  const broken = zone({ ...GOOD, [`TXT _dmarc.${DOMAIN}`]: ['v=DMARC1; rua=mailto:dmarc@shop.example.test'] });
  assert.match((await checkMail(mail(declared()), broken)).problems[0], /DMARC .*политика p= — none, quarantine или reject/);
});

// REQ-MAIL-002
test('отказ DNS называется, а не превращается в отсутствие записи', async () => {
  const failing = { lookup: async () => { throw new Error('SERVFAIL'); } };
  const { problems } = await checkMail(mail(declared()), failing);
  assert.ok(problems.every((problem) => /не получен ответ: SERVFAIL/.test(problem)), problems.join('\n'));
});

// REQ-MAIL-001
test('правило mail — рекомендация: объявление не обязательно', async () => {
  const { RULES, RECOMMENDATION } = await import('../lib/rules.mjs');
  const rule = RULES.find((one) => one.id === 'mail');
  assert.equal(rule.level, RECOMMENDATION);
  assert.equal(rule.file, 'mail.md');
  const catalogue = JSON.parse(await readFile(new URL('../obligations.json', import.meta.url), 'utf8'));
  assert.equal(catalogue.obligations.some((one) => one.declares === 'mail'), false, 'обязательства нет');
});
