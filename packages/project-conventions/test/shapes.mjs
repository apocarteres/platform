import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { referenceConsumer, RUST_CRATE } from './reference-consumer.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const CORE = path.resolve(here, '../../..');

// REQ-QUALITY-016
export const SHAPES = ['containers', 'host'];

// REQ-QUALITY-016
async function put(root, file, content) {
  await mkdir(path.join(root, path.dirname(file)), { recursive: true });
  await writeFile(path.join(root, file), content);
}

// REQ-QUALITY-016
const POM = '<?xml version="1.0" encoding="UTF-8"?>\n<project>\n  <modelVersion>4.0.0</modelVersion>\n'
  + '  <parent>\n    <groupId>io.github.apocarteres.platform</groupId>\n'
  + '    <artifactId>platform-service-parent</artifactId>\n    <version>1.48.0</version>\n  </parent>\n'
  + '  <groupId>net.example</groupId>\n  <artifactId>inventory</artifactId>\n  <version>1.0.0</version>\n'
  + '  <dependencies>\n    <dependency>\n      <groupId>org.springframework.boot</groupId>\n'
  + '      <artifactId>spring-boot-starter-web</artifactId>\n    </dependency>\n  </dependencies>\n</project>\n';

// REQ-QUALITY-016
const ROUTES = "import { withUnknownPath } from '@apocarteres/routing';\n\n"
  + 'export const routes = withUnknownPath([\n'
  + "  { path: '', loadComponent: () => import('./lobby/lobby.page').then((m) => m.LobbyPage) },\n"
  + "  { path: 'inventory', loadComponent: () => import('./inventory/inventory.page').then((m) => m.InventoryPage) },\n"
  + "], { loadNotFound: () => import('./not-found/not-found.page').then((m) => m.NotFoundPage) });\n";

// REQ-QUALITY-016
const DEPLOY = '#!/usr/bin/env bash\nset -euo pipefail\n\n'
  + 'parsed="$(npx conventions deploy-args -- "$@")"\n'
  + 'while IFS="=" read -r key value; do\n  case "$key" in\n'
  + '    env) environment="$value" ;;\n    components) components="$value" ;;\n  esac\n'
  + 'done <<< "$parsed"\n\necho "развёртывание $components в $environment"\n';

// REQ-QUALITY-016
function deploymentOf(kind) {
  const common = {
    backend: { artifact: 'target/inventory.jar' },
    frontend: { artifact: 'frontend/dist/app' },
  };
  if (kind === 'containers') {
    return { environments: ['local', 'qa', 'production'], components: { ...common, agent: { artifact: `${RUST_CRATE}/target/release/agent` } } };
  }
  return {
    environments: ['qa', 'production'],
    components: {
      ...common,
      web: { artifact: 'deploy/nginx/site.conf', install: '/etc/nginx/conf.d/site.conf', verify: 'nginx -t -c {}' },
      unit: { artifact: 'deploy/inventory.service', install: '/etc/systemd/system/inventory.service', verify: 'systemd-analyze verify {}' },
    },
  };
}

// REQ-QUALITY-016
export async function consumerShape(kind) {
  if (!SHAPES.includes(kind)) throw new Error(`неизвестная форма потребителя: ${kind}`);
  const consumer = await referenceConsumer();
  const { root } = consumer;
  await cp(path.join(CORE, 'docs/terms'), path.join(root, 'node_modules/@apocarteres/project-conventions/docs/terms'), { recursive: true });
  await put(root, 'pom.xml', POM);
  await put(root, 'frontend/package.json', `${JSON.stringify({ name: 'inventory-client', private: true, scripts: { build: 'ng build', lint: 'eslint .' } }, null, 2)}\n`);
  await put(root, 'frontend/src/app/app.routes.ts', ROUTES);
  // REQ-CLIENT-MODAL-004
  await put(root, 'frontend/src/app/confirm/confirm.dialog.html',
    '<div class="backdrop">\n  <div class="modal-card" role="dialog" apoModal [apoModalEscape]="close">\n    Удалить запись?\n  </div>\n</div>\n');
  await put(root, 'scripts/deploy.sh', DEPLOY);
  const sources = ['src', 'frontend/src'];
  if (kind === 'containers') {
    await put(root, 'Dockerfile', 'FROM eclipse-temurin:25-jre\nCOPY target/inventory.jar /opt/inventory.jar\n');
    const lib = path.join(root, RUST_CRATE, 'src/lib.rs');
    await writeFile(lib, `${await readFile(lib, 'utf8')}\n/// Первое слово описания.\npub fn first_word<'a>(text: &'a str) -> &'a str {\n    text.split(' ').next().unwrap_or(text)\n}\n`);
    sources.push(`${RUST_CRATE}/src`);
  } else {
    await rm(path.join(root, RUST_CRATE), { recursive: true, force: true });
    await put(root, 'deploy/nginx/site.conf', 'server {\n  location ^~ /api/ { proxy_pass http://127.0.0.1:8080; }\n  location ~ \\.[A-Za-z0-9]+$ { try_files $uri =404; }\n  location / { try_files $uri /index.html; }\n}\n');
    await put(root, 'deploy/inventory.service', '[Unit]\nDescription=inventory\n\n[Service]\nExecStart=/usr/bin/java -jar /opt/inventory.jar\n');
  }
  const config = JSON.parse(await readFile(path.join(root, '.conventions.json'), 'utf8'));
  await writeFile(path.join(root, '.conventions.json'),
    `${JSON.stringify({ ...config, sources, deployment: deploymentOf(kind), modal: { selector: '.modal-card' } }, null, 2)}\n`);
  await consumer.git('add', '-A');
  await consumer.git('commit', '--quiet', '-m', `Форма потребителя: ${kind}\n\nRelease-cycle: RELEASE-2026-09-10`);
  return { ...consumer, kind };
}
