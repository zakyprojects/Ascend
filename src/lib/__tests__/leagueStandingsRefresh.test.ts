// League standings refresher: polls between full fetches ask only for this week's and month's points.
import { createLeagueStandingsRefresher, type LeagueStandingsResult } from '../leagueStandingsRefresh';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
}

const MIN = 60_000;

function setup() {
  let nowMs = Date.UTC(2026, 9, 21, 9, 0, 0); // a Wednesday, mid-week and mid-month
  const calls: string[] = [];
  const applied: LeagueStandingsResult[] = [];
  let members = [{ id: 'me' }, { id: 'a' }];
  let livePoints: Record<string, Record<string, number>> = { W: { me: 5, a: 3 }, M: { me: 9 } };
  const refresher = createLeagueStandingsRefresher({
    sessionUserId: async () => 'me',
    fetchProfiles: async () => {
      calls.push('profiles');
      return members;
    },
    fetchPoints: async (_now, scope) => {
      calls.push(`points:${scope}`);
      return scope === 'live' ? { ...livePoints } : { ...livePoints, OLD: { a: 40 } };
    },
    now: () => new Date(nowMs),
    isOnline: () => true,
    apply: (r) => applied.push(r),
  });
  return {
    refresher,
    calls,
    applied,
    advance: (ms: number) => (nowMs += ms),
    setMembers: (m: { id: string }[]) => (members = m),
    setLive: (p: Record<string, Record<string, number>>) => (livePoints = p),
  };
}

const last = <T,>(xs: T[]) => xs[xs.length - 1];

(async () => {
  // First refresh is the full set; a poll a minute later asks only for live points and keeps OLD.
  {
    const t = setup();
    await t.refresher.refresh();
    assert(t.calls.join() === 'profiles,points:all', 'first refresh fetches profiles and all periods');
    t.advance(MIN);
    t.setLive({ W: { me: 6, a: 3 }, M: { me: 10 } });
    await t.refresher.refresh();
    assert(t.calls.slice(2).join() === 'points:live', 'poll fetches live points only');
    const r = last(t.applied);
    assert(r.profiles === null, 'poll keeps the cached member list');
    assert(r.points?.W.me === 6 && r.points?.M.me === 10, 'live periods are updated');
    assert(r.points?.OLD.a === 40, 'earlier periods are kept');
    assert(t.refresher.fetchedUserId() === 'me' && !t.refresher.lastAttemptFailed(), 'poll counts as success');
  }

  // full: true always takes the full set; so does a poll once the full set is 10 minutes old.
  {
    const t = setup();
    await t.refresher.refresh();
    t.advance(MIN);
    await t.refresher.refresh({ full: true });
    assert(t.calls.slice(2).join() === 'profiles,points:all', 'full refresh fetches everything');
    t.advance(10 * MIN);
    await t.refresher.refresh();
    assert(t.calls.slice(4).join() === 'profiles,points:all', 'stale full set is fetched again');
  }

  // A member missing from the list scores: that poll takes the full set so their profile arrives.
  {
    const t = setup();
    await t.refresher.refresh();
    t.advance(MIN);
    t.setLive({ W: { me: 5, a: 3, newbie: 2 }, M: { me: 9 } });
    t.setMembers([{ id: 'me' }, { id: 'a' }, { id: 'newbie' }]);
    await t.refresher.refresh();
    assert(t.calls.slice(2).join() === 'points:live,profiles,points:all', 'unknown member triggers the full set');
    assert(last(t.applied).profiles?.length === 3, 'new member list applied');
  }

  // Sign-out forgets the full set: the next refresh is a full one.
  {
    const t = setup();
    await t.refresher.refresh();
    t.refresher.reset();
    t.advance(MIN);
    await t.refresher.refresh();
    assert(t.calls.slice(2).join() === 'profiles,points:all', 'after reset the full set is fetched');
  }

  console.log('leagueStandingsRefresh: all assertions passed');
  // An assertion that throws rejects this promise; Node then exits non-zero (unhandled rejection).
})();
