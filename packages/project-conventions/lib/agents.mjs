import { readFile, writeFile } from 'node:fs/promises';
import { RULES } from './rules.mjs';
import path from 'node:path';

const BEGIN = /<!-- conventions:begin (v[0-9]+\.[0-9]+\.[0-9]+|vunreleased) -->/;
const END = '<!-- conventions:end -->';

export function markerVersion(version) {
  return version === '0.0.0' ? 'unreleased' : version;
}

export const INSTALLED_DOCS_PATH = 'node_modules/@apocarteres/project-conventions/docs';
export const SOURCE_DOCS_PATH = 'docs/requirements';

export function manifest(version, docsPath = INSTALLED_DOCS_PATH, rules = RULES) {
  const project = rules.filter((rule) => rule.project);
  const sources = [`\`${docsPath}\``];
  if (project.length > 0) sources.push('документы правил проекта из `.conventions.json`');
  return [
    '## Правила кода',
    '',
    `Тексты: ${sources.join(', ')}. Прочитать перед правкой кода.`,
    'Проверка: `mise run conventions-check`.',
  ].join('\n');
}

export function markerBlock(version, block) {
  return `<!-- conventions:begin v${markerVersion(version)} -->\n${block.trim()}\n${END}`;
}

export function replaceBlock(content, version, block) {
  const rendered = markerBlock(version, block);
  const begin = content.match(BEGIN);
  if (!begin) {
    const frontMatter = content.match(/^---\n[\s\S]*?\n---\n/);
    const offset = frontMatter ? frontMatter[0].length : 0;
    return `${content.slice(0, offset)}\n${rendered}\n${content.slice(offset)}`.replace(/\n{3,}/g, '\n\n');
  }
  const start = content.indexOf(begin[0]);
  const end = content.indexOf(END, start);
  if (end === -1) throw new Error('Открывающий маркер conventions:begin есть, закрывающий conventions:end отсутствует');
  return content.slice(0, start) + rendered + content.slice(end + END.length);
}

export function inspectBlock(content, version, block) {
  const begin = content.match(BEGIN);
  if (!begin) return { state: 'missing' };
  const start = content.indexOf(begin[0]);
  const end = content.indexOf(END, start);
  if (end === -1) return { state: 'unterminated' };
  const actual = content.slice(start, end + END.length);
  if (begin[1] !== `v${markerVersion(version)}`) return { state: 'outdated', version: begin[1] };
  return { state: actual === markerBlock(version, block) ? 'current' : 'edited' };
}

export async function readAgents(root) {
  return readFile(path.join(root, 'AGENTS.md'), 'utf8');
}

export async function writeAgents(root, content) {
  await writeFile(path.join(root, 'AGENTS.md'), content);
}
