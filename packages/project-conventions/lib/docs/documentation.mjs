import { checkDocumentation } from './check-docs.mjs';
import { updateTicketIndexes } from './tickets-index.mjs';

// REQ-QUALITY-002
export async function documentationProblems(root, config) {
  const result = await checkDocumentation(root, {
    requiredCatalogTargets: config.docs?.requiredCatalogTargets ?? [],
  });
  // REQ-PROJECT-PROCESS-013
  const indexErrors = await updateTicketIndexes(root, { check: true, stale: false });
  return {
    errors: [...result.errors, ...indexErrors],
    markdownCount: result.markdownCount,
    requirementClauseCount: result.requirementClauseCount,
  };
}
