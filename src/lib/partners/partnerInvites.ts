import type { PartnerInvite } from '@/types';

/**
 * The invite list once the server has stored a sent invite. The local copy takes the id the server
 * returned (a resend while the caller's invite still waits returns that invite's id, not ours); if an
 * invite with that id is already listed, the local copy is dropped instead of listed twice.
 */
export function adoptServerInviteId(
  invites: PartnerInvite[],
  localId: string,
  serverId: string | null | undefined
): PartnerInvite[] {
  if (!serverId || serverId === localId) return invites;
  if (invites.some((i) => i.id === serverId)) return invites.filter((i) => i.id !== localId);
  return invites.map((i) => (i.id === localId ? { ...i, id: serverId } : i));
}
