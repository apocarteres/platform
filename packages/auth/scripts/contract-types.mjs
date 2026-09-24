import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// REQ-AUTH-020
const here = path.dirname(fileURLToPath(import.meta.url));
export const CONTRACT = path.resolve(here, '../../../platform-auth/src/main/resources/openapi/platform-auth.openapi.json');
export const TYPES = path.resolve(here, '../src/contract.ts');
export const COPY = path.resolve(here, '../openapi/platform-auth.openapi.json');

// REQ-AUTH-020
function typeOf(schema) {
  if (schema.$ref) return schema.$ref.slice(schema.$ref.lastIndexOf('/') + 1);
  if (schema.type === 'integer' || schema.type === 'number') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  if (schema.type === 'array') return `readonly ${typeOf(schema.items)}[]`;
  if (schema.type === 'object') return 'Readonly<Record<string, unknown>>';
  return 'string';
}

// REQ-AUTH-020
export function contractTypes(contract) {
  const lines = ['// REQ-AUTH-020', ''];
  for (const [name, schema] of Object.entries(contract.components.schemas)) {
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
