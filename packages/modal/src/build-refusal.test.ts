import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const run = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function compile(template: string): Promise<string> {
  const probe = await mkdtemp(path.join(packageRoot, '.build-probe-'));
  try {
    await writeFile(path.join(probe, 'consumer.ts'), [
      "import { Component } from '@angular/core';",
      "import { ApcrModal, ESCAPE_IGNORED } from '../src/modal';",
      '',
      `@Component({ selector: 'app-consumer', standalone: true, imports: [ApcrModal], template: '${template}' })`,
      'export class Consumer { readonly ignored = ESCAPE_IGNORED; }',
      '',
    ].join('\n'));
    await writeFile(path.join(probe, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        target: 'ES2022', module: 'ES2022', moduleResolution: 'bundler', strict: true, lib: ['ES2022', 'DOM'],
        outDir: path.join(probe, 'out'), rootDir: '..', skipLibCheck: true, types: [],
      },
      files: ['consumer.ts'],
      angularCompilerOptions: { strictTemplates: true },
    }));
    try {
      await run(process.execPath, [path.join(packageRoot, 'node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js'),
        '-p', path.join(probe, 'tsconfig.json')], { cwd: packageRoot });
      return '';
    } catch (failure) {
      const { stdout = '', stderr = '' } = failure as { stdout?: string; stderr?: string };
      return `${stdout}${stderr}`;
    }
  } finally {
    await rm(probe, { recursive: true, force: true });
  }
}

// REQ-CLIENT-MODAL-001, REQ-QUALITY-017
describe('сборка потребителя со строгими шаблонами', () => {
  it('отказывает модальному окну без решения об Escape и собирает окно с решением', async () => {
    const forgot = await compile('<div apcrModal>забыли</div>');
    expect(forgot).toContain('NG8008');
    expect(forgot).toContain("Required input 'apcrModalEscape' from directive ApcrModal must be specified");
    expect(await compile('<div apcrModal [apcrModalEscape]="ignored">решили</div>')).toBe('');
  }, 120_000);
});
