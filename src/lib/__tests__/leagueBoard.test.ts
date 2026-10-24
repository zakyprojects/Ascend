import type { LeagueCompetitor } from '@/types';
import { boardMemberCount } from '../leagues';

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

console.log('leagueBoard fixtures: all passed');
