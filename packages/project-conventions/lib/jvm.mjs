// REQ-DEPLOYMENT-011, REQ-DEPLOYMENT-012
export function archiveKeys(archive) {
  return ['-XX:+AutoCreateSharedArchive', `-XX:SharedArchiveFile=${archive}`];
}

// REQ-DEPLOYMENT-013
export function aotKeys(cache) {
  return [`-XX:AOTCache=${cache}`];
}

// REQ-DEPLOYMENT-030
export const PRODUCTION = 'production';

// REQ-DEPLOYMENT-030
export function profileKeys(environment) {
  return environment === PRODUCTION ? [`-Dspring.profiles.include=${PRODUCTION}`] : [];
}

// REQ-DEPLOYMENT-030
function environmentProblem(environment, environments) {
  const declared = environments.join(', ') || 'ни одной — объявите среды в deployment.environments';
  if (environment === undefined) {
    return `ключи запуска требуют имени среды: --env <среда>; рабочей среде поставляется профиль ${PRODUCTION}`
      + ` (REQ-DEPLOYMENT-030). Объявлены: ${declared}`;
  }
  if (!environments.includes(environment)) return `среда ${environment} не объявлена; объявлены: ${declared}`;
  return null;
}

// REQ-DEPLOYMENT-011, REQ-DEPLOYMENT-030
export function launchKeys({ archive, aot, environment, environments = [] }) {
  const unnamed = environmentProblem(environment, environments);
  if (unnamed !== null) return { problems: [unnamed] };
  if (archive !== undefined && aot !== undefined) {
    return {
      problems: ['архив классов и кеш AOT взаимно исключают друг друга: виртуальная машина отказывает при запуске'
        + ' (REQ-DEPLOYMENT-012). Назовите один: --archive <путь> по умолчанию либо --aot <путь>'],
    };
  }
  if (archive === undefined && aot === undefined) {
    return {
      problems: ['ключи запуска требуют места подготовленного состояния классов: --archive <путь> по умолчанию'
        + ' либо --aot <путь> (REQ-DEPLOYMENT-012)'],
    };
  }
  const keys = archive === undefined ? aotKeys(aot) : archiveKeys(archive);
  return { problems: [], keys: [...keys, ...profileKeys(environment)] };
}
