import { readConfig } from '../config.mjs';

// REQ-STORE-001
export const STORE_KINDS = ['files', 'external'];

// REQ-STORE-002
const STORE_KEYS = new Set(['kind', 'url', 'readKeyEnv', 'writeKeyEnv', 'idPattern']);

// REQ-STORE-003
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

// REQ-STORE-002
export function storeDeclaration(config) {
  const declared = config.store;
  if (declared === undefined) return { store: null, problems: [] };
  const problems = [];
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) {
    return { store: null, problems: ['store: объект с полем kind — files или external'] };
  }
  for (const key of Object.keys(declared)) {
    if (!STORE_KEYS.has(key)) problems.push(`store: неизвестный ключ ${key}; ключи — ${[...STORE_KEYS].join(', ')}`);
  }
  if (!STORE_KINDS.includes(declared.kind)) {
    problems.push(`store.kind=${JSON.stringify(declared.kind)}: ${STORE_KINDS.join(' или ')}`);
    return { store: null, problems };
  }
  if (declared.kind === 'files') {
    for (const key of Object.keys(declared).filter((one) => one !== 'kind' && STORE_KEYS.has(one))) {
      problems.push(`store.${key}: у хранилища files такого поля нет`);
    }
    return { store: null, problems };
  }
  try {
    const url = new URL(declared.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    if (url.username !== '' || url.password !== '') {
      problems.push('store.url: адрес без учётных данных — ключ берётся из окружения');
    }
  } catch {
    problems.push('store.url: адрес хранилища по http или https');
  }
  for (const key of ['readKeyEnv', 'writeKeyEnv']) {
    if (declared[key] !== undefined && !ENV_NAME.test(String(declared[key]))) {
      problems.push(`store.${key}: имя переменной окружения, а не сам ключ`);
    }
  }
  if (declared.readKeyEnv === undefined && declared.writeKeyEnv === undefined) {
    problems.push('store: назовите переменную окружения с ключом — readKeyEnv, writeKeyEnv или обе');
  }
  let pattern = null;
  try {
    if (typeof declared.idPattern !== 'string' || declared.idPattern === '') throw new Error('empty');
    pattern = new RegExp(`^(?:${declared.idPattern})$`);
  } catch {
    problems.push('store.idPattern: регулярное выражение номера задачи, например "DRIAD-\\\\d+|LS-[A-Z]{2,5}-\\\\d{3}"');
  }
  if (problems.length > 0) return { store: null, problems };
  return {
    store: {
      kind: 'external',
      url: String(declared.url).replace(/\/+$/, ''),
      readKeyEnv: declared.readKeyEnv ?? null,
      writeKeyEnv: declared.writeKeyEnv ?? null,
      idPattern: declared.idPattern,
      pattern,
    },
    problems: [],
  };
}

// REQ-STORE-001
export async function externalStore(root, config = null) {
  const { store, problems } = storeDeclaration(config ?? await readConfig(root));
  if (problems.length > 0) {
    throw new Error(`.conventions.json не принят:\n- ${problems.join('\n- ')}`);
  }
  return store;
}

// REQ-STORE-016
export function filesOnly(command) {
  return `Команда ${command} работает только с задачами и выпусками в файлах.`
    + ' Проект ведёт их во внешнем хранилище (store в .conventions.json): сводки, номера и принятие цикла — его забота';
}
