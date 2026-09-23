import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changesHistory, releaseTags, reportLines } from '../release/changes.mjs';
import { DEFAULT_TIMEOUT_SECONDS, askTheService } from '../health.mjs';
import { DEFAULT_TIMEOUT_SECONDS as ABSENT_TIMEOUT_SECONDS, askForAbsent } from '../unknown-path.mjs';
import { DEFAULT_TOOLS, dependenciesUnchanged, recordDependencies } from '../dependencies-state.mjs';
import { commitsWithoutATicket } from '../release/cycle.mjs';
import { readConfig } from '../config.mjs';
import { deployment } from '../components.mjs';
import { deployCall, deployLines, deployUsage } from '../deploy-entry.mjs';
import { HELP } from './arguments.mjs';
import { launchKeys } from '../jvm.mjs';
import { deployedAsFile, deployedInContainer } from '../deployed.mjs';
import { MANIFEST, appendJournal, buildManifest, writeManifest } from '../manifest.mjs';

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

// REQ-DEPLOYMENT-018
export async function unknown(url, timeout, { usage, refuse }) {
  if (!url) {
    refuse(usage.unknown, 'проверка неизвестного адреса требует адреса сайта: ключ --url');
    return;
  }
  const seconds = timeout === undefined ? ABSENT_TIMEOUT_SECONDS : Number(timeout);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    refuse(usage.unknown, `предел ожидания должен быть положительным числом секунд: ${timeout}`);
    return;
  }
  const answer = await askForAbsent(url, { timeoutSeconds: seconds });
  if (!answer.proved) {
    console.error('Неизвестный адрес отвечает не как неизвестный:');
    for (const reason of answer.reasons) console.error(`- ${reason}`);
    // REQ-DEPLOYMENT-018
    console.error('Правило по расширению ставят после префиксов API с признаком точного совпадения:'
      + ' совпавшее регулярное выражение побеждает обычный префикс');
    process.exitCode = 1;
    return;
  }
  console.log(`Неизвестный адрес отвечает как неизвестный: спрошено адресов ${answer.asked}`);
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

// REQ-DEPLOYMENT-015
export async function components(root, { environments = false, full = false } = {}) {
  const declared = deployment(await readConfig(root));
  if (!declared.declared) {
    console.error('Развёртывание не объявлено: добавьте раздел deployment в .conventions.json');
    // REQ-DEPLOYMENT-019
    console.error('  {"deployment": {"environments": ["local", "qa", "production"],'
      + ' "components": {"backend": {"artifact": "..."}}}}');
    process.exitCode = 1;
    return;
  }
  if (declared.problems.length > 0) {
    console.error('Объявление развёртывания не принято:');
    for (const problem of declared.problems) console.error(`- ${problem}`);
    process.exitCode = 1;
    return;
  }
  if (environments) {
    for (const name of declared.environments) console.log(name);
    return;
  }
  // REQ-DEPLOYMENT-020
  if (full) {
    for (const one of declared.components) {
      console.log([one.name, one.artifact, one.install ?? '', one.verify ?? ''].join('\t'));
    }
    return;
  }
  for (const one of declared.components) console.log(one.name);
}

// REQ-PUBLISHING-015
async function recordedHistory() {
  const packaged = new URL('../../changes.json', import.meta.url);
  try {
    return JSON.parse(await readFile(packaged, 'utf8')).history;
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
  }
  const repository = fileURLToPath(new URL('../../../../', import.meta.url));
  return (await releaseTags(repository)).length === 0 ? null : changesHistory(repository);
}

// REQ-PUBLISHING-015
export async function upgradeReport(parsed, { usage, refuse }) {
  const from = parsed.values.get('--from');
  const to = parsed.values.get('--to') ?? null;
  const version = /^\d+\.\d+\.\d+$/;
  if (from === undefined) {
    refuse(usage['upgrade-report'], 'отчёт требует версии, с которой обновляются: ключ --from X.Y.Z');
    return;
  }
  for (const [key, value] of [['--from', from], ['--to', to]]) {
    if (value !== null && !version.test(value)) {
      refuse(usage['upgrade-report'], `${key} требует версии вида X.Y.Z: ${value}`);
      return;
    }
  }
  const history = await recordedHistory();
  if (history === null) {
    console.error('Истории изменений нет: пакет собран без changes.json.'
      + ' Обновитесь на версию, собранную с историей, или сделайте заявку в ядро (REQ-ADOPTION-019)');
    process.exitCode = 1;
    return;
  }
  for (const line of reportLines(history, { from, to })) console.log(line);
}

