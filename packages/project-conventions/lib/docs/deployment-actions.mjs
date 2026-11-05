// REQ-TICKETS-023, REQ-RELEASE-049
export const DEPLOYMENT_STEPS = [
  { key: 'before', title: 'До развёртывания' },
  { key: 'after', title: 'После развёртывания' },
];

function sectionBody(body, title) {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `## ${title}`);
  if (start === -1) return null;
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '));
  return lines.slice(start + 1, end === -1 ? undefined : end);
}

// REQ-TICKETS-023
function parseItems(lines) {
  const items = [];
  const strays = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const item = /^- (.*\S)\s*$/.exec(line);
    if (item) items.push(item[1]);
    else if (/^\s+\S/.test(line) && items.length > 0) items[items.length - 1] += ` ${line.trim()}`;
    else strays.push(line.trim());
  }
  return { items, strays };
}

// REQ-TICKETS-023
export function deploymentSectionProblems(body) {
  const problems = [];
  for (const step of DEPLOYMENT_STEPS) {
    const lines = sectionBody(body, step.title);
    if (lines === null) continue;
    const { items, strays } = parseItems(lines);
    if (items.length === 0) {
      problems.push(`раздел «${step.title}» без действий: нет действий — нет раздела`);
    } else if (strays.length > 0) {
      problems.push(`раздел «${step.title}» содержит строку вне пункта списка: «${strays[0]}» — каждое действие записывается пунктом «- »`);
    }
  }
  return problems;
}

// REQ-RELEASE-049
export function deploymentActions(content) {
  const actions = { before: [], after: [] };
  for (const step of DEPLOYMENT_STEPS) {
    const lines = sectionBody(content, step.title);
    if (lines !== null) actions[step.key] = parseItems(lines).items;
  }
  return actions;
}
