/**
 * The username rule, the same one the server applies (ascend_change_username, the
 * sign-in-username Edge Function, CHECK profiles_username_format, unique index on lower(username)): trimmed, 3–20 letters,
 * numbers, _ or -, unique without regard to case ("Zakria" and "zakria" are the same name).
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;

export const USERNAME_FORMAT_RULE = 'Use 3–20 letters, numbers, _ or -.';
export const USERNAME_TAKEN = 'That username is taken.';

/** True when the text (trimmed) has a username's shape. A username never contains "@". */
export function looksLikeUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value.trim());
}

/** What is wrong with a username's shape (trimmed first), or null when it is fine. */
export function usernameFormatProblem(value: string): string | null {
  const name = value.trim();
  if (!name) return 'Fill in this field.';
  return USERNAME_PATTERN.test(name) ? null : USERNAME_FORMAT_RULE;
}

/**
 * A username with the rule's shape built from any text (an email's local part, an old metadata
 * name): signs the rule does not allow are dropped and the result is cut to 20 characters; one
 * too short gets "_user". A taken name is handled where the profile is inserted (number suffix).
 */
export function usernameFrom(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20);
  if (cleaned.length >= 3) return cleaned;
  return cleaned ? `${cleaned}_user` : 'user';
}

/**
 * Text for an `ilike` filter that matches exactly that text, without regard to case: the LIKE
 * signs \, % and _ are escaped (_ is allowed in usernames and would match any character).
 */
export function ilikeExact(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

/** Two usernames are the same name when they match without regard to case (after trimming). */
export function sameUsername(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** The server's "taken" answers (the rename RPC's message, a unique-index 23505) in the app's words. */
export function isUsernameTakenError(err: unknown): boolean {
  const e = (err ?? {}) as { code?: unknown; message?: unknown };
  if (e.code === '23505') return true;
  return typeof e.message === 'string' && /already taken|username_lower_key|profiles_username_key/i.test(e.message);
}
