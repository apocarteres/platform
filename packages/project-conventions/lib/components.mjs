// REQ-DEPLOYMENT-015
export const NAME = /^[a-z][a-z0-9-]*$/;

// REQ-DEPLOYMENT-015
function componentProblems(name, declared) {
  const problems = [];
  if (!NAME.test(name)) problems.push(`имя составляющей «${name}»: строчные буквы, цифры и дефис`);
  if (typeof declared?.artifact !== 'string' || declared.artifact.length === 0) {
    problems.push(`составляющая ${name} без артефакта: назовите путь, появление которого утверждает её шаг сборки (REQ-BUILD-013)`);
  }
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
      if (!NAME.test(environment)) problems.push(`имя среды «${environment}»: строчные буквы, цифры и дефис`);
    }
  }
  const components = Object.entries(declared.components ?? {});
  if (components.length === 0) problems.push('составляющие не объявлены: разворачивать нечего');
  for (const [name, one] of components) problems.push(...componentProblems(name, one));
  return {
    declared: true,
    components: components.map(([name, one]) => ({ name, artifact: one?.artifact })),
    environments: Array.isArray(environments) ? environments : [],
    problems,
  };
}

// REQ-DEPLOYMENT-015
export function knownEnvironment(config, environment) {
  const { environments } = deployment(config);
  return environments.includes(environment);
}
