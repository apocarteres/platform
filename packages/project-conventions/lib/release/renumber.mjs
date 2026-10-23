import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { OUTPUT_BUFFER, environmentWithoutGit } from './git.mjs';

const run = promisify(execFile);

// REQ-TICKETS-022
const TICKETS = 'docs/tickets';

// REQ-TICKETS-022
const ID = /^((?:[A-Z][A-Z0-9]{1,7}-)?[A-Z]{2,5}-)(\d{3})$/;

// REQ-TICKETS-022
const TICKET_FILE = /^((?:[A-Z][A-Z0-9]{1,7}-)?[A-Z]{2,5}-\d{3})-[^/]*\.md$/;

async function git(root, args, env = {}) {
  const { stdout } = await run('git', ['-C', root, ...args], { env: { ...environmentWithoutGit(), ...env }, maxBuffer: OUTPUT_BUFFER });
  return stdout;
}

function idOf(file) {
  return TICKET_FILE.exec(path.posix.basename(file))?.[1] ?? null;
}

async function ticketFiles(root, ref) {
  return (await git(root, ['ls-tree', '-r', '--name-only', ref, '--', TICKETS])).split('\n').filter((file) => idOf(file) !== null);
}

function token(id) {
  return new RegExp(`(?<![A-Z0-9-])${id.replace(/[-]/g, '\\-')}(?![0-9])`, 'g');
}

// REQ-TICKETS-022
function nextFree(id, taken) {
  const [, head] = ID.exec(id);
  const numbers = [...taken].map((one) => ID.exec(one)).filter((match) => match !== null && match[1] === head).map((match) => Number(match[2]));
  return `${head}${String(Math.max(0, ...numbers) + 1).padStart(3, '0')}`;
}

// REQ-TICKETS-022
function leading(message, from, to) {
  return message.startsWith(`${from} `) || message.startsWith(`${from}\n`) ? `${to}${message.slice(from.length)}` : message;
}

// REQ-TICKETS-022
async function addedLines(root, base, file) {
  const diff = await git(root, ['diff', '-U0', base, 'HEAD', '--', file]);
  const added = new Set();
  for (const match of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let line = start; line < start + count; line += 1) added.add(line);
  }
  return added;
}

// REQ-TICKETS-022
async function rewriteMessages(root, commits, from, to, untouched) {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'renumber-'));
  try {
    const mapped = new Map();
    let tip = null;
    for (const [sha, parent] of commits) {
      const [authorName, authorEmail, authorDate, committerName, committerEmail, committerDate] =
        (await git(root, ['log', '-1', '--format=%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI', sha])).trim().split('\0');
      const message = leading(await git(root, ['log', '-1', '--format=%B', sha]), from, to);
      if (token(from).test(message)) untouched.push(`сообщение ${sha.slice(0, 8)} упоминает ${from} в теле — не тронуто, проверьте`);
      const file = path.join(scratch, 'message');
      await writeFile(file, message);
      const tree = (await git(root, ['rev-parse', `${sha}^{tree}`])).trim();
      tip = (await git(root, ['commit-tree', tree, '-p', mapped.get(parent) ?? parent, '-F', file], {
        GIT_AUTHOR_NAME: authorName, GIT_AUTHOR_EMAIL: authorEmail, GIT_AUTHOR_DATE: authorDate,
        GIT_COMMITTER_NAME: committerName, GIT_COMMITTER_EMAIL: committerEmail, GIT_COMMITTER_DATE: committerDate,
      })).trim();
      mapped.set(sha, tip);
    }
    return tip;
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

// REQ-TICKETS-022
export async function renumberTicket(root, { id, base }) {
  if (!ID.test(id ?? '')) return { problems: [`идентификатор задачи ${id} не похож на <ПРЕФИКС>-<ОБЛАСТЬ>-<NNN>`] };
  try {
    await git(root, ['rev-parse', '--verify', `${base}^{commit}`]);
  } catch {
    return { problems: [`основа ${base} не найдена: назовите ветку, на которую перебазирован PR, ключом --base`] };
  }
  const dirty = (await git(root, ['status', '--porcelain'])).trim();
  if (dirty !== '') return { problems: ['в рабочем дереве незакоммиченные изменения: закоммитьте или уберите их, перенумерация переписывает ветку'] };
  const commits = (await git(root, ['rev-list', '--reverse', '--parents', `${base}..HEAD`])).split('\n').filter(Boolean)
    .map((line) => line.split(' '));
  if (commits.length === 0) return { problems: [`в ветке нет своих коммитов поверх ${base}`] };
  const merge = commits.find((one) => one.length > 2);
  if (merge !== undefined) {
    return { problems: [`в ветке слияние ${merge[0].slice(0, 8)}: перенумерация переписывает только линейную ветку — перебазируйте её на ${base}`] };
  }
  const head = await ticketFiles(root, 'HEAD');
  const based = await ticketFiles(root, base);
  const own = head.filter((file) => idOf(file) === id && !based.includes(file));
  if (own.length !== 1) return { problems: [`ветка не заводит задачу ${id}: файла ${id}-*.md, которого нет в ${base}, не найдено`] };
  if (!based.some((file) => idOf(file) === id)) return { problems: [`номер ${id} в ${base} не занят: перенумеровывать нечего`] };

  const to = nextFree(id, new Set([...head, ...based].map(idOf)));
  const old = (await git(root, ['rev-parse', 'HEAD'])).trim();
  const untouched = [];
  const rewritten = await rewriteMessages(root, commits.map(([sha, parent]) => [sha, parent]), id, to, untouched);
  await git(root, ['update-ref', '-m', `tickets-renumber ${id} ${to}`, 'HEAD', rewritten, old]);

  const changed = (await git(root, ['diff', '--name-only', base, 'HEAD'])).split('\n').filter(Boolean);
  const touched = [];
  for (const file of changed) {
    let text;
    try {
      text = await readFile(path.join(root, file), 'utf8');
    } catch {
      continue;
    }
    const added = file === own[0] ? null : await addedLines(root, base, file);
    const replaced = text.split('\n').map((line, index) => {
      if (!token(id).test(line)) return line;
      if (added === null || added.has(index + 1)) return line.replace(token(id), to);
      untouched.push(`${file}:${index + 1}: ${id} пришёл из ${base} — не тронут, проверьте`);
      return line;
    }).join('\n');
    if (replaced === text) continue;
    await writeFile(path.join(root, file), replaced);
    touched.push(file);
  }
  const target = path.posix.join(path.posix.dirname(own[0]), path.posix.basename(own[0]).replace(id, to));
  await git(root, ['mv', own[0], target]);
  await git(root, ['add', '-A']);
  await git(root, ['commit', '--quiet', '-m', `${to} Задача перенумерована: ${id} занят в ${base}`]);
  return { problems: [], from: id, to, rewritten: commits.length, touched, untouched, file: target };
}
