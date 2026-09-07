import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { collectSourceFiles } from './comments.mjs';
import { codeLines } from './clock.mjs';

// REQ-CODE-NAMING-002
export const PATTERN_SUFFIXES = [
  'Adapter', 'Builder', 'Compiler', 'Consumer', 'Controller', 'Decoder', 'Encoder', 'Filter',
  'Forwarder', 'Handler', 'Listener', 'Loader', 'Mapper', 'Parser', 'Producer', 'Provider',
  'Publisher', 'Reader', 'Resolver', 'Router', 'Runner', 'Scheduler', 'Serializer', 'Subscriber',
  'Validator', 'Verifier', 'Worker', 'Writer',
];

// REQ-CODE-NAMING-003
export const DOMAIN_NOUNS = [
  'Buffer', 'Cipher', 'Cluster', 'Container', 'Counter', 'Folder', 'Header', 'Layer', 'Manager',
  'Marker', 'Member', 'Number', 'Offer', 'Order', 'Owner', 'Parameter', 'Peer', 'Register',
  'Server', 'Trigger', 'User', 'Ver', 'Wrapper',
];

const DECLARATION = /\b(?:class|interface|record|enum)\s+(\w*er)\b/g;
const ALLOWED = new RegExp(`(?:${[...PATTERN_SUFFIXES, ...DOMAIN_NOUNS].join('|')})$`);

export function findNamingIssues(source) {
  const found = [];
  for (const [offset, line] of codeLines(source).entries()) {
    for (const match of line.matchAll(DECLARATION)) {
      if (!ALLOWED.test(match[1])) found.push({ line: offset + 1, text: match[1] });
    }
  }
  return found;
}

export async function findNamingViolations(root, config) {
  const violations = new Map();
  for (const file of await collectSourceFiles(root, config)) {
    if (path.extname(file) !== '.java') continue;
    const issues = findNamingIssues(await readFile(path.join(root, file), 'utf8'));
    if (issues.length > 0) violations.set(file, issues);
  }
  return violations;
}
