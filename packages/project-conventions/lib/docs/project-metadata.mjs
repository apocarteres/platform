import { ALLOWED_METADATA_FIELDS, DOCUMENT_TYPES } from './check-docs.mjs';

// REQ-PROJECT-PROCESS-024
const FIELD_KEYS = new Set(['types', 'values', 'index', 'done']);

// REQ-PROJECT-PROCESS-024
const FIELD_NAME = /^[a-z][a-z0-9-]*$/;

// REQ-PROJECT-PROCESS-024
const CORE_ONLY = new Set([...ALLOWED_METADATA_FIELDS, 'ticket']);

const strings = (value) => Array.isArray(value) && value.length > 0 && value.every((one) => typeof one === 'string' && one.length > 0);

// REQ-PROJECT-PROCESS-024
export function metadataDeclaration(config) {
  const declared = config.metadata?.fields ?? {};
  const fields = new Map();
  const problems = [];
  const where = 'metadata.fields';
  for (const [name, field] of Object.entries(declared)) {
    if (!FIELD_NAME.test(name)) {
      problems.push(`${where}: имя поля «${name}» — строчные латинские буквы, цифры и дефис`);
      continue;
    }
    if (CORE_ONLY.has(name)) {
      problems.push(`${where}: поле ${name} — поле ядра; объявите своё имя`);
      continue;
    }
    for (const key of Object.keys(field ?? {})) {
      if (!FIELD_KEYS.has(key)) problems.push(`${where}: ${name}: неизвестный ключ ${key}; ключи — ${[...FIELD_KEYS].join(', ')}`);
    }
    if (!strings(field?.types)) problems.push(`${where}: ${name}: types — перечень типов документов`);
    for (const type of strings(field?.types) ? field.types : []) {
      if (!DOCUMENT_TYPES.has(type)) problems.push(`${where}: ${name}: тип ${type} неизвестен; известны ${[...DOCUMENT_TYPES].join(', ')}`);
    }
    if (!strings(field?.values)) problems.push(`${where}: ${name}: values — перечень допустимых значений`);
    const values = strings(field?.values) ? field.values : [];
    if (field?.index !== undefined && typeof field.index !== 'boolean') problems.push(`${where}: ${name}: index — true или false`);
    const done = field?.done ?? [];
    const stray = Array.isArray(done) ? done.filter((value) => !values.includes(value)) : [];
    if (!Array.isArray(done) || stray.length > 0) problems.push(`${where}: ${name}: done — значения из values: ${stray.join(', ') || done}`);
    fields.set(name, { types: field?.types ?? [], values, index: field?.index === true, done: Array.isArray(done) ? done : [] });
  }
  return { fields, problems };
}

// REQ-PROJECT-PROCESS-024
export function projectFieldErrors(fields) {
  return (relativePath, metadata) => {
    const errors = [];
    const type = metadata.get('type');
    for (const [name, field] of fields) {
      if (!metadata.has(name)) continue;
      const value = metadata.get(name);
      if (!field.types.includes(type)) {
        errors.push(`${relativePath}: поле ${name} объявлено только для типов ${field.types.join(', ')}, а документ — ${type}`);
        continue;
      }
      if (!field.values.includes(value)) {
        errors.push(`${relativePath}: поле ${name}: значение ${value} не из ${field.values.join(', ')}`);
        continue;
      }
      if (type === 'ticket' && metadata.get('status') === 'done' && field.done.length > 0 && !field.done.includes(value)) {
        errors.push(`${relativePath}: задача выполнена, а ${name} — ${value}; для done нужно ${field.done.join(' или ')}`);
      }
    }
    return errors;
  };
}
