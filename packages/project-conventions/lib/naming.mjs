import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectSourceFiles } from './comments.mjs';
import { codeLines } from './clock.mjs';
import { CONFIG_FILE } from './config.mjs';

// REQ-JAVA-NAMING-002
export const PATTERN_SUFFIXES = [
  'Adapter', 'Builder', 'Compiler', 'Consumer', 'Controller', 'Decoder', 'Encoder', 'Filter',
  'Forwarder', 'Handler', 'Initializer', 'Listener', 'Loader', 'Mapper', 'Parser', 'Producer', 'Provider',
  'Publisher', 'Reader', 'Resolver', 'Router', 'Runner', 'Scheduler', 'Serializer', 'Subscriber',
  'Validator', 'Verifier', 'Worker', 'Writer',
];

// REQ-JAVA-NAMING-003
export const DOMAIN_NOUNS = [
  'Buffer', 'Character', 'Cipher', 'Cluster', 'Container', 'Counter', 'Folder', 'Header', 'Layer', 'Ledger',
  'Letter', 'Manager', 'Marker', 'Member', 'Number', 'Offer', 'Order', 'Owner', 'Parameter', 'Peer', 'Player',
  'Register', 'Server', 'Trigger', 'User', 'Ver', 'Wrapper',
];

// REQ-JAVA-NAMING-005
const DECLARATION = /\b(?:class|interface)\s+(\w*er)\b/g;

// REQ-JAVA-NAMING-007
const PROJECT_NOUN = /^[A-Z][A-Za-z0-9]*er$/;

// REQ-JAVA-NAMING-001, REQ-JAVA-NAMING-007
export function findNamingIssues(source, projectNouns = []) {
  const allowed = [...PATTERN_SUFFIXES, ...DOMAIN_NOUNS, ...projectNouns];
  const found = [];
  for (const [offset, line] of codeLines(source).entries()) {
    for (const match of line.matchAll(DECLARATION)) {
      if (!allowed.some((suffix) => match[1].endsWith(suffix))) found.push({ line: offset + 1, text: match[1] });
    }
  }
  return found;
}

// REQ-JAVA-NAMING-007
function projectNouns(config) {
  const declared = config.javaNaming?.nouns ?? [];
  const listed = Array.isArray(declared) ? declared : [];
  return {
    nouns: listed.filter((noun) => typeof noun === 'string' && PROJECT_NOUN.test(noun)),
    problems: (Array.isArray(declared) ? listed : [declared])
      .filter((noun) => typeof noun !== 'string' || !PROJECT_NOUN.test(noun))
      .map((noun) => `javaNaming.nouns: «${noun}» — имя типа с заглавной буквы, оканчивающееся на -er`),
  };
}

async function lineOfTheSection(root) {
  try {
    const lines = (await readFile(path.join(root, CONFIG_FILE), 'utf8')).split('\n');
    const found = lines.findIndex((line) => line.includes('"javaNaming"'));
    return found === -1 ? 1 : found + 1;
  } catch {
    return 1;
  }
}

export async function findNamingViolations(root, config) {
  const violations = new Map();
  const { nouns, problems } = projectNouns(config);
  if (problems.length > 0) {
    const line = await lineOfTheSection(root);
    violations.set(CONFIG_FILE, problems.map((text) => ({ line, text })));
  }
  for (const file of await collectSourceFiles(root, config)) {
    // REQ-JAVA-NAMING-001, REQ-RUST-NAMING-002
    if (path.extname(file) !== '.java') continue;
    const issues = findNamingIssues(await readFile(path.join(root, file), 'utf8'), nouns);
    if (issues.length > 0) violations.set(file, issues);
  }
  return violations;
}
