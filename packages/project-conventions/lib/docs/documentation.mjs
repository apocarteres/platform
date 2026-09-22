import { checkDocumentation } from './check-docs.mjs';
import { updateTicketIndexes } from './tickets-index.mjs';
import { refreshCompositionLinks, updateReleaseIndex } from './releases-index.mjs';

// REQ-QUALITY-002
export async function documentationProblems(root, config) {
  const result = await checkDocumentation(root, {
    requiredCatalogTargets: config.docs?.requiredCatalogTargets ?? [],
  });
  const indexErrors = [
    ...await updateTicketIndexes(root, { check: true }),
    ...await refreshCompositionLinks(root, { check: true }),
    ...await updateReleaseIndex(root, { check: true }),
  ];
  return {
    errors: [...result.errors, ...indexErrors],
    markdownCount: result.markdownCount,
    requirementClauseCount: result.requirementClauseCount,
  };
}
