// REQ-TICKETS-010
export function dependencyCycles(references) {
  const graph = new Map();
  for (const reference of references.filter((entry) => entry.field === 'depends-on')) {
    graph.set(reference.id, { relativePath: reference.relativePath, targets: reference.targetIds });
  }
  const errors = [];
  const reported = new Set();
  const state = new Map();
  const visit = (id, trail) => {
    if (state.get(id) === 'done' || !graph.has(id)) return;
    if (state.get(id) === 'open') {
      const cycle = [...trail.slice(trail.indexOf(id)), id];
      const key = [...new Set(cycle)].sort().join(',');
      if (!reported.has(key)) {
        reported.add(key);
        errors.push(`${graph.get(id).relativePath}: цикл зависимостей ${cycle.join(' → ')}: снимите одну из связей depends-on`);
      }
      return;
    }
    state.set(id, 'open');
    for (const target of graph.get(id).targets) visit(target, [...trail, id]);
    state.set(id, 'done');
  };
  for (const id of graph.keys()) visit(id, []);
  return errors;
}
