/**
 * The Terms and Privacy Policy (`/terms`, `/privacy`, components/legal/LegalPage): the facts they
 * share with sign-up, kept in one place so a change is made once.
 */

/** Where people write about their data, the Terms, or anything else. */
export const LEGAL_CONTACT_EMAIL = 'hello@ascendday.com';

/** Who runs AscendDay. The old name stays in brackets so the Terms people agreed to as "Ascend" clearly carry on. */
export const LEGAL_OPERATOR = 'AscendDay (formerly Ascend), run by Zakria Khan, Pakistan';

/** The youngest age allowed to use Ascend. */
export const MIN_AGE = 13;

/** Shown on both pages as "Last updated". Change it with every edit to either page. */
export const LEGAL_UPDATED = '25 October 2026';

/**
 * The version a new account agrees to: sent in the sign-up and guest-start metadata, where the
 * database stamps it on the profile (profiles_terms_from_auth). Change it when the Terms or the
 * Privacy Policy change in a way people must agree to again.
 */
export const TERMS_VERSION = '2026-10-20';
