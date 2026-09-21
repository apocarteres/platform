import { randomUUID } from 'node:crypto';

// REQ-DEPLOYMENT-018
export const DEFAULT_TIMEOUT_SECONDS = 10;

// REQ-DEPLOYMENT-018
export const ABSENT = 404;

// REQ-DEPLOYMENT-018
const SHAPES = ['{}.js', '{}.json', 'assets/{}.css', 'backups/{}.tar.gz', '{}.js.map'];

// REQ-DEPLOYMENT-018
export function absentPaths({ token = randomUUID() } = {}) {
  return SHAPES.map((shape) => `/${shape.replace('{}', `nonexistent-${token}`)}`);
}

// REQ-DEPLOYMENT-018
export function judgeAnswer({ path, status, contentType }) {
  if (status === ABSENT) return null;
  const type = contentType ?? 'не указан';
  if (status === 200) {
    return `${path}: ответ ${status}, тип «${type}» — адрес отвечает содержимым, которого не существует.`
      + ' Так отвечает обработчик одностраничного приложения, поставленный на все пути:'
      + ' разбор того, что отдаётся наружу, по кодам ответа становится невозможен';
  }
  return `${path}: ответ ${status}, ожидался ${ABSENT}`;
}

// REQ-DEPLOYMENT-018
export async function askForAbsent(base, { timeoutSeconds = DEFAULT_TIMEOUT_SECONDS, fetcher = fetch, token } = {}) {
  const origin = base.replace(/\/+$/, '');
  const reasons = [];
  const paths = absentPaths(token === undefined ? {} : { token });
  for (const path of paths) {
    const limit = AbortSignal.timeout(timeoutSeconds * 1000);
    let answer;
    try {
      answer = await fetcher(`${origin}${path}`, { signal: limit, redirect: 'manual' });
    } catch (failure) {
      // REQ-QUALITY-005
      reasons.push(failure.name === 'TimeoutError'
        ? `${path}: не ответил за ${timeoutSeconds} с`
        : `${path}: обращение не удалось: ${failure.message}`);
      continue;
    }
    const complaint = judgeAnswer({
      path,
      status: answer.status,
      contentType: answer.headers.get('content-type'),
    });
    if (complaint !== null) reasons.push(complaint);
  }
  return { proved: reasons.length === 0, asked: paths.length, reasons };
}
