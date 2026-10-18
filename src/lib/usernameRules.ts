/**
 * The username rule, the same one the server applies (ascend_change_username, the
 * sign-in-username Edge Function): 3–20 letters, numbers, _ or -, compared without case.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9_-]{3,20}$/;

/** True when the text (trimmed) has a username's shape. A username never contains "@". */
export function looksLikeUsername(value: string): boolean {
  return USERNAME_PATTERN.test(value.trim());
}
