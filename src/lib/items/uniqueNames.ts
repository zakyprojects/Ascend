/**
 * One rule for names a user gives their own things (habits, skills, books, plans, goals,
 * categories, templates...): within one list, no two may share a name. Names compare trimmed,
 * with inner spaces collapsed and without regard to case ("Read  Book " = "read book").
 * Client-side only: old duplicates stay as they are, and an item may always keep its own name.
 */

/** The form a name is compared in. */
export function nameKey(name: string | undefined | null): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** True when two names count as the same name. */
export function sameName(a: string | undefined | null, b: string | undefined | null): boolean {
  return nameKey(a) === nameKey(b);
}

/**
 * True when another item in `items` already has this name. `editing` is the item being renamed:
 * it is skipped, and keeping its own current name is always fine (so an old duplicate can still be
 * edited). `nameOf` reads an item's name (default: its `name`, else its `title`).
 */
export function nameTaken<T extends { id: string }>(
  name: string,
  items: readonly T[],
  options: { editing?: T | null; nameOf?: (item: T) => string | undefined } = {}
): boolean {
  const key = nameKey(name);
  if (!key) return false;
  const nameOf = options.nameOf ?? ((item: T) => (item as { name?: string }).name ?? (item as { title?: string }).title);
  const editing = options.editing;
  if (editing && nameKey(nameOf(editing)) === key) return false;
  return items.some((item) => item.id !== editing?.id && nameKey(nameOf(item)) === key);
}

/** `base` if no item uses it yet, else "base 2", "base 3"... (for names the app picks itself). */
export function firstFreeName(base: string, takenNames: readonly string[]): string {
  const taken = new Set(takenNames.map(nameKey));
  if (!taken.has(nameKey(base))) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base} ${n}`;
    if (!taken.has(nameKey(candidate))) return candidate;
  }
}
