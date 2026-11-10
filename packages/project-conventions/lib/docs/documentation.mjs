import { checkDocumentation } from './check-docs.mjs';
import { updateTicketIndexes } from './tickets-index.mjs';
import { metadataDeclaration, projectFieldErrors } from './project-metadata.mjs';
import { storeDeclaration } from '../store/config.mjs';

// REQ-QUALITY-002
export async function documentationProblems(root, config) {
  // REQ-PROJECT-PROCESS-024
  const declaration = metadataDeclaration(config);
  // REQ-STORE-015
  const declared = storeDeclaration(config);
  const result = await checkDocumentation(root, {
    store: declared.store,
    requiredCatalogTargets: config.docs?.requiredCatalogTargets ?? [],
    projectFields: declaration.fields,
    projectFieldErrors: projectFieldErrors(declaration.fields),
  });
  // REQ-PROJECT-PROCESS-013
  const indexErrors = await updateTicketIndexes(root, { check: true, stale: false, ideasOnly: declared.store !== null });
  return {
    errors: [...[...declaration.problems, ...declared.problems].map((problem) => `.conventions.json: ${problem}`), ...result.errors, ...indexErrors],
    markdownCount: result.markdownCount,
    requirementClauseCount: result.requirementClauseCount,
  };
}
