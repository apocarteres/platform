import path from 'node:path';

export const releaseIdPattern = /^RELEASE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
export const releaseStatuses = new Set(['draft', 'in_progress', 'blocked', 'released', 'cancelled']);
const releaseFields = ['opened-on', 'released-on', 'commit'];

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function sections(content) {
  const result = new Map();
  const body = content.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  for (const match of body.matchAll(/^## ([^\n]+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)) {
    const name = match[1].trim();
    if (result.has(name)) result.set(name, null);
    else result.set(name, match[2].trim());
  }
  return result;
}

export function validateReleases(documents) {
  const errors = [];
  const releases = new Map();
  const tickets = new Map();
  const byFile = new Map(documents.map(document => [document.file, document]));
  for (const document of documents) {
    const { metadata, file } = document;
    const type = metadata.get('type');
    if (type === 'ticket') tickets.set(metadata.get('id'), document);
    if (type === 'release') {
      const id = metadata.get('id');
      if (!releaseIdPattern.test(id ?? '')) errors.push(`${file}: неверный идентификатор выпуска`);
      if (file !== `docs/releases/${id}.md`) errors.push(`${file}: имя файла выпуска должно совпадать с id`);
      if (releases.has(id)) errors.push(`${file}: повторный идентификатор выпуска`);
      releases.set(id, document);
    } else {
      for (const field of releaseFields) {
        if (metadata.has(field)) errors.push(`${file}: поле ${field} допустимо только для выпуска`);
      }
    }
  }

  const membership = new Map();
  for (const [id, document] of releases) {
    const { metadata, file, content } = document;
    const fail = message => errors.push(`${file}: ${message}`);
    const status = metadata.get('status');
    if (!releaseStatuses.has(status)) fail('неверный статус выпуска');
    if (!validDate(metadata.get('opened-on'))) fail('opened-on должен содержать существующую дату YYYY-MM-DD');
    const parts = sections(content);
    for (const heading of ['Цель', 'Состав', 'Критерии выхода', 'Не входит']) {
      if (!parts.get(heading)) fail(`отсутствует, пуст или повторяется раздел «${heading}»`);
    }
    const scope = parts.get('Состав') ?? '';
    const members = new Set();
    for (const row of scope.split('\n').filter(line => line.trim().startsWith('|'))) {
      if (/^\|\s*Задача\s*\|\s*Причина включения\s*\|$/.test(row)
          || /^\|[\s:|-]+\|$/.test(row)) continue;
      const match = /^\|\s*\[([A-Z][A-Z0-9-]*)\]\(([^)\s]+)\)\s*\|\s*([^|]+)\|\s*$/.exec(row);
      if (!match) { fail('некорректная строка состава; нужны ссылка с id задачи и причина включения'); continue; }
      const [, ticketId, href, reason] = match;
      if (!reason.trim()) fail(`у ${ticketId} не указана причина включения`);
      if (members.has(ticketId)) fail(`задача ${ticketId} повторяется в составе`);
      members.add(ticketId);
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), href));
      const ticket = tickets.get(ticketId);
      if (!ticket || byFile.get(target) !== ticket) { fail(`ссылка ${ticketId} не указывает на соответствующую задачу`); continue; }
      if (ticket.metadata.get('release') !== id) fail(`у ${ticketId} указан другой выпуск или выпуск не назначен`);
      if (membership.has(ticketId) && membership.get(ticketId) !== id) fail(`задача ${ticketId} включена в несколько выпусков`);
      membership.set(ticketId, id);
      if (['in_progress', 'released'].includes(status) && ticket.metadata.get('questions') === 'open') {
        fail(`у ${ticketId} остаются открытые вопросы`);
      }
      if (status === 'released' && ticket.metadata.get('status') !== 'done') fail(`задача ${ticketId} не выполнена`);
    }
    // REQ-RELEASE-007, REQ-RELEASE-009
    if (!members.size && !['draft', 'cancelled'].includes(status)) fail('состав выпуска не может быть пустым');
    const criteria = (parts.get('Критерии выхода') ?? '').split('\n').filter(line => line.trim());
    if (!criteria.length || criteria.some(line => !/^- \[[ x]\] \S/.test(line))) fail('критерии выхода должны быть непустым списком проверок - [ ] или - [x]');
    if (status === 'released') {
      if (!validDate(metadata.get('released-on'))) fail('для выпущенного релиза требуется released-on');
      else if (metadata.get('released-on') < metadata.get('opened-on')) fail('дата выпуска предшествует открытию');
      if (!/^[0-9a-f]{40}$/.test(metadata.get('commit') ?? '')) fail('для выпущенного релиза требуется полный SHA коммита');
      if (!parts.get('Результат')) fail('для выпущенного релиза требуется раздел «Результат» с подтверждением развёртывания');
      if (criteria.some(line => !/^- \[x\] .+ — .+/.test(line))) fail('каждый критерий должен быть отмечен и содержать подтверждение после « — »');
    } else {
      if (metadata.has('released-on') || metadata.has('commit')) fail('released-on и commit допустимы только для выпущенного релиза');
    }
  }
  for (const [id, ticket] of tickets) {
    const release = ticket.metadata.get('release');
    if (release === 'unassigned' || release === 'before-cycle') continue;
    if (!release || !releases.has(release)) errors.push(`${ticket.file}: назначенный выпуск не существует`);
    else if (membership.get(id) !== release) errors.push(`${ticket.file}: задача отсутствует в составе назначенного выпуска`);
  }
  return errors;
}
