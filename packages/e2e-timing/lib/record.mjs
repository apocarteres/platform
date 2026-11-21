// REQ-E2E-TIMING-002
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const FORMAT = 1;
export const TOP = 10;
export const HISTORY = 50;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LABEL = /^[A-Za-z0-9 ._:-]{1,64}$/;

export function label(value) {
  const v = (value ?? '').trim();
  return LABEL.test(v) ? v : '';
}

export function standName(stand) {
  if (!NAME.test(stand ?? '')) throw new Error(`стенд ${JSON.stringify(stand)} — имя из букв, цифр, . _ -`);
  return stand;
}

// REQ-E2E-TIMING-003
export function parsePhases(text) {
  const out = [];
  for (const ln of text.split('\n')) {
    const tab = ln.indexOf('\t');
    if (tab <= 0) continue;
    const sec = ln.slice(tab + 1).trim();
    if (/^\d+(\.\d+)?$/.test(sec)) out.push({ name: ln.slice(0, tab), duration: Number(sec) });
  }
  return out;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export function buildRecord(parts, meta, { deploy = null, phases = [], phasesStarted = null } = {}) {
  if (!parts.length) return null;
  const tests = [];
  const steps = [];
  for (const part of parts) {
    for (const t of part.tests ?? []) {
      tests.push({ file: t.file, title: t.title, project: t.project, duration: t.duration, retries: t.retries, status: t.status });
      for (const s of t.steps ?? []) steps.push({ test: `${t.file} › ${t.title}`, title: s.title, duration: s.duration });
    }
  }
  let stack = deploy;
  if (!stack && phases.length) {
    stack = { started: phasesStarted, duration: round2(phases.reduce((a, p) => a + p.duration, 0)),
      status: 'passed', phases, tasks: [] };
  }
  return {
    format: FORMAT, repository: meta.repository, commit: meta.commit, branch: meta.branch,
    runner: label(meta.runner), machine: label(meta.machine), stand: meta.stand, workers: meta.workers,
    started: parts.map((p) => p.started).sort()[0],
    duration: parts.reduce((a, p) => a + (p.duration ?? 0), 0),
    status: parts.every((p) => p.status === 'passed') ? 'passed' : 'failed',
    tests, steps, deploy: stack,
  };
}

// REQ-E2E-TIMING-003
export function deployFor(dep, commit) {
  if (!dep?.commit || dep.commit !== commit) return null;
  const out = {};
  for (const k of ['started', 'duration', 'status', 'phases', 'tasks']) out[k] = dep[k] ?? null;
  return out;
}

// REQ-E2E-TIMING-004
export function appendHistory(dir, line) {
  const file = join(dir, 'e2e-timing.jsonl');
  let lines = [];
  let prev = null;
  if (existsSync(file)) {
    lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
    for (let i = lines.length - 1; i >= 0 && !prev; i--) {
      try { prev = JSON.parse(lines[i]); } catch { continue; }
    }
  }
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(file, [...lines, line].slice(-HISTORY).join('\n') + '\n');
  return prev;
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)} с`;

function delta(now, before) {
  if (before === undefined || before === null) return '';
  const d = now - before;
  const pct = before ? `, ${d >= 0 ? '+' : '−'}${Math.round(Math.abs(d / before) * 100)}%` : '';
  return ` (${d >= 0 ? '+' : '−'}${(Math.abs(d) / 1000).toFixed(1)} с${pct})`;
}

export function summary(rec, prev, { full = true } = {}) {
  const ptests = new Map((prev?.tests ?? []).map((t) => [`${t.project}\u0000${t.file}\u0000${t.title}`, t.duration]));
  const psteps = new Map();
  for (const s of prev?.steps ?? []) {
    const k = `${s.test}\u0000${s.title}`;
    psteps.set(k, (psteps.get(k) ?? 0) + s.duration);
  }
  const note = prev || !full ? '' : '; прошлого полного прогона на стенде нет';
  const out = [`[e2e-timing] прогон: ${seconds(rec.duration)}${delta(rec.duration, prev?.duration)}, тестов ${rec.tests.length}, стенд ${rec.stand}${note}`];
  if (rec.deploy) {
    out.push(`[e2e-timing] подготовка стенда: ${Math.round(rec.deploy.duration)} с — `
      + (rec.deploy.phases ?? []).map((p) => `${p.name} ${Math.round(p.duration)} с`).join(', '));
  }
  out.push(`[e2e-timing] самые долгие тесты (из ${rec.tests.length}):`);
  for (const t of [...rec.tests].sort((a, b) => b.duration - a.duration).slice(0, TOP)) {
    out.push(`  ${seconds(t.duration).padStart(9)}${delta(t.duration, ptests.get(`${t.project}\u0000${t.file}\u0000${t.title}`))}  ${t.file} › ${t.title} [${t.project}]`);
  }
  if (rec.steps.length) {
    out.push('[e2e-timing] самые долгие шаги:');
    for (const s of [...rec.steps].sort((a, b) => b.duration - a.duration).slice(0, TOP)) {
      out.push(`  ${seconds(s.duration).padStart(9)}${delta(s.duration, psteps.get(`${s.test}\u0000${s.title}`))}  ${s.title} — ${s.test}`);
    }
  }
  return out.join('\n');
}
