import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BEGIN = /<!-- conventions:begin (v[0-9]+\.[0-9]+\.[0-9]+|vunreleased) -->/;
const END = '<!-- conventions:end -->';

export function markerVersion(version) {
  return version === '0.0.0' ? 'unreleased' : version;
}

export function markerBlock(version, fragment) {
  return `<!-- conventions:begin v${markerVersion(version)} -->\n${fragment.trim()}\n${END}`;
}

export function replaceBlock(content, version, fragment) {
  const block = markerBlock(version, fragment);
  const begin = content.match(BEGIN);
  if (!begin) {
    const frontMatter = content.match(/^---\n[\s\S]*?\n---\n/);
    const offset = frontMatter ? frontMatter[0].length : 0;
    return `${content.slice(0, offset)}\n${block}\n${content.slice(offset)}`.replace(/\n{3,}/g, '\n\n');
  }
  const start = content.indexOf(begin[0]);
  const end = content.indexOf(END, start);
  if (end === -1) throw new Error('Открывающий маркер conventions:begin есть, закрывающий conventions:end отсутствует');
  return content.slice(0, start) + block + content.slice(end + END.length);
}

export function inspectBlock(content, version, fragment) {
  const begin = content.match(BEGIN);
  if (!begin) return { state: 'missing' };
  const start = content.indexOf(begin[0]);
  const end = content.indexOf(END, start);
  if (end === -1) return { state: 'unterminated' };
  const actual = content.slice(start, end + END.length);
  if (begin[1] !== `v${markerVersion(version)}`) return { state: 'outdated', version: begin[1] };
  return { state: actual === markerBlock(version, fragment) ? 'current' : 'edited' };
}

export async function readAgents(root) {
  return readFile(path.join(root, 'AGENTS.md'), 'utf8');
}

export async function writeAgents(root, content) {
  await writeFile(path.join(root, 'AGENTS.md'), content);
}
