// Every host's vault checks paths with these; the conformance suite
// covers them.

function hasBadSegment(segments: readonly string[]): boolean {
  return segments.some((s) => s === '' || s === '.' || s === '..');
}

// A path naming one entry: 'project.json', 'documents/<id>.json'.
export function assertVaultPath(path: string): void {
  if (path.includes('\\') || hasBadSegment(path.split('/'))) {
    throw new Error(`invalid vault path: ${JSON.stringify(path)}`);
  }
}

// A list() prefix: '' (everything), a directory ('modules/foo/'), or a
// partial name ('documents/ab'). Same rule, minus the final segment's.
export function assertVaultPrefix(prefix: string): void {
  if (prefix === '') return;
  const segments = prefix.split('/');
  segments.pop();
  if (prefix.includes('\\') || hasBadSegment(segments)) {
    throw new Error(`invalid vault prefix: ${JSON.stringify(prefix)}`);
  }
}
