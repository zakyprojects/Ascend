/** FNV-1a over the row JSON; toRow fixes the key order. No imports, so any sync module can use it. */
export function hashRow(row: Record<string, unknown>): string {
  const text = JSON.stringify(row);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
