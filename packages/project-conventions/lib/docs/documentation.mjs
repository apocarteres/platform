import { checkDocumentation } from './check-docs.mjs';
import { updateTicketIndexes } from './tickets-index.mjs';
import { metadataDeclaration, projectFieldErrors } from './project-metadata.mjs';

// REQ-QUALITY-002
export async function documentationProblems(root, config) {
  // REQ-PROJECT-PROCESS-024
  const declaration = metadataDeclaration(config);
  const result = await checkDocumentation(root, {
    requiredCatalogTargets: config.docs?.requiredCatalogTargets ?? [],
    projectFields: declaration.fields,
    projectFieldErrors: projectFieldErrors(declaration.fields),
  });
  // REQ-PROJECT-PROCESS-013
  const indexErrors = await updateTicketIndexes(root, { check: true, stale: false });
  return {
    errors: [...declaration.problems.map((problem) => `.conventions.json: ${problem}`), ...result.errors, ...indexErrors],
    markdownCount: result.markdownCount,
    requirementClauseCount: result.requirementClauseCount,
  };
}
