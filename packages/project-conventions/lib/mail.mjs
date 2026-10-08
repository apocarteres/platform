import { promises as dns } from 'node:dns';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_FILE } from './config.mjs';

// REQ-MAIL-001
const SECTION_FIELDS = new Set(['domain', 'dkim', 'returnPath']);

// REQ-MAIL-001
const CREDENTIAL = /pass|secret|token|key|user|login|credential/i;

// REQ-MAIL-003
const POLICIES = ['none', 'quarantine', 'reject'];

// REQ-MAIL-002
const TIMEOUT_MS = 5000;

const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SELECTOR = /^[a-z0-9]([a-z0-9._-]{0,62})$/i;

// REQ-MAIL-001
export function mail(config) {
  const declared = config.mail ?? null;
  if (declared === null) return { declared: false, problems: [] };
  const problems = [];
  for (const field of Object.keys(declared)) {
    if (SECTION_FIELDS.has(field)) continue;
    problems.push(CREDENTIAL.test(field)
      ? `раздел mail: поле ${field} похоже на учётные данные — ключ почтового сервиса приходит из окружения хоста, а не из репозитория`
      : `раздел mail: неизвестное поле ${field}; поля — ${[...SECTION_FIELDS].join(', ')}`);
  }
  const domain = declared.domain;
  if (typeof domain !== 'string' || !DOMAIN.test(domain)) problems.push('раздел mail: домен domain — имя домена отправителя строчными буквами');
  const dkim = Array.isArray(declared.dkim) ? declared.dkim : [];
  if (dkim.length === 0 || !dkim.every((selector) => typeof selector === 'string' && SELECTOR.test(selector))) {
    problems.push('раздел mail: селекторы DKIM dkim — перечень имён, под которыми почтовый сервис публикует ключи');
  }
  const returnPath = declared.returnPath ?? domain;
  if (typeof returnPath !== 'string' || !(returnPath === domain || returnPath.endsWith(`.${domain}`))) {
    problems.push('раздел mail: returnPath — домен отправителя или его поддомен, куда возвращаются отказы доставки');
  }
  return { declared: true, domain, dkim, returnPath, problems };
}

async function lineOfTheSection(root) {
  try {
    const lines = (await readFile(path.join(root, CONFIG_FILE), 'utf8')).split('\n');
    const found = lines.findIndex((line) => line.includes('"mail"'));
    return found === -1 ? 1 : found + 1;
  } catch {
    return 1;
  }
}

// REQ-MAIL-001
export async function findMailProblems(root, config) {
  const { declared, problems } = mail(config);
  if (!declared || problems.length === 0) return new Map();
  const line = await lineOfTheSection(root);
  return new Map([[CONFIG_FILE, problems.map((text) => ({ line, text }))]]);
}

const ABSENT = new Set(['ENODATA', 'ENOTFOUND']);

async function orNothing(asked) {
  try {
    return await asked;
  } catch (failure) {
    if (ABSENT.has(failure.code)) return [];
    throw failure;
  }
}

// REQ-MAIL-002
async function serversOf(name) {
  const labels = name.split('.');
  for (let at = 0; at < labels.length - 1; at += 1) {
    const names = await orNothing(dns.resolveNs(labels.slice(at).join('.')));
    if (names.length === 0) continue;
    const addresses = (await Promise.all(names.map((one) => orNothing(dns.resolve4(one))))).flat();
    if (addresses.length > 0) return addresses;
  }
  throw new Error(`авторитетные серверы зоны ${name} не найдены`);
}

// REQ-MAIL-002
export async function authoritativeLookup(name, type, depth = 0) {
  const resolver = new dns.Resolver({ timeout: TIMEOUT_MS, tries: 2 });
  resolver.setServers(await serversOf(name));
  if (type === 'MX') return (await orNothing(resolver.resolveMx(name))).map((record) => record.exchange);
  const found = (await orNothing(resolver.resolveTxt(name))).map((chunks) => chunks.join(''));
  if (found.length > 0 || depth > 2) return found;
  const [target] = await orNothing(resolver.resolveCname(name));
  return target === undefined ? [] : authoritativeLookup(target, type, depth + 1);
}

function tagsOf(record) {
  return new Map(record.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const at = part.indexOf('=');
    return at === -1 ? [part.toLowerCase(), ''] : [part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim()];
  }));
}

// REQ-MAIL-002
async function asked(lookup, type, name) {
  try {
    return { records: await lookup(name, type) };
  } catch (failure) {
    return { refused: `${type} ${name}: не получен ответ: ${failure.message}` };
  }
}

// REQ-MAIL-002, REQ-MAIL-003
export async function checkMail(section, { lookup = authoritativeLookup } = {}) {
  const problems = [];
  const advisories = [];
  for (const selector of section.dkim) {
    const name = `${selector}._domainkey.${section.domain}`;
    const found = await asked(lookup, 'TXT', name);
    if (found.refused) problems.push(`DKIM ${found.refused}`);
    else {
      const keys = found.records.filter((record) => /(^|;)\s*p=/i.test(record));
      if (keys.length === 0) problems.push(`DKIM ${name}: записи нет`);
      else if (!keys.some((record) => tagsOf(record).get('p'))) problems.push(`DKIM ${name}: ключ отозван — p= пуст`);
    }
  }
  const spf = await asked(lookup, 'TXT', section.returnPath);
  if (spf.refused) problems.push(`SPF ${spf.refused}`);
  else {
    const records = spf.records.filter((record) => /^v=spf1(\s|$)/i.test(record));
    if (records.length === 0) problems.push(`SPF ${section.returnPath}: записи v=spf1 нет`);
    if (records.length > 1) problems.push(`SPF ${section.returnPath}: записей v=spf1 ${records.length === 2 ? 'две' : records.length} — получатель отвергнет обе, нужна одна`);
  }
  const mx = await asked(lookup, 'MX', section.returnPath);
  if (mx.refused) problems.push(`MX ${mx.refused}`);
  else if (mx.records.length === 0) problems.push(`MX ${section.returnPath}: записи нет — отказы доставки некуда вернуть`);
  const dmarcName = `_dmarc.${section.domain}`;
  const dmarc = await asked(lookup, 'TXT', dmarcName);
  if (dmarc.refused) problems.push(`DMARC ${dmarc.refused}`);
  else {
    const records = dmarc.records.filter((record) => /^v=DMARC1(\s*;|$)/i.test(record));
    if (records.length === 0) problems.push(`DMARC ${dmarcName}: записи нет — подделка писем от имени домена ничем не отсекается`);
    else if (records.length > 1) problems.push(`DMARC ${dmarcName}: записей v=DMARC1 ${records.length} — получатель не применит ни одну`);
    else {
      const policy = tagsOf(records[0]).get('p')?.toLowerCase();
      if (!POLICIES.includes(policy)) problems.push(`DMARC ${dmarcName}: политика p= — none, quarantine или reject`);
      else if (policy === 'none') {
        advisories.push(`DMARC ${dmarcName}: p=none только наблюдает; когда сводки DMARC покажут, что все свои письма проходят, ужесточите до quarantine, затем reject`);
      }
    }
  }
  return { problems, advisories };
}
