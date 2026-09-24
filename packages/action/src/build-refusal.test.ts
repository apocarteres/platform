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
      "import { ApcrAction } from '../src/action';",
      '',
      `@Component({ selector: 'app-consumer', standalone: true, imports: [ApcrAction], template: '${template}' })`,
      'export class Consumer { readonly save = (): Promise<void> => Promise.resolve(); readonly failed = (): void => undefined; }',
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

// REQ-CLIENT-ACTION-001, REQ-QUALITY-017
describe('сборка потребителя со строгими шаблонами', () => {
  it('отказывает кнопке без действия и без обработчика отказа и собирает объявленную полностью', async () => {
    const bare = await compile('<button apcrAction>Сохранить</button>');
    expect(bare, 'атрибут без привязки задаёт действие строкой, и типы это отвергают').toContain("is not assignable to type 'Action'");
    expect(bare).toContain("Required input 'apcrActionFailure' from directive ApcrAction must be specified");

    const noFailure = await compile('<button [apcrAction]="save">Сохранить</button>');
    expect(noFailure, 'отказ не поглощается: обработчик отказа обязателен').toContain("'apcrActionFailure'");

    expect(await compile('<button [apcrAction]="save" [apcrActionFailure]="failed">Сохранить</button>')).toBe('');
  }, 180_000);
});
