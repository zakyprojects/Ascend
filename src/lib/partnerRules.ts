/**
 * Partner limits shared by the Partners page and the public feature page (src/marketing), on their
 * own (no imports) so the static render can read them. The server enforces the same partner limit
 * (accept_partner_invite_atomic, send_partner_invite_atomic).
 */
export const MAX_PARTNERS = 5;

/** The lengths a shared challenge can run, in days. */
export const CHALLENGE_LENGTH_OPTIONS = [7, 14, 30];

/**
 * The server's partner-limit errors (send_partner_invite_atomic, accept_partner_invite_atomic:
 * "You have / Target user has reached the maximum limit of 5 accountability partners.") in plain
 * words; null for any other message. `otherName`: the other person, when the caller knows it.
 */
export function partnerLimitText(message: string, otherName?: string | null): string | null {
  const text = message.trim();
  if (!/maximum limit of \d+ accountability partners/i.test(text)) return null;
  if (/^target user/i.test(text)) return otherName ? `${otherName} already has ${MAX_PARTNERS} partners.` : `They already have ${MAX_PARTNERS} partners.`;
  return `You already have ${MAX_PARTNERS} partners. Remove one first.`;
}