// REQ-DEPLOYMENT-011
export function jvmArgs(parsed, { usage, refuse }) {
  const answer = launchKeys({ archive: parsed.values.get('--archive'), aot: parsed.values.get('--aot') });
  if (answer.problems.length > 0) {
    refuse(usage['jvm-args'], answer.problems[0]);
    return;
  }
  for (const key of answer.keys) console.log(key);
}

// REQ-DEPLOYMENT-019
export async function deployArgs(root, argv, { usage, refuse }) {
  const separator = argv.indexOf('--');
  // REQ-RELEASE-028
  if (separator === -1 || argv.slice(0, separator).includes(HELP)) {
    if (argv.includes(HELP)) {
      console.log(usage['deploy-args']);
      return;
    }
    if (argv.includes('--usage')) {
      console.log(deployUsage(deployment(await readConfig(root))));
      return;
    }
    refuse(usage['deploy-args'], 'доводы скрипта передаются после --; форму вызова печатает ключ --usage');
    return;
  }
  const config = await readConfig(root);
  const form = deployUsage(deployment(config));
  const call = deployCall(config, argv.slice(separator + 1));
  if (call.usage) {
    console.log(form);
    return;
  }
  if (call.problems.length > 0) {
    console.error('Вызов развёртывания не принят:');
    for (const problem of call.problems) console.error(`- ${problem}`);
    console.error(`Форма вызова:\n${form}`);
    // REQ-DEPLOYMENT-021
    console.error('Ключи проекта объявляются в deployment.arguments: имя, берёт ли значение, пояснение');
    process.exitCode = 2;
    return;
  }
  for (const line of deployLines(call)) console.log(line);
}

// REQ-DEPLOYMENT-016
export async function deployed(root, parsed, { usage, refuse }) {
  const artifact = parsed.values.get('--artifact');
  const container = parsed.values.get('--container');
  const installed = parsed.values.get('--installed');
  const label = parsed.values.get('--label');
  if (!artifact) {
    refuse(usage.deployed, 'сверка требует собранного артефакта: ключ --artifact');
    return;
  }
  if ((container === undefined) === (installed === undefined)) {
    refuse(usage.deployed, 'назовите одно из двух: --container с --label либо --installed');
    return;
  }
  if (container !== undefined && !label) {
    refuse(usage.deployed, 'сверка по контейнеру требует метки: ключ --label');
    return;
  }
  const answer = container !== undefined
    ? await deployedInContainer(root, { artifact, container, label })
    : await deployedAsFile(root, { artifact, installed });
  if (!answer.proved) {
    console.error(`Развёрнутое не подтвердило, что оно собранное: ${answer.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Развёрнуто собранное: ${answer.value.slice(0, 12)}`);
}

// REQ-DEPLOYMENT-002
export async function manifest(root, parsed, { usage, refuse }) {
  const environment = parsed.values.get('--env');
  if (!environment) {
    refuse(usage.manifest, 'манифест требует имени среды: ключ --env');
    return;
  }
  const only = parsed.values.get('--only')?.split(',').map((one) => one.trim()).filter(Boolean) ?? null;
  const built = await buildManifest(root, await readConfig(root), {
    environment,
    only,
    reason: parsed.values.get('--untagged-reason') ?? null,
  });
  if (!built.written) {
    console.error(`Манифест не записан: ${built.reason}`);
    process.exitCode = 1;
    return;
  }
  const file = await writeManifest(root, built.manifest, parsed.values.get('--file') ?? MANIFEST);
  console.log(`Манифест записан: ${file}`);
  const journal = parsed.values.get('--journal');
  if (journal !== undefined) console.log(`Журнал дополнен: ${await appendJournal(journal, built.manifest)}`);
}
