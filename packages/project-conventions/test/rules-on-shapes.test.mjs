import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { appendFile, cp, mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { RULES } from '../lib/rules.mjs';
import { readConfig } from '../lib/config.mjs';
import { environmentWithoutGit } from '../lib/release/git.mjs';
import { RUST_CRATE } from './reference-consumer.mjs';
import { SHAPES, consumerShape } from './shapes.mjs';

// REQ-QUALITY-016
async function put(root, file, content) {
  await mkdir(path.join(root, path.dirname(file)), { recursive: true });
  await writeFile(path.join(root, file), content);
}

// REQ-QUALITY-016
const java = (name, body) => `package net.example.inventory;\n\n${body.replace('NAME', name)}\n`;

// REQ-QUALITY-016
const BOTH = (plant) => ({ containers: plant, host: plant });

// REQ-QUALITY-016
export const PLANTED = {
  'terms-alias': BOTH((root) => appendFile(path.join(root, 'docs/REQUIREMENTS.md'), '\nИсключения фиксирует храповик.\n')),
  'terms-preferred': BOTH(async (root) => {
    await put(root, 'docs/terms/DEFINITIONS.md',
      '# Определения\n\n| Термин | Толкование |\n|---|---|\n| Ограничитель | фиксация числа нарушений |\n');
    await appendFile(path.join(root, 'docs/REQUIREMENTS.md'), '\nВедётся фиксация числа нарушений.\n');
  }),
  comments: BOTH((root) => put(root, 'src/main/java/net/example/inventory/Explained.java',
    java('Explained', '// объясняем, зачем нужен этот класс\npublic final class NAME {\n}'))),
  clock: BOTH((root) => put(root, 'src/main/java/net/example/inventory/Stamp.java',
    java('Stamp', 'public final class NAME {\n  Object now() {\n    return java.time.Instant.now();\n  }\n}'))),
  'money-types': {
    containers: (root) => appendFile(path.join(root, RUST_CRATE, 'src/lib.rs'),
      '\n/// Сумма к оплате.\npub fn total(price: f64) -> f64 {\n    price\n}\n'),
    host: (root) => put(root, 'src/main/java/net/example/inventory/Invoice.java',
      java('Invoice', 'public final class NAME {\n  double price;\n}')),
  },
  'file-size': BOTH((root) => put(root, 'src/main/java/net/example/inventory/Long.java',
    java('Long', `public final class NAME {\n${'  int field;\n'.repeat(801)}}`))),
  'config-secrets': BOTH((root) => put(root, 'src/main/resources/application.yml',
    'spring:\n  datasource:\n    password: hunter2\n')),
  'dependency-versions': BOTH(async (root) => {
    const pom = path.join(root, 'pom.xml');
    const source = await readFile(pom, 'utf8');
    await writeFile(pom, source.replace('<artifactId>spring-boot-starter-web</artifactId>',
      '<artifactId>spring-boot-starter-web</artifactId>\n      <version>4.0.8</version>'));
  }),
  'document-naming': BOTH((root) => put(root, 'docs/tickets/REF-QUAL-900-work.md',
    '---\nid: REF-QUAL-901\ntype: ticket\nstatus: backlog\nscope: quality\nauthority: supporting\npriority: P2\nrelease: unassigned\n---\n\n# REF-QUAL-901\n')),
  'static-analysis': BOTH((root) => writeFile(path.join(root, 'frontend/package.json'),
    `${JSON.stringify({ name: 'inventory-client', private: true, scripts: { build: 'ng build' } })}\n`)),
  'deploy-entry': BOTH((root) => rm(path.join(root, 'scripts/deploy.sh'))),
  'environment-config': {
    containers: (root) => put(root, 'nginx.conf', 'events {}\n'),
    host: (root) => put(root, 'deploy/backup.timer', '[Timer]\nOnCalendar=daily\n'),
  },
  'modal-escape': BOTH((root) => put(root, 'frontend/src/app/share/share.dialog.html',
    '<div role="dialog" [apcrModalEscape]="() => close()" class="modal-card">\n  Поделиться ссылкой\n</div>\n')),
  'modal-actions': BOTH((root) => put(root, 'frontend/src/app/remove/remove.dialog.html',
    '<div class="modal-card" apcrModal [apcrModalEscape]="() => close()">\n'
    + '  <button [disabled]="count > 3" (click)="remove.emit(); close()">Удалить</button>\n</div>\n')),
  'modal-backdrop': BOTH((root) => put(root, 'frontend/src/app/share/share.backdrop.html',
    '<div class="backdrop" (click)="close()">\n  <div class="modal-card" apcrModal [apcrModalEscape]="close"></div>\n</div>\n')),
  'client-update': BOTH(async (root) => {
    const config = path.join(root, 'frontend/src/app/app.config.ts');
    await writeFile(config, (await readFile(config, 'utf8')).replace(/ {4}provideAppUpdate\(.*\n/, ''));
  }),
  'defer-error': BOTH((root) => put(root, 'frontend/src/app/inventory/inventory.page.html',
    '@defer (on idle) {\n  <app-stock [rows]="{ page: 1 }"/>\n} @placeholder {\n  <p>…</p>\n}\n')),
  'bundle-budgets': BOTH(async (root) => {
    const workspace = path.join(root, 'frontend/angular.json');
    await writeFile(workspace, (await readFile(workspace, 'utf8')).replace('"maximumError": "800kb"', '"maximumWarning": "700kb",\n                  "maximumError": "800kb"'));
  }),
  'migration-labels': BOTH(async (root) => {
    const file = path.join(root, '.conventions.json');
    const config = JSON.parse(await readFile(file, 'utf8'));
    config.deployment.withoutDowntime = { migrations: 'src/main/resources/db/migration' };
    await writeFile(file, `${JSON.stringify(config, null, 2)}\n`);
    await put(root, 'src/main/resources/db/migration/V2__rename_stock.sql', 'alter table stock rename column qty to quantity;\n');
  }),
  'wiring-conditions': BOTH((root) => put(root, 'src/main/java/net/example/inventory/Wiring.java',
    java('Wiring', '@AutoConfiguration\npublic final class NAME {\n  @Bean\n  @ConditionalOnBean(Object.class)\n  Object bean() {\n    return null;\n  }\n}'))),
  'rust-exemptions': {
    containers: (root) => appendFile(path.join(root, RUST_CRATE, 'src/lib.rs'),
      '\n/// Хвост строки.\n#[allow(clippy::unwrap_used)]\npub fn tail(text: &str) -> &str {\n    text.split(\' \').last().unwrap()\n}\n'),
    host: { none: 'у формы нет Rust: правило читает только Rust' },
  },
  'naming-er': BOTH((root) => put(root, 'src/main/java/net/example/inventory/InventoryKeeper.java',
    java('InventoryKeeper', 'public final class NAME {\n}'))),
};

// REQ-QUALITY-016
async function findings(root, rule) {
  const found = await rule.find(root, await readConfig(root));
  return [...found.values()].reduce((sum, items) => sum + items.length, 0);
}

// REQ-QUALITY-016
test('у каждого правила ядра есть закладка на каждой форме потребителя', () => {
  for (const rule of RULES) {
    const planted = PLANTED[rule.id];
    assert.ok(planted !== undefined, `правило ${rule.id} не показано на формах потребителя: добавьте закладку в PLANTED`);
    for (const kind of SHAPES) {
      const one = planted[kind];
      assert.ok(typeof one === 'function' || typeof one?.none === 'string',
        `правило ${rule.id} на форме ${kind}: нужна закладка либо причина, почему правило к форме не относится`);
    }
  }
});

for (const kind of SHAPES) {
  // REQ-QUALITY-016
  test(`форма ${kind}: чистый проект не даёт ни одной находки, каждая закладка находится`, async () => {
    const shape = await consumerShape(kind);
    const planted = await mkdtemp(path.join(os.tmpdir(), `planted-${kind}-`));
    try {
      for (const rule of RULES) {
        assert.equal(await findings(shape.root, rule), 0, `${kind}: ${rule.id} находит нарушение в чистом проекте`);
      }
      for (const rule of RULES) {
        const plant = PLANTED[rule.id][kind];
        if (typeof plant !== 'function') continue;
        const root = path.join(planted, rule.id);
        await cp(shape.root, root, { recursive: true });
        await plant(root);
        execFileSync('git', ['-C', root, 'add', '-A'], { env: environmentWithoutGit(), stdio: 'pipe' });
        assert.ok(await findings(root, rule) > 0, `${kind}: ${rule.id} не нашло заложенного нарушения`);
      }
    } finally {
      await rm(shape.root, { recursive: true, force: true });
      await rm(planted, { recursive: true, force: true });
    }
  });
}
