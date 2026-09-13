// REQ-RELEASE-028
export const HELP = '--help';

// REQ-RELEASE-028
export function parseArguments(argv, spec) {
  const values = spec.values ?? [];
  const flags = spec.flags ?? [];
  const positional = [];
  const taken = new Map();
  const raised = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === HELP) return { help: true };
    if (values.includes(argument)) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith('--')) {
        return { error: `ключ ${argument} требует значения` };
      }
      taken.set(argument, value);
      index += 1;
      continue;
    }
    if (flags.includes(argument)) {
      raised.add(argument);
      continue;
    }
    if (argument.startsWith('--')) return { error: `неизвестный ключ: ${argument}` };
    if (positional.length >= (spec.positional ?? 0)) {
      return { error: `лишний аргумент: ${argument}` };
    }
    positional.push(argument);
  }
  return { values: taken, flags: raised, positional };
}
