import { angularApplications } from './angular.mjs';

// REQ-BUILD-014
const WARNINGS = ['maximumWarning', 'minimumWarning'];

// REQ-BUILD-014
function budgetsOf(project) {
  const build = project.architect?.build ?? project.targets?.build ?? {};
  return [
    ...(build.options?.budgets ?? []),
    ...Object.values(build.configurations ?? {}).flatMap((configuration) => configuration?.budgets ?? []),
  ];
}

// REQ-BUILD-014
export async function findUnguardedBudgets(root) {
  const violations = new Map();
  for (const application of await angularApplications(root)) {
    if (application.broken) continue;
    const found = [];
    const budgets = budgetsOf(application.project);
    if (!budgets.some((budget) => budget?.type === 'initial' && budget.maximumError !== undefined)) {
      found.push({ line: application.line, text: `приложение ${application.name} без бюджета начального пакета с maximumError: размер сборки не держит проверка` });
    }
    for (const budget of budgets) {
      const warned = WARNINGS.filter((key) => budget?.[key] !== undefined);
      if (warned.length === 0) continue;
      found.push({ line: application.line, text: `приложение ${application.name}: бюджет ${budget.type ?? 'без типа'} с ${warned.join(', ')} — превышение порога предупреждения сборку не роняет; оставьте только порог ошибки` });
    }
    if (found.length > 0) violations.set(application.file, [...(violations.get(application.file) ?? []), ...found]);
  }
  return violations;
}
