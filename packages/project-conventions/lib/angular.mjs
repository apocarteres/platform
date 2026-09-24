import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { manifests } from './toolchain.mjs';

// REQ-CLIENT-UPDATE-008, REQ-BUILD-014
export const WORKSPACE = 'angular.json';

// REQ-CLIENT-UPDATE-008, REQ-BUILD-014
function lineOf(source, name) {
  const at = source.indexOf(`"${name}"`);
  return at === -1 ? 1 : source.slice(0, at).split('\n').length;
}

// REQ-CLIENT-UPDATE-008, REQ-BUILD-014
export async function angularApplications(root) {
  const found = [];
  for (const file of await manifests(root, WORKSPACE)) {
    const source = await readFile(path.join(root, file), 'utf8');
    let workspace;
    try {
      workspace = JSON.parse(source);
    } catch {
      found.push({ file, broken: true, line: 1 });
      continue;
    }
    const base = path.dirname(file);
    for (const [name, project] of Object.entries(workspace.projects ?? {})) {
      if (project?.projectType !== 'application') continue;
      const sourceRoot = path.join(base, project.sourceRoot ?? path.join(project.root ?? '', 'src'));
      found.push({ file, name, project, sourceRoot, line: lineOf(source, name) });
    }
  }
  return found;
}
