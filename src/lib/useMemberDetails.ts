import { useEffect, useState } from 'react';
import type { LeagueCompetitor, SeasonHistoryEntry, UserStats } from '@/types';
import { fetchProfileByUsernameFromSupabase } from './supabase';
import { toCompetitorStats } from './auth';

export type MemberDetails =
  | { status: 'loading' }
  | { status: 'failed' }
  /** stats undefined: the server does not share them with this viewer. */
  | { status: 'ready'; stats: UserStats | undefined; seasonHistory: SeasonHistoryEntry[] };

/**
 * Another member's stats and past seasons for the profile dialog, fetched each time it opens
 * (the league list carries neither). The server applies the privacy rule (ascend_member_profiles).
 * Null for no member and for the viewer's own row, whose details are local.
 */
export function useMemberDetails(competitor: LeagueCompetitor | null): MemberDetails | null {
  const id = competitor && !competitor.isUser ? competitor.id ?? null : null;
  const name = competitor?.name ?? '';
  const [result, setResult] = useState<{ id: string; details: MemberDetails } | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void fetchProfileByUsernameFromSupabase(name).then((row) => {
      if (cancelled) return;
      // A rename between the list and the tap can return nobody, or someone else under that name.
      const details: MemberDetails =
        row && row.id === id
          ? { status: 'ready', stats: toCompetitorStats(row.stats), seasonHistory: row.season_history || [] }
          : { status: 'failed' };
      setResult({ id, details });
    });
    return () => {
      cancelled = true;
      setResult(null);
    };
  }, [id, name]);

  if (!id) return null;
  return result?.id === id ? result.details : { status: 'loading' };
}
