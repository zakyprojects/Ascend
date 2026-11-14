/**
 * Delete account for a Google-only account: Google confirms it is them, then delete_own_account
 * accepts the delete within 5 minutes of that sign-in. The device keeps a mark while it is away at
 * Google; on the way back this decides what the mark means. Pure, so it is tested on its own
 * (the storage and session reads are in auth.ts).
 */

/** The server's window after a fresh sign-in (delete_own_account). */
export const DELETE_REAUTH_MS = 5 * 60 * 1000;

/** Written as the device leaves for Google. */
export interface GoogleDeleteMark {
  userId: string;
  /** Trusted time the check started (epoch ms). */
  at: number;
  /** The session's last_sign_in_at as it left; a finished Google sign-in moves it forward. */
  signedInAt?: string | null;
}

/**
 * - 'confirmed': back signed in to the same account by a new sign-in: delete may go ahead.
 * - 'not-finished': the check was started for this account but no new sign-in happened (Google
 *   cancelled or refused, Back pressed, or Settings reopened later).
 * - 'other-account': back signed in to a different account (another Google account was picked).
 *   Nothing is deleted.
 * - null: no recent check from this device.
 */
export type GoogleDeleteReauthResult = 'confirmed' | 'not-finished' | 'other-account' | null;

export function parseGoogleDeleteMark(raw: string | null): GoogleDeleteMark | null {
  if (!raw) return null;
  try {
    const mark = JSON.parse(raw) as Partial<GoogleDeleteMark> | null;
    if (!mark || typeof mark.userId !== 'string' || typeof mark.at !== 'number') return null;
    return { userId: mark.userId, at: mark.at, signedInAt: typeof mark.signedInAt === 'string' ? mark.signedInAt : null };
  } catch {
    return null;
  }
}

export function googleDeleteReauthResult(
  mark: GoogleDeleteMark | null,
  now: {
    /** The account signed in now. */
    userId: string;
    /** Its session's last_sign_in_at. */
    lastSignInAt: string | null | undefined;
    /** The page came back from the provider with an error. */
    redirectError: boolean;
    nowMs: number;
  }
): GoogleDeleteReauthResult {
  if (!mark) return null;
  const age = now.nowMs - mark.at;
  if (age < 0 || age >= DELETE_REAUTH_MS) return null;
  if (mark.userId !== now.userId) return 'other-account';
  if (now.redirectError) return 'not-finished';
  const signedIn = now.lastSignInAt ? Date.parse(now.lastSignInAt) : NaN;
  if (!Number.isFinite(signedIn)) return 'not-finished';
  const before = mark.signedInAt ? Date.parse(mark.signedInAt) : NaN;
  // A new sign-in moves last_sign_in_at past the one the device left with (server time on both
  // sides, so the device clock plays no part). Without the earlier value, the sign-in must be
  // after the check started.
  const fresh = Number.isFinite(before) ? signedIn > before : signedIn >= mark.at;
  return fresh ? 'confirmed' : 'not-finished';
}
