import type { Partnership } from '@/types';

/**
 * Whether the signed-in member is user1 of a partnership.
 * The ids decide whenever the member's id is known: the usernames stored on the row are copies
 * that a rename can leave behind, so they are only a fallback before the id is available.
 */
export function isPartnershipUser1(p: Partnership, userId: string | undefined, username: string): boolean {
  if (userId && (p.user1Id === userId || p.user2Id === userId)) return p.user1Id === userId;
  return p.user1Username.toLowerCase() === username.toLowerCase();
}
