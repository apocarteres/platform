// REQ-E2E-TIMING-001
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { systemClock } from './clock.mjs';

export function collectSteps(list, prefix = '', out = []) {
  for (const step of list) {
    if (step.category !== 'test.step') continue;
    const title = prefix ? `${prefix} › ${step.title}` : step.title;
    out.push({ title, duration: step.duration });
    collectSteps(step.steps, title, out);
  }
  return out;
}

export default class TimingReporter {
  constructor(options = {}) {
    this.file = options.file ?? process.env['E2E_TIMING_PART'];
    this.clock = options.clock ?? systemClock;
    this.started = this.clock.now();
    this.tests = new Map();
  }

  printsToStdio() {
    return false;
  }

  onBegin() {
    this.started = this.clock.now();
  }

  onTestEnd(test, result) {
    const proj = test.parent.project();
    const project = proj?.name ?? '';
    const key = `${project}\u0000${test.id}`;
    const prev = this.tests.get(key);
    this.tests.set(key, {
      file: relative(proj?.testDir ?? '', test.location.file).split('\\').join('/'),
      title: test.titlePath().slice(3).join(' › '),
      project,
      duration: (prev?.duration ?? 0) + result.duration,
      retries: result.retry,
      status: result.status,
      steps: collectSteps(result.steps),
    });
  }

  onEnd(result) {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({
      started: new Date(this.started).toISOString(),
      duration: this.clock.now() - this.started,
      status: result.status,
      tests: [...this.tests.values()],
    }));
  }
}
