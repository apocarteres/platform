import path from 'node:path';
import { DEFAULT_TIMEOUT_SECONDS, askTheService } from '../health.mjs';
import { DEFAULT_TOOLS, dependenciesUnchanged, recordDependencies } from '../dependencies-state.mjs';
import { commitsWithoutATicket } from '../release/cycle.mjs';

// REQ-BUILD-013
export async function deps(root, parsed, { usage, refuse }) {
  const directory = parsed.values.get('--dir');
  if (!directory) {
    refuse(usage.deps, 'отпечаток зависимостей требует каталога: ключ --dir');
    return;
  }
  const state = parsed.values.get('--state') ?? `target/deps-${path.basename(directory)}.sha256`;
  const tools = (parsed.values.get('--tools') ?? DEFAULT_TOOLS.join(',')).split(',').map((tool) => tool.trim()).filter(Boolean);
  const request = { directory, state, tools };
  if (parsed.flags.has('--record')) {
    const written = await recordDependencies(root, request);
    if (!written.recorded) {
      console.error(`Отпечаток не записан: ${written.reason}`);
      process.exitCode = 2;
      return;
    }
    console.log(`Отпечаток зависимостей ${directory} записан: ${state}`);
    return;
  }
  const answer = await dependenciesUnchanged(root, request);
  if (answer.unchanged) {
    console.log(`Зависимости ${directory} не менялись: ставить нечего`);
    return;
  }
  console.log(`Зависимости ${directory} ставить нужно: ${answer.reason}`);
  console.log(`После установки запишите отпечаток: conventions deps --dir ${directory} --state ${state} --record`);
  process.exitCode = 1;
}

// REQ-DEPLOYMENT-006
export async function health(url, timeout, { usage, refuse }) {
  if (!url) {
    refuse(usage.health, 'проверка работоспособности требует адреса: ключ --url');
    return;
  }
  const seconds = timeout === undefined ? DEFAULT_TIMEOUT_SECONDS : Number(timeout);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    refuse(usage.health, `предел ожидания должен быть положительным числом секунд: ${timeout}`);
    return;
  }
  const answer = await askTheService(url, { timeoutSeconds: seconds });
  if (!answer.healthy) {
    console.error(`Сервис работоспособность не подтвердил: ${answer.reason}`);
    console.error(`Адрес: ${url}`);
    // REQ-QUALITY-014
    console.error('Проверку принимают заведомым отказом: остановите сервис и убедитесь, что шаг падает.');
    process.exitCode = 1;
    return;
  }
  console.log(`Сервис подтвердил работоспособность: ${answer.status}`);
}

// REQ-QUALITY-004
export async function commits(root, range) {
  let found;
  try {
    found = await commitsWithoutATicket(root, range);
  } catch (failure) {
    console.error(`Коммиты прочитать не удалось: ${failure.message}`);
    process.exitCode = 1;
    return;
  }
  if (found.length === 0) {
    console.log(range === null ? 'Все коммиты называют задачу.' : `Все коммиты диапазона ${range} называют задачу.`);
    return;
  }
  console.error('Коммиты, не называющие задачу:');
  for (const commit of found) console.error(`- ${commit.sha.slice(0, 8)}: «${commit.subject}»`);
  // REQ-RELEASE-039
  console.error('Пока коммит не отправлен, сообщение правится: git commit --amend либо интерактивное перебазирование.');
  console.error('После отправки правка сообщения переписала бы общую историю: такой коммит учитывается');
  console.error('в открытом выпуске командой release account <хеш> --reason "<причина>" (REQ-RELEASE-041).');
  process.exitCode = 1;
}
