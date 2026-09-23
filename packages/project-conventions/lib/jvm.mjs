// REQ-DEPLOYMENT-011, REQ-DEPLOYMENT-012
export function archiveKeys(archive) {
  return ['-XX:+AutoCreateSharedArchive', `-XX:SharedArchiveFile=${archive}`];
}

// REQ-DEPLOYMENT-013
export function aotKeys(cache) {
  return [`-XX:AOTCache=${cache}`];
}

// REQ-DEPLOYMENT-011
export function launchKeys({ archive, aot }) {
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
  return { problems: [], keys: archive === undefined ? aotKeys(aot) : archiveKeys(archive) };
}
