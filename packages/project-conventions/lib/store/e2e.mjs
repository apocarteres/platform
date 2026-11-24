import { changedFiles, isAncestor, OUTSIDE_THE_CODE } from '../release/git.mjs';

// REQ-STORE-028
export function e2eDeclaration(config) {
  const declared = config.e2e;
  if (declared === undefined) return { required: true, reason: null, problems: [] };
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) {
    return { required: true, reason: null, problems: ['e2e в .conventions.json — объект: outsideBuild либо required: false с reason'] };
  }
  if (declared.required === undefined || declared.required === true) return { required: true, reason: null, problems: [] };
  const problems = [];
  if (declared.required !== false) problems.push('e2e.required в .conventions.json — true либо false');
  else if (typeof declared.reason !== 'string' || declared.reason.trim() === '') {
    problems.push('e2e.required: false в .conventions.json объявляется с причиной reason — например "у проекта нет QA-стенда"');
  }
  if (declared.outsideBuild !== undefined) problems.push('e2e.outsideBuild в .conventions.json не сочетается с required: false: переносить нечего');
  return { required: false, reason: problems.length === 0 ? declared.reason.trim() : null, problems };
}

// REQ-STORE-027
export function outsideBuild(config) {
  const declared = config.e2e?.outsideBuild;
  if (config.e2e === undefined || declared === undefined) return { prefixes: [...OUTSIDE_THE_CODE], problems: [] };
  if (!Array.isArray(declared) || declared.some((one) => typeof one !== 'string' || one === '' || one.startsWith('/'))) {
    return { prefixes: [], problems: ['e2e.outsideBuild в .conventions.json — перечень путей от корня репозитория, например [".github/", "scripts/checks/"]'] };
  }
  return { prefixes: [...OUTSIDE_THE_CODE, ...declared], problems: [] };
}

// REQ-STORE-026, REQ-STORE-027
export async function e2eStanding(root, config, release, commit) {
  if (typeof release?.task !== 'string' || release.task === '') return { problem: null, from: null };
  // REQ-STORE-028
  if (release.e2eRequired === false) return { problem: null, from: null };
  const checked = release.e2e?.commit ?? null;
  if (checked === commit) return { problem: null, from: null };
  const lead = `Выпуск ${release.id} ведёт задача ${release.task}: закрывается только коммит с зелёным e2e выпуска,`;
  const record = ` Запишите прогон на этом коммите командой release record-e2e --commit ${commit}`;
  if (checked === null) return { problem: `${lead} а e2e не записан, закрывается ${commit.slice(0, 8)}.${record}`, from: null };
  const where = `${lead} а e2e записан на ${checked.slice(0, 8)}, закрывается ${commit.slice(0, 8)}.`;
  if (!await isAncestor(root, checked, commit)) {
    return { problem: `${where} Коммит прогона не предок закрываемого: e2e не переносится.${record}`, from: null };
  }
  const { prefixes, problems } = outsideBuild(config);
  if (problems.length > 0) return { problem: `${where} ${problems[0]}`, from: null };
  const inside = (await changedFiles(root, checked, commit)).filter((file) => !prefixes.some((prefix) => file.startsWith(prefix)));
  if (inside.length === 0) return { problem: null, from: checked };
  const shown = inside.slice(0, 5).join(', ') + (inside.length > 5 ? ` и ещё ${inside.length - 5}` : '');
  return {
    problem: `${where} После прогона изменены файлы сборки: ${shown}. e2e переносится, только когда изменены пути вне сборки`
      + ` (e2e.outsideBuild в .conventions.json, docs/ и .conventions/).${record}`,
    from: null,
  };
}
