import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// REQ-NOTIFICATIONS-008
const here = path.dirname(fileURLToPath(import.meta.url));
export const CONTRACT = path.resolve(here, '../../../platform-notifications/src/main/resources/openapi/platform-notifications.openapi.json');
export const TYPES = path.resolve(here, '../src/contract.ts');
export const COPY = path.resolve(here, '../openapi/platform-notifications.openapi.json');

// REQ-NOTIFICATIONS-008
function typeOf(schema) {
  if (schema.$ref) return schema.$ref.slice(schema.$ref.lastIndexOf('/') + 1);
  if (schema.oneOf) return schema.oneOf.map(typeOf).join(' | ');
  if (schema.enum) return schema.enum.map((value) => `'${value}'`).join(' | ');
  if (Array.isArray(schema.type)) return schema.type.map((type) => typeOf({ ...schema, type })).join(' | ');
  if (schema.type === 'null') return 'null';
  if (schema.type === 'integer' || schema.type === 'number') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'array') return `readonly ${typeOf(schema.items)}[]`;
  if (schema.type === 'object') {
    const values = typeof schema.additionalProperties === 'object' ? typeOf(schema.additionalProperties) : 'unknown';
    return `Readonly<Record<string, ${values}>>`;
  }
  return 'string';
}

// REQ-NOTIFICATIONS-008
export function contractTypes(contract) {
  const lines = ['// REQ-NOTIFICATIONS-008', ''];
  for (const [name, schema] of Object.entries(contract.components.schemas)) {
    if (schema.enum) {
      lines.push(`export type ${name} = ${typeOf(schema)};`, '');
      continue;
    }
    const required = new Set(schema.required ?? []);
    lines.push(`export interface ${name} {`);
    for (const [field, property] of Object.entries(schema.properties ?? {})) {
      lines.push(`  readonly ${field}${required.has(field) ? '' : '?'}: ${typeOf(property)};`);
    }
    lines.push('}', '');
  }
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = readFileSync(CONTRACT, 'utf8');
  writeFileSync(TYPES, contractTypes(JSON.parse(source)));
  writeFileSync(COPY, source);
}
