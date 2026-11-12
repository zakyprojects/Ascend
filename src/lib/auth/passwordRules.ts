/**
 * Rules for a new password (sign-up, save progress, change password). Must match Supabase
 * Dashboard > Authentication > Sign In / Providers > Email: minimum length 8, "Lowercase,
 * uppercase letters and digits". Existing passwords still sign in; these apply only when one is set.
 */
export const NEW_PASSWORD_MIN = 8;

const REQUIRED_CHARACTERS: [RegExp, string][] = [
  [/[a-z]/, 'Add a lowercase letter'],
  [/[A-Z]/, 'Add an uppercase letter'],
  [/[0-9]/, 'Add a number'],
];

/** The first rule a new password breaks, as a short instruction; null when it meets them all. */
export function newPasswordProblem(password: string): string | null {
  if (password.length < NEW_PASSWORD_MIN) return `Use at least ${NEW_PASSWORD_MIN} characters`;
  for (const [pattern, message] of REQUIRED_CHARACTERS) {
    if (!pattern.test(password)) return message;
  }
  return null;
}
