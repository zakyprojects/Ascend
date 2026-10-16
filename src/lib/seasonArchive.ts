import { LeagueArchive, SeasonHistoryEntry } from '@/types';
import { getSeasonLabel } from './leagues';
import { getSeasonStartByNumber } from './leagueTime';

/**
 * Season close (90-day league archive). The server writes every member's `S:<n>` archive from
 * the points ledger once the season has rolled over (public.ascend_run_league_archives); the
 * app only reads them.
 */

function getSeasonBounds(seasonNumber: number): { start: Date; end: Date } {
  return { start: getSeasonStartByNumber(seasonNumber), end: getSeasonStartByNumber(seasonNumber + 1) };
}

/** The member's closed seasons as published on their profile, newest first. */
export function toSeasonHistory(archives: LeagueArchive[] = []): SeasonHistoryEntry[] {
  return archives
    .filter((a) => a && a.type === 'ninetyDay' && typeof a.seasonNumber === 'number' && a.userPoints > 0)
    .sort((a, b) => (b.seasonNumber as number) - (a.seasonNumber as number))
    .map((a) => ({
      seasonNumber: a.seasonNumber,
      seasonName: getSeasonLabel(getSeasonBounds(a.seasonNumber as number).start),
      points: a.userPoints,
      // Last day of the season (UTC), stable however often the archive is rebuilt.
      date: new Date(getSeasonBounds(a.seasonNumber as number).end.getTime() - 1).toISOString().slice(0, 10),
    }));
}
