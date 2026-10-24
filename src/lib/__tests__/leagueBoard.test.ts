import type { LeagueCompetitor } from '@/types';
import { boardMemberCount } from '../leagues';
import { parseLeagueBoards } from '../leagueStandingsRefresh';
import {
  getProfileSeasonPointsByUsername,
  getRegisteredCompetitors,
  setCachedLeaguePoints,
  setCachedProfiles,
  toCompetitorStats,
} from '../auth';
import { getMonthPeriodId, getSeasonNumber, getWeekPeriodId, leagueNow } from '../leagueTime';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const member = (id: string, points: number, isUser = false): LeagueCompetitor => ({
  id,
  name: id,
  avatar: '🧑',
  points,
  totalPoints: points,
  isUser,
  isRealUser: true,
});

// "of N members" counts only members with points this period, as the period's archive does.
assert(boardMemberCount([]) === 0, 'empty board');
assert(
  boardMemberCount([member('me', 28, true), member('a', 100), member('b', 0), member('c', 0), member('d', 13)]) === 3,
  'zero-point members are not counted'
);
assert(boardMemberCount([member('a', 0.4), member('b', 0.5)]) === 1, 'rounded like the archive (round(points) > 0)');

// ascend_league_boards -> the league caches -> competitors on each board.
{
  const now = leagueNow();
  const W = getWeekPeriodId(now);
  const M = getMonthPeriodId(now);
  const S = `S:${getSeasonNumber(now)}`;
  const members = [
    { id: 'me', uid: '100001', username: 'qwer', avatar: '🦊', is_profile_public: true, accept_partner_invites: true },
    { id: 'a', uid: '100002', username: 'Yahya', avatar: '🐺', is_profile_public: false, accept_partner_invites: true },
    { id: 'b', uid: '100003', username: 'a_b-c', avatar: null, is_profile_public: true, accept_partner_invites: false },
  ];
  const full = {
    weekly: { period_id: W, points: [['a', 100], ['me', 28]] },
    monthly: { period_id: M, points: [['a', 255]] },
    ninetyDay: { period_id: S, points: [['a', 255], ['me', 91]] },
    members,
  };
  const parsed = parseLeagueBoards(full, false);
  assert(!!parsed && !!parsed.profiles && !!parsed.points, 'full answer parses');
  assert(parsed!.points![W].a === 100 && parsed!.points![W].me === 28 && !('b' in parsed!.points![W]), 'weekly points by member');
  assert(parsed!.points![M].a === 255 && Object.keys(parsed!.points![M]).length === 1, 'monthly points by member');
  assert(!(S in parsed!.points!), 'season points are not a period of the points cache');
  const byId = new Map(parsed!.profiles!.map((p: any) => [p.id, p]));
  assert(byId.get('a').season_points === 255 && byId.get('me').season_points === 91, 'season points on members');
  assert(byId.get('b').season_points === 0, 'a member the season board omits has 0 season points');
  assert(byId.get('b').uid === '100003' && byId.get('b').accept_partner_invites === false, 'member fields kept');

  setCachedProfiles(parsed!.profiles!);
  setCachedLeaguePoints(parsed!.points);
  const weekly = getRegisteredCompetitors('weekly', 'me', now);
  assert(weekly.length === 2 && !weekly.some((c) => c.id === 'me'), 'every other member, the viewer excluded');
  const wa = weekly.find((c) => c.id === 'a')!;
  const wb = weekly.find((c) => c.id === 'b')!;
  assert(wa.points === 100 && wb.points === 0, 'weekly points, 0 for a member without points');
  assert(wa.isProfilePublic === false && wb.avatar === '🧑' && wb.name === 'a_b-c', 'row fields mapped');
  assert(wa.stats === undefined && wa.season_history === undefined, 'no stats or past seasons in the list');
  assert(getRegisteredCompetitors('monthly', 'me', now).find((c) => c.id === 'a')!.points === 255, 'monthly points');
  const season = getRegisteredCompetitors('ninetyDay', 'me', now);
  assert(season.find((c) => c.id === 'a')!.points === 255 && season.find((c) => c.id === 'b')!.points === 0, 'season points');
  // Non-league readers (Discover creator rank, partner fallback) read the same cache.
  assert(getProfileSeasonPointsByUsername('YAHYA', 'ninetyDay', now) === 255, 'season points by username');

  const slim = parseLeagueBoards({ weekly: { period_id: W, points: [['a', 101]] }, monthly: { period_id: M, points: [] } }, true);
  assert(!!slim && slim.profiles === null && slim.points![W].a === 101 && Object.keys(slim.points![M]).length === 0, 'slim answer');

  assert(parseLeagueBoards({}, true) === null, 'empty answer (no session) is a failure');
  assert(parseLeagueBoards(null, false) === null, 'null answer is a failure');
  assert(parseLeagueBoards({ ...full, members: [] }, false) === null, 'no members is a failure');
  assert(parseLeagueBoards({ ...full, ninetyDay: undefined }, false) === null, 'full answer without season points is a failure');
  assert(parseLeagueBoards({ ...full, weekly: { period_id: W, points: [['a', '100']] } }, true) === null, 'malformed row is a failure');
  setCachedProfiles([]);
  setCachedLeaguePoints(null);
}

// On-tap stats: null (not shared) stays undefined; older stats fall back like an empty history.
assert(toCompetitorStats(null) === undefined, 'stats not shared');
{
  const st = toCompetitorStats({ habitsCompletedCount: 4 })!;
  assert(st.currentStreakDays === 0 && st.currentStreakIsActive === true && st.streakSource === undefined, 'older stats fallback');
  assert(st.habitsCompletedCount === 4 && st.booksRead === 0, 'counts');
}

console.log('leagueBoard fixtures: all passed');
