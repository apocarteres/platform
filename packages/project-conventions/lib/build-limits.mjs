// REQ-BUILD-015
export const CPUS = 'CONVENTIONS_BUILD_CPUS';

// REQ-BUILD-015
export const NICE = 'CONVENTIONS_BUILD_NICE';

const WHOLE = /^\d+$/;

// REQ-BUILD-015
export function buildLimits(environment) {
  const problems = [];
  const prefix = [];
  const cpus = environment[CPUS];
  if (cpus !== undefined && cpus !== '') {
    if (!WHOLE.test(cpus) || Number(cpus) < 1) problems.push(`${CPUS} — целое число ядер не меньше 1: ${cpus}`);
    else prefix.push('taskset', '-c', Number(cpus) === 1 ? '0' : `0-${Number(cpus) - 1}`);
  }
  const nice = environment[NICE];
  if (nice !== undefined && nice !== '') {
    if (!WHOLE.test(nice) || Number(nice) > 19) problems.push(`${NICE} — от 0 до 19: ${nice}`);
    else prefix.push('nice', '-n', String(Number(nice)));
  }
  return { prefix, problems };
}
