import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { parseArguments } from './cli/arguments.mjs';
import { deployment } from './components.mjs';
import { CONFIG_FILE } from './config.mjs';

// REQ-DEPLOYMENT-019
export const ENTRY = 'scripts/deploy.sh';

// REQ-DEPLOYMENT-019, REQ-DEPLOYMENT-021
export const DEPLOY_USAGE = `${ENTRY} --env <среда> [--only <составляющая[,составляющая]>]`
  + ' [--untagged-reason "<причина>"]';

// REQ-DEPLOYMENT-019, REQ-DEPLOYMENT-021
const CORE_VALUES = ['--env', '--only', '--untagged-reason'];

// REQ-DEPLOYMENT-021
export function deployUsage(declared) {
  const own = (declared.arguments ?? []).map((one) => (one.value ? `[--${one.name} <значение>]` : `[--${one.name}]`));
  const line = [DEPLOY_USAGE, ...own].join(' ');
  const explained = (declared.arguments ?? []).map((one) => `  --${one.name} — ${one.summary}`);
  return [line, ...explained].join('\n');
}

// REQ-DEPLOYMENT-021
function specFor(declared) {
  const own = declared.arguments ?? [];
  return {
    values: [...CORE_VALUES, ...own.filter((one) => one.value).map((one) => `--${one.name}`)],
    flags: own.filter((one) => !one.value).map((one) => `--${one.name}`),
    positional: 1,
  };
}

// REQ-DEPLOYMENT-019
function namedComponents(declared, only) {
  const asked = only.split(',').map((name) => name.trim()).filter((name) => name.length > 0);
  if (asked.length === 0) return { problems: ['ключ --only назван без составляющих'] };
  const unknown = asked.filter((name) => !declared.some((one) => one.name === name));
  if (unknown.length > 0) {
    return {
      problems: [`составляющие не объявлены: ${unknown.join(', ')};`
        + ` объявлены: ${declared.map((one) => one.name).join(', ')}`],
    };
  }
  return { problems: [], components: asked };
}

// REQ-DEPLOYMENT-019
export function deployCall(config, argv) {
  const declared = deployment(config);
  if (!declared.declared) {
    return { problems: ['развёртывание не объявлено: добавьте раздел deployment в .conventions.json'] };
  }
  if (declared.problems.length > 0) return { problems: declared.problems };
  const parsed = parseArguments(argv, specFor(declared));
  if (parsed.help) return { usage: true };
  if (parsed.error) return { problems: [parsed.error] };
  // REQ-DEPLOYMENT-019
  if (parsed.positional.length > 0) {
    return {
      problems: [`довод без ключа: ${parsed.positional.join(', ')}.`
        + ' Имя среды задаётся ключом --env, а не порядком доводов: порядок расходится между проектами молча'],
    };
  }
  const environment = parsed.values.get('--env');
  if (environment === undefined) {
    return {
      problems: ['имя среды обязательно, умолчания у него нет: среда задаётся ключом --env.'
        + ` Объявлены: ${declared.environments.join(', ')}`],
    };
  }
  if (!declared.environments.includes(environment)) {
    return {
      problems: [`среда ${environment} не объявлена; объявлены: ${declared.environments.join(', ') || 'ни одной'}`],
    };
  }
  const only = parsed.values.get('--only');
  const chosen = only === undefined
    ? { problems: [], components: declared.components.map((one) => one.name) }
    : namedComponents(declared.components, only);
  if (chosen.problems.length > 0) return { problems: chosen.problems };
  // REQ-DEPLOYMENT-021
  const own = new Map((declared.arguments ?? []).map((one) => [
    one.name,
    one.value ? parsed.values.get(`--${one.name}`) ?? '' : (parsed.flags.has(`--${one.name}`) ? 'yes' : ''),
  ]));
  return {
    problems: [],
    environment,
    components: chosen.components,
    untaggedReason: parsed.values.get('--untagged-reason') ?? '',
    own,
  };
}

// REQ-DEPLOYMENT-019, REQ-DEPLOYMENT-021
export function deployLines({ environment, components, untaggedReason = '', own = new Map() }) {
  return [
    `env=${environment}`,
    `components=${components.join(',')}`,
    `untagged-reason=${untaggedReason}`,
    ...[...own].map(([name, value]) => `${name}=${value}`),
  ];
}

// REQ-DEPLOYMENT-019
async function lineOfTheSection(root) {
  try {
    const lines = (await readFile(path.join(root, CONFIG_FILE), 'utf8')).split('\n');
    const found = lines.findIndex((line) => line.includes('"deployment"'));
    return found === -1 ? 1 : found + 1;
  } catch {
    return 1;
  }
}

// REQ-DEPLOYMENT-019
export async function findMissingDeployEntry(root, config) {
  if (!deployment(config).declared) return new Map();
  try {
    await stat(path.join(root, ENTRY));
    return new Map();
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
  }
  return new Map([[CONFIG_FILE, [{
    line: await lineOfTheSection(root),
    text: `развёртывание объявлено, а входа ${ENTRY} нет`,
  }]]]);
}
