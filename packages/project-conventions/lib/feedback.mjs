import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { INSTALLED_DOCS_PATH, SOURCE_DOCS_PATH } from './agents.mjs';
import { CONFIG_FILE, readConfig } from './config.mjs';

const DOCUMENT = 'adoption.md';
const CLAUSE = 'REQ-ADOPTION-019';
const ADDRESS = new RegExp(`${CLAUSE}[^\\n]*?\`(https://[^\`\\s]+)\``);

// REQ-ADOPTION-019
export async function feedbackChannel(root) {
  for (const directory of [SOURCE_DOCS_PATH, INSTALLED_DOCS_PATH]) {
    let text;
    try {
      text = await readFile(path.join(root, directory, DOCUMENT), 'utf8');
    } catch {
      continue;
    }
    const found = ADDRESS.exec(text);
    if (found !== null) return { url: found[1], clause: CLAUSE };
  }
  return null;
}

// REQ-ADOPTION-019
export function feedbackLine(channel) {
  if (channel === null) return null;
  return `Если дело в самом правиле или в дефекте ядра — заявка в ядро: ${channel.url} (${channel.clause}).`;
}

// REQ-ADOPTION-027
export const REPORT_TEMPLATE = '.github/ISSUE_TEMPLATE/consumer-report.md';

// REQ-ADOPTION-027
export function declaredChannel(config) {
  const url = config.feedback?.url;
  if (url === undefined) {
    return { error: `${CONFIG_FILE}: канал заявок не объявлен — укажите адрес ключом feedback.url (REQ-ADOPTION-027)` };
  }
  if (typeof url !== 'string' || !/^https:\/\/[^\s/]+\/\S+$/.test(url)) {
    return { error: `${CONFIG_FILE}: feedback.url — адрес https репозитория, куда пишут заявки: ${JSON.stringify(url)}` };
  }
  const name = url.replace(/\/+$/, '').replace(/\.git$/, '').split('/').at(-1);
  return { url, name };
}

// REQ-ADOPTION-019, REQ-ADOPTION-020, REQ-ADOPTION-025, REQ-ADOPTION-027
export function reportTemplate({ url, name }) {
  return `---
name: Заявка потребителя ${name}
about: Дефект ${name} или правило, в которое упёрся ваш проект
title: "[заявка] "
labels: consumer-report
---

<!-- Заявки в ${name} принимаются здесь: ${url}.
Ответ придёт до закрытия следующего выпуска ${name}: заведённая задача со
ссылкой на эту заявку либо отказ с причиной.

ЗАКРЫТУЮ ЗАЯВКУ НЕ КОММЕНТИРУЙТЕ: комментарии к закрытым заявкам не
обрабатываются. Разбор идёт по перечню открытых, закрытая из него выпадает.
Если после ответа появилось новое обстоятельство, заведите новую заявку и
сошлитесь на исходную: «Продолжение #NN». Срок ответа получает заявка,
комментарий — нет.

Шаблон записан командой conventions feedback-template по REQ-ADOPTION-027. -->

## Проект и версия ${name}

Проект:
Версия ${name}:

## Что происходит

<!-- Наблюдаемое поведение. Если это гипотеза, а не подтверждённая находка,
скажите об этом прямо и назовите способ проверки. -->

## Чем подтверждено

<!-- Отказ теста, измерение, наблюдение на стенде или точная ссылка на код
${name}. Вывод команд приводите как есть. -->

## Задача в вашем проекте

<!-- Идентификатор задачи в вашем проекте и ссылка на неё, если репозиторий
доступен. -->

## Ожидаемый результат

<!-- Что вы ждёте от ${name}. Если видите решение — назовите его; если нет,
достаточно описать нужный исход. -->
`;
}

// REQ-ADOPTION-027
export async function writeReportTemplate(root) {
  const channel = declaredChannel(await readConfig(root));
  if (channel.error) return { refused: channel.error };
  const file = path.join(root, REPORT_TEMPLATE);
  const wanted = reportTemplate(channel);
  let present = null;
  try {
    present = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (present === wanted) return { unchanged: true };
  if (present !== null) {
    return { differs: `${REPORT_TEMPLATE} отличается от формы ядра; удалите его, чтобы записать заново, либо держите свою форму без этой команды` };
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, wanted);
  return { written: true };
}
