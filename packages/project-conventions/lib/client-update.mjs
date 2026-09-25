import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { angularApplications } from './angular.mjs';
import { collectSourceFiles } from './comments.mjs';
import { poms } from './dependencies.mjs';

// REQ-CLIENT-UPDATE-008
const DECLARATION = /\bprovideAppUpdate\s*\(/;

// REQ-CLIENT-UPDATE-008
const INTERCEPTOR = /\bwithInterceptors\s*\(\s*\[[^\]]*\bappUpdateInterceptor\b/;

// REQ-CLIENT-UPDATE-011
const RAW_FETCH = /(?<![\w$.])fetch\s*\(\s*[`'"]\/(?!\/)/;

// REQ-CLIENT-UPDATE-011
const RAW_XHR = /\.open\s*\(\s*[`'"][A-Za-z]+[`'"]\s*,\s*[`'"]\/(?!\/)/;

// REQ-CLIENT-UPDATE-011
const TEST_FILE = /\.(?:spec|test)\.ts$/;

// REQ-CLIENT-UPDATE-011
export function rawCalls(source) {
  const found = [];
  const xhr = source.includes('XMLHttpRequest');
  source.split('\n').forEach((line, index) => {
    const code = line.trim();
    if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
    if (RAW_FETCH.test(line)) found.push({ line: index + 1, text: 'fetch к своему API без X-Api-Version: вызовите функцию apiFetch() из @apocarteres/app-update' });
    if (xhr && RAW_XHR.test(line)) found.push({ line: index + 1, text: 'XMLHttpRequest к своему API без X-Api-Version: вызовите функцию apiFetch() из @apocarteres/app-update' });
  });
  return found;
}

// REQ-CLIENT-UPDATE-008
const WEB = new Set(['spring-boot-starter-web', 'spring-boot-starter-webmvc']);

// REQ-CLIENT-UPDATE-008
const STARTER = 'platform-api-version';

// REQ-CLIENT-UPDATE-008
function add(violations, file, item) {
  violations.set(file, [...(violations.get(file) ?? []), item]);
}

// REQ-CLIENT-UPDATE-008
export function runtimeDependencies(source) {
  const found = [];
  for (const match of source.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
    const artifact = /<artifactId>([^<]+)<\/artifactId>/.exec(match[1])?.[1]?.trim();
    const scope = /<scope>([^<]+)<\/scope>/.exec(match[1])?.[1]?.trim();
    if (artifact === undefined || scope === 'test') continue;
    found.push({ artifact, line: source.slice(0, match.index).split('\n').length });
  }
  return found;
}

// REQ-CLIENT-UPDATE-008
async function clientProblems(root, config, application, violations) {
  const missing = [];
  let declared = false;
  let intercepted = false;
  const sources = [path.relative(root, path.join(root, application.sourceRoot)) || '.'];
  for (const file of await collectSourceFiles(root, { sources, exclude: config.exclude ?? [] }, new Set(['.ts']))) {
    const source = await readFile(path.join(root, file), 'utf8');
    declared ||= DECLARATION.test(source);
    intercepted ||= INTERCEPTOR.test(source);
    // REQ-CLIENT-UPDATE-011
    if (!TEST_FILE.test(file)) for (const call of rawCalls(source)) add(violations, file, call);
  }
  if (!declared) missing.push('provideAppUpdate({ apiVersion, available, required })');
  if (!intercepted) missing.push('appUpdateInterceptor в provideHttpClient(withInterceptors([...]))');
  return missing;
}

// REQ-CLIENT-UPDATE-008
export async function findClientsWithoutUpdate(root, config) {
  const violations = new Map();
  for (const application of await angularApplications(root)) {
    if (application.broken) continue;
    const missing = await clientProblems(root, config, application, violations);
    if (missing.length > 0) {
      add(violations, application.file, {
        line: application.line,
        text: `приложение ${application.name} не объявляет механизм обновления @apocarteres/app-update: нет ${missing.join(' и ')}`,
      });
    }
  }
  for (const file of await poms(root)) {
    const dependencies = runtimeDependencies(await readFile(path.join(root, file), 'utf8'));
    const web = dependencies.find((one) => WEB.has(one.artifact));
    if (web === undefined || dependencies.some((one) => one.artifact === STARTER)) continue;
    add(violations, file, {
      line: web.line,
      text: `служба на ${web.artifact} без ${STARTER}: подключите starter и задайте platform.api.min-supported-version`,
    });
  }
  return violations;
}
