/**
 * Partner limits shared by the Partners page and the public feature page (src/marketing), on their
 * own (no imports) so the static render can read them. The server enforces the same partner limit
 * (accept_partner_invite_atomic, send_partner_invite_atomic).
 */
export const MAX_PARTNERS = 5;

/** The lengths a shared challenge can run, in days. */
export const CHALLENGE_LENGTH_OPTIONS = [7, 14, 30];
