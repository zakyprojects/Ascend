import { useEffect, useState } from 'react';
import type { LeagueCompetitor, MemberCard, SeasonHistoryEntry, UserStats } from '@/types';
import { fetchMemberCardFromSupabase, fetchProfileByUsernameFromSupabase } from '../supabase';
import { toCompetitorStats } from '../auth';

export type MemberDetails =
  | { status: 'loading' }
  | { status: 'failed' }
  /**
   * card: this season, computed by the server (ascend_member_card); undefined when the server does
   * not share it with this viewer. stats / seasonHistory: from the profile (the viewer's own are local,
   * so for self they stay undefined / empty here).
   */
  | { status: 'ready'; card: MemberCard | undefined; stats: UserStats | undefined; seasonHistory: SeasonHistoryEntry[] };

/**
 * A member's card and past seasons for the profile dialog, fetched each time it opens (the league
 * list carries neither). Every member, the viewer included, gets the card from the server, so the
 * figures are the same whoever looks. The server applies the privacy rule.
 */
export function useMemberDetails(competitor: LeagueCompetitor | null): MemberDetails | null {
  const id = competitor?.id ?? null;
  const isSelf = !!competitor?.isUser;
  const name = competitor?.name ?? '';
  const [result, setResult] = useState<{ id: string; details: MemberDetails } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void Promise.all([fetchMemberCardFromSupabase(id), isSelf ? Promise.resolve(null) : fetchProfileByUsernameFromSupabase(name)]).then(
      ([cardResult, row]) => {
        if (cancelled) return;
        let details: MemberDetails;
        if (!cardResult.ok) details = { status: 'failed' };
        else if (isSelf) details = { status: 'ready', card: cardResult.card, stats: undefined, seasonHistory: [] };
        // A rename between the list and the tap can return nobody, or someone else under that name.
        else if (!row || row.id !== id) details = { status: 'failed' };
        else
          details = {
            status: 'ready',
            card: cardResult.card,
            stats: toCompetitorStats(row.stats),
            seasonHistory: row.season_history || [],
          };
        setResult({ id, details });
      }
    );
    return () => {
      cancelled = true;
      setResult(null);
    };
  }, [id, isSelf, name]);

  if (!id) return null;
  return result?.id === id ? result.details : { status: 'loading' };
}
