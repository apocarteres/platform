// REQ-DEPLOYMENT-015
export const NAME = /^[a-z][a-z0-9-]*$/;

// REQ-DEPLOYMENT-019
export const CANONICAL_ENVIRONMENTS = new Map([
  ['prod', 'production'],
  ['prd', 'production'],
  ['production', 'production'],
  ['live', 'production'],
]);

// REQ-DEPLOYMENT-019
function environmentProblem(environment) {
  if (!NAME.test(environment)) return `имя среды «${environment}»: строчные буквы, цифры и дефис`;
  const canonical = CANONICAL_ENVIRONMENTS.get(environment);
  if (canonical !== undefined && canonical !== environment) {
    return `имя среды «${environment}»: рабочая среда называется «${canonical}» во всех проектах ядра.`
      + ' Разные имена одной среды — то же расхождение входа, из-за которого имя среды и предписано (REQ-DEPLOYMENT-019)';
  }
  return null;
}

// REQ-DEPLOYMENT-020
export const VERIFY_PLACEHOLDER = '{}';

// REQ-DEPLOYMENT-020
function placeProblems(name, declared) {
  const problems = [];
  const install = declared?.install;
  if (install !== undefined && (typeof install !== 'string' || install.trim().length === 0)) {
    problems.push(`составляющая ${name}: поле install называет путь в среде, а не пустое значение`);
  }
  const verify = declared?.verify;
  if (verify === undefined) return problems;
  if (typeof verify !== 'string' || verify.trim().length === 0) {
    problems.push(`составляющая ${name}: поле verify называет команду разбора, а не пустое значение`);
    return problems;
  }
  if (!verify.includes(VERIFY_PLACEHOLDER)) {
    problems.push(`составляющая ${name}: в команде verify нет места для пути «${VERIFY_PLACEHOLDER}»:`
      + ' разбирать надо тот файл, который собран, а не тот, что уже лежит в среде');
  }
  if (declared?.install === undefined) {
    problems.push(`составляющая ${name}: разбор объявлен, а место установки нет:`
      + ' разбирают перед тем, как положить, а класть некуда');
  }
  return problems;
}

// REQ-DEPLOYMENT-015, REQ-DEPLOYMENT-020
function componentProblems(name, declared) {
  const problems = [];
  if (!NAME.test(name)) problems.push(`имя составляющей «${name}»: строчные буквы, цифры и дефис`);
  if (typeof declared?.artifact !== 'string' || declared.artifact.length === 0) {
    problems.push(`составляющая ${name} без артефакта: назовите путь — собранный шагом сборки (REQ-BUILD-013) либо ведомый в репозитории`);
  }
  problems.push(...placeProblems(name, declared));
  return problems;
}

// REQ-DEPLOYMENT-015
export function deployment(config) {
  const declared = config.deployment ?? null;
  if (declared === null) return { declared: false, components: [], environments: [], problems: [] };
  const problems = [];
  const environments = declared.environments ?? [];
  if (!Array.isArray(environments) || environments.length === 0) {
    problems.push('среды не объявлены: имя среды — единственное обязательное в развёртывании');
  } else {
    for (const environment of environments) {
      // REQ-DEPLOYMENT-019
      const problem = environmentProblem(environment);
      if (problem !== null) problems.push(problem);
    }
  }
  const components = Object.entries(declared.components ?? {});
  if (components.length === 0) problems.push('составляющие не объявлены: разворачивать нечего');
  for (const [name, one] of components) problems.push(...componentProblems(name, one));
  return {
    declared: true,
    // REQ-DEPLOYMENT-020
    components: components.map(([name, one]) => ({
      name, artifact: one?.artifact, install: one?.install ?? null, verify: one?.verify ?? null,
    })),
    environments: Array.isArray(environments) ? environments : [],
    problems,
  };
}

// REQ-DEPLOYMENT-015
export function knownEnvironment(config, environment) {
  const { environments } = deployment(config);
  return environments.includes(environment);
}
