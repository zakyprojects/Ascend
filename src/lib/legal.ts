/**
 * The Terms and Privacy Policy (`/terms`, `/privacy`, components/legal/LegalPage): the facts they
 * share with sign-up, kept in one place so a change is made once.
 */

/** Where people write about their data, the Terms, or anything else. */
export const LEGAL_CONTACT_EMAIL = 'hello@ascendday.com';

/** Who runs Ascend. */
export const LEGAL_OPERATOR = 'Ascend, run by Zakria Khan, Pakistan';

/** The youngest age allowed to use Ascend. */
export const MIN_AGE = 13;

/** Shown on both pages as "Last updated". Change it with every edit to either page. */
export const LEGAL_UPDATED = '22 October 2026';

/**
 * The version a new account agrees to: sent in the sign-up and guest-start metadata, where the
 * database stamps it on the profile (profiles_terms_from_auth). Change it when the Terms or the
 * Privacy Policy change in a way people must agree to again.
 */
export const TERMS_VERSION = '2026-10-20';

/**
 * Accounts created before this moment signed up before the Terms existed, so they are told once
 * that there are Terms and a Privacy Policy now (Dashboard, LegalNoticeCard).
 */
export const LEGAL_NOTICE_BEFORE_MS = Date.parse('2026-10-20T00:00:00+05:00');

// Set per account on this device once the notice is closed or one of its links is opened.
const NOTICE_DONE_KEY_PREFIX = 'ascend_legal_notice_done_';

/** Whether this account is told about the Terms and Privacy Policy on this device. */
export function shouldShowLegalNotice(userId: string, createdAt: string | undefined): boolean {
  const created = createdAt ? Date.parse(createdAt) : NaN;
  if (!(created < LEGAL_NOTICE_BEFORE_MS)) return false;
  try {
    return localStorage.getItem(NOTICE_DONE_KEY_PREFIX + userId) !== TERMS_VERSION;
  } catch {
    return false; // storage blocked: a closed notice could not stay closed
  }
}

/** The notice is answered for this account on this device and not shown again. */
export function markLegalNoticeDone(userId: string): void {
  try {
    localStorage.setItem(NOTICE_DONE_KEY_PREFIX + userId, TERMS_VERSION);
  } catch {
    /* storage blocked: shouldShowLegalNotice already keeps the notice away */
  }
}
