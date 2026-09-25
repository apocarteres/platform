import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

// REQ-DEPLOYMENT-024
export const DEFAULT_TIMEOUT_SECONDS = 10;

// REQ-DEPLOYMENT-024
export const ENTRY = 'index.html';

// REQ-DEPLOYMENT-022, REQ-DEPLOYMENT-023
const HASHED = /[.-][A-Za-z0-9]{8,}\.(?:js|mjs|css)$/;

// REQ-DEPLOYMENT-024
export async function builtFiles(directory) {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries.filter((entry) => entry.isFile())
    .map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort();
}

// REQ-DEPLOYMENT-023
function immutable(cacheControl) {
  return /\bimmutable\b/i.test(cacheControl ?? '');
}

// REQ-DEPLOYMENT-023
function uncached(cacheControl) {
  return /\bno-store\b/i.test(cacheControl ?? '');
}

// REQ-DEPLOYMENT-022, REQ-DEPLOYMENT-023
export function judgeEntry({ status, cacheControl, body, built }) {
  const reasons = [];
  if (status !== 200) return [`/${ENTRY}: ответ ${status}, ожидался 200`];
  if (!uncached(cacheControl)) {
    reasons.push(`/${ENTRY}: Cache-Control «${cacheControl ?? 'не указан'}» без no-store — браузер запомнит точку входа прежней сборки`);
  }
  if (body.trim() !== built.trim()) {
    reasons.push(`/${ENTRY}: отдана не текущая сборка — точка входа пришла из архива или из прежней раскладки`);
  }
  return reasons;
}

// REQ-DEPLOYMENT-022, REQ-DEPLOYMENT-023
export function judgeServed({ path: asked, status, cacheControl, role }) {
  if (status !== 200) return [`${asked}: ${role} ответил ${status}, ожидался 200`];
  if (!immutable(cacheControl)) return [`${asked}: ${role} без immutable в Cache-Control («${cacheControl ?? 'не указан'}»)`];
  return [];
}

// REQ-DEPLOYMENT-024, REQ-CLIENT-UPDATE-006
const NO_REFERRER = /(?:^|[\s,])no-referrer(?:$|[\s,])/i;

// REQ-DEPLOYMENT-024, REQ-CLIENT-UPDATE-006
export function referrerWarning({ referrerPolicy, body }) {
  const meta = /<meta\s[^>]*name=["']?referrer["']?[^>]*content=["']?([^"'>]+)/i.exec(body ?? '')?.[1]
    ?? /<meta\s[^>]*content=["']?([^"'>]+)["']?[^>]*name=["']?referrer/i.exec(body ?? '')?.[1];
  const found = [referrerPolicy, meta].filter((one) => one && NO_REFERRER.test(one));
  if (found.length === 0) return null;
  return `/${ENTRY}: политика no-referrer — по http браузер не пошлёт ни Sec-Fetch-Site, ни Referer, и старая сборка без заголовка`
    + ' версии API пройдёт мимо проверки (REQ-CLIENT-UPDATE-006); по https признак браузера остаётся';
}

// REQ-DEPLOYMENT-023
export function judgeAbsent({ path: asked, status, cacheControl }) {
  const reasons = [];
  if (status !== 404) reasons.push(`${asked}: выдуманный файл ответил ${status}, ожидался 404`);
  if (immutable(cacheControl)) reasons.push(`${asked}: отказ несёт вечный кэш — браузер запомнит отказ на имя, которое может появиться`);
  return reasons;
}

// REQ-DEPLOYMENT-024
async function ask(fetcher, url, seconds) {
  try {
    const answer = await fetcher(url, { signal: AbortSignal.timeout(seconds * 1000), redirect: 'manual' });
    return {
      status: answer.status,
      cacheControl: answer.headers.get('cache-control'),
      referrerPolicy: answer.headers.get('referrer-policy'),
      body: await answer.text(),
    };
  } catch (failure) {
    // REQ-QUALITY-005
    return { failure: failure.name === 'TimeoutError' ? `не ответил за ${seconds} с` : `обращение не удалось: ${failure.message}` };
  }
}

// REQ-DEPLOYMENT-024
export async function checkStatic(base, { artifact, previous = [], timeoutSeconds = DEFAULT_TIMEOUT_SECONDS, fetcher = fetch, token = randomUUID() }) {
  const origin = base.replace(/\/+$/, '');
  const files = await builtFiles(artifact);
  const reasons = [];
  const warnings = [];
  // CORE-OPS-096
  if (!files.includes(ENTRY)) return { proved: false, reasons: [`в сборке ${artifact} нет ${ENTRY}: назовите составляющую клиента`], warnings, asked: 0 };
  const hashed = files.find((file) => HASHED.test(file) && file.endsWith('.js')) ?? files.find((file) => HASHED.test(file));
  if (hashed === undefined) {
    reasons.push(`в сборке ${artifact} нет файлов с отпечатком в имени: вечный кэш и архив держатся на отпечатке, включите outputHashing`);
  }
  const built = await readFile(path.join(artifact, ENTRY), 'utf8');
  const questions = [
    { path: `/${ENTRY}`, judge: (answer) => {
      const warning = referrerWarning(answer);
      if (warning !== null) warnings.push(warning);
      return judgeEntry({ ...answer, built });
    } },
    ...(hashed === undefined ? [] : [{ path: `/${hashed}`, judge: (answer) => judgeServed({ ...answer, path: `/${hashed}`, role: 'файл текущей сборки' }) }]),
    { path: `/nonexistent-${token}.0badc0de.js`, judge: (answer) => judgeAbsent({ ...answer, path: `/nonexistent-${token}.0badc0de.js` }) },
    ...previous.map((one) => {
      const asked = `/${one.replace(/^\/+/, '')}`;
      return { path: asked, judge: (answer) => judgeServed({ ...answer, path: asked, role: 'кусок прежней сборки' }) };
    }),
  ];
  for (const question of questions) {
    const answer = await ask(fetcher, `${origin}${question.path}`, timeoutSeconds);
    if (answer.failure !== undefined) {
      reasons.push(`${question.path}: ${answer.failure}`);
      continue;
    }
    reasons.push(...question.judge(answer));
  }
  return {
    proved: reasons.length === 0,
    reasons,
    warnings,
    asked: questions.length,
    unchecked: previous.length === 0 ? 'архив прежних кусков не проверен: назовите кусок прежней сборки ключом --previous <путь>' : null,
  };
}
