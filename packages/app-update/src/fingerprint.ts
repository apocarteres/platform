// REQ-CLIENT-UPDATE-002
const REFERENCES = 'script[src], link[href]';

// REQ-CLIENT-UPDATE-002
export function fingerprintOf(html: string, parser: DOMParser): string | null {
  const page = parser.parseFromString(html, 'text/html');
  const found = new Set<string>();
  for (const element of Array.from(page.querySelectorAll(REFERENCES))) {
    const reference = element.getAttribute(element.tagName === 'SCRIPT' ? 'src' : 'href');
    if (reference !== null && reference.length > 0) found.add(reference);
  }
  return found.size === 0 ? null : [...found].sort().join('\n');
}
