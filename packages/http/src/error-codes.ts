// REQ-API-002
export function unknownErrorCodes(used: readonly string[], declared: readonly string[]): string[] {
  const dictionary = new Set(declared);
  return [...new Set(used)].filter((code) => !dictionary.has(code)).sort();
}

export function unusedErrorCodes(used: readonly string[], declared: readonly string[]): string[] {
  const seen = new Set(used);
  return [...new Set(declared)].filter((code) => !seen.has(code)).sort();
}
