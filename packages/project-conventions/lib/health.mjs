// REQ-DEPLOYMENT-006
export const DEFAULT_TIMEOUT_SECONDS = 10;

// REQ-DEPLOYMENT-006
export const HEALTHY = 'UP';

// REQ-DEPLOYMENT-006
function jsonType(contentType) {
  return /^application\/(?:[\w.+-]+\+)?json\b/i.test(contentType ?? '');
}

// REQ-DEPLOYMENT-006
export function judge({ status, contentType, body }) {
  if (status !== 200) {
    return { healthy: false, reason: `сервис ответил кодом ${status}, ожидался 200` };
  }
  // REQ-DEPLOYMENT-006
  if (!jsonType(contentType)) {
    return {
      healthy: false,
      reason: `ответ не документ состояния: тип «${contentType ?? 'не указан'}», ожидался JSON.`
        + ' Так отвечает не сервис, а то, что стоит перед ним: путь состояния не проксируется'
        + ' и падает в обработчик одностраничного приложения',
    };
  }
  let document;
  try {
    document = JSON.parse(body);
  } catch {
    return { healthy: false, reason: 'ответ объявлен как JSON, но не разбирается' };
  }
  if (document?.status !== HEALTHY) {
    return { healthy: false, reason: `состояние сервиса «${document?.status ?? 'не названо'}», ожидалось ${HEALTHY}` };
  }
  return { healthy: true, status: document.status };
}

// REQ-DEPLOYMENT-006
export async function askTheService(url, { timeoutSeconds = DEFAULT_TIMEOUT_SECONDS, fetcher = fetch } = {}) {
  const limit = AbortSignal.timeout(timeoutSeconds * 1000);
  let answer;
  try {
    answer = await fetcher(url, { signal: limit, redirect: 'manual' });
  } catch (failure) {
    // REQ-QUALITY-005
    const reason = failure.name === 'TimeoutError'
      ? `сервис не ответил за ${timeoutSeconds} с`
      : `обращение не удалось: ${failure.message}`;
    return { healthy: false, reason };
  }
  return judge({
    status: answer.status,
    contentType: answer.headers.get('content-type'),
    body: await answer.text(),
  });
}
