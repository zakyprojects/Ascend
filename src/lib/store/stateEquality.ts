/**
 * `prev` itself when `next` holds the same values (top-level keys equal by reference or by JSON),
 * otherwise `next`. For periodic reconcilers that rebuild state each tick: returning `prev` keeps
 * React from re-rendering and the autosave from saving when nothing changed.
 */
export function keepIfUnchanged<T extends object>(prev: T, next: T): T {
  if (prev === next) return prev;
  const nextKeys = Object.keys(next) as (keyof T)[];
  if (nextKeys.length !== Object.keys(prev).length) return next;
  for (const key of nextKeys) {
    if (next[key] === prev[key]) continue;
    if (!Object.prototype.hasOwnProperty.call(prev, key)) return next;
    if (JSON.stringify(next[key] ?? null) !== JSON.stringify(prev[key] ?? null)) return next;
  }
  return prev;
}

/**
 * Key-sorted copy without undefined values. jsonb does not keep key order, so values compared
 * or hashed after a server round trip use this form.
 */
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const field = (value as Record<string, unknown>)[key];
    if (field !== undefined) sorted[key] = canonical(field);
  }
  return sorted;
}
