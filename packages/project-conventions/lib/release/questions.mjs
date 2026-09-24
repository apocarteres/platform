import { ticketId, tickets } from './documents.mjs';

// REQ-RELEASE-047
export const DEFAULT_LIMITS = { remind: 4, require: 9 };

// REQ-RELEASE-047
export function questionLimits(config) {
  const declared = config.release?.openQuestions ?? {};
  const limits = { ...DEFAULT_LIMITS, ...declared };
  const problems = [];
  for (const key of ['remind', 'require']) {
    if (!Number.isInteger(limits[key]) || limits[key] < 0) {
      problems.push(`release.openQuestions.${key}=${JSON.stringify(declared[key])}: целое число задач от 0`);
    }
  }
  if (problems.length === 0 && limits.require < limits.remind) {
    problems.push(`release.openQuestions: require ${limits.require} меньше remind ${limits.remind} — требование ответов наступает не раньше напоминания`);
  }
  return { ...limits, problems };
}

// REQ-RELEASE-047
export async function questionStanding(root, config) {
  const limits = questionLimits(config);
  if (limits.problems.length > 0) return { problems: limits.problems, reminders: [] };
  const open = (await tickets(root)).filter((ticket) => ticket.metadata.get('questions') === 'open').map(ticketId).sort();
  const named = open.join(', ');
  if (open.length > limits.require) {
    return {
      problems: [`Задач с открытыми вопросами ${open.length} — больше ${limits.require}: выпуск требует ответов.`
        + ` Ответьте в разделе «Открытые вопросы» и поставьте questions: resolved: ${named}`],
      reminders: [],
    };
  }
  if (open.length > limits.remind) {
    return { problems: [], reminders: [`Задач с открытыми вопросами ${open.length} — больше ${limits.remind}; при ${limits.require + 1} выпуск потребует ответов: ${named}`] };
  }
  return { problems: [], reminders: [] };
}
