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
    fetchBoards: async (slim) => {
      calls.push(slim ? 'slim' : 'full');
      return slim ? { profiles: null, points: { ...livePoints } } : { profiles: members, points: { ...livePoints } };
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
  // First refresh is the full set (one call); a poll a minute later is one slim call.
  {
    const t = setup();
    await t.refresher.refresh();
    assert(t.calls.join() === 'full', 'first refresh is one full call');
    t.advance(MIN);
    t.setLive({ W: { me: 6, a: 3 }, M: { me: 10 } });
    await t.refresher.refresh();
    assert(t.calls.slice(1).join() === 'slim', 'poll is one slim call');
    const r = last(t.applied);
    assert(r.profiles === null, 'poll keeps the cached member list');
    assert(r.points?.W.me === 6 && r.points?.M.me === 10, 'live periods are updated');
    assert(t.refresher.fetchedUserId() === 'me' && !t.refresher.lastAttemptFailed(), 'poll counts as success');
  }

  // full: true always takes the full set; so does a poll once the full set is 10 minutes old.
  {
    const t = setup();
    await t.refresher.refresh();
    t.advance(MIN);
    await t.refresher.refresh({ full: true });
    assert(t.calls.slice(1).join() === 'full', 'full refresh is one full call');
    t.advance(10 * MIN);
    await t.refresher.refresh();
    assert(t.calls.slice(2).join() === 'full', 'stale full set is fetched again');
  }

  // A member missing from the list scores: that poll takes the full set so their profile arrives.
  {
    const t = setup();
    await t.refresher.refresh();
    t.advance(MIN);
    t.setLive({ W: { me: 5, a: 3, newbie: 2 }, M: { me: 9 } });
    t.setMembers([{ id: 'me' }, { id: 'a' }, { id: 'newbie' }]);
    await t.refresher.refresh();
    assert(t.calls.slice(1).join() === 'slim,full', 'unknown member triggers the full set');
    assert(last(t.applied).profiles?.length === 3, 'new member list applied');
  }

  // Sign-out forgets the full set: the next refresh is a full one.
  {
    const t = setup();
    await t.refresher.refresh();
    t.refresher.reset();
    t.advance(MIN);
    await t.refresher.refresh();
    assert(t.calls.slice(1).join() === 'full', 'after reset the full set is fetched');
  }

  // A failed call (null) applies nothing and reports the failure; the caches keep what they had.
  {
    let fail = false;
    const applied: LeagueStandingsResult[] = [];
    let nowMs = Date.UTC(2026, 9, 21, 9, 0, 0);
    const refresher = createLeagueStandingsRefresher({
      sessionUserId: async () => 'me',
      fetchBoards: async (slim) =>
        fail ? null : { profiles: slim ? null : [{ id: 'me' }], points: { W: { me: 1 }, M: {} } },
      now: () => new Date(nowMs),
      isOnline: () => true,
      apply: (r) => applied.push(r),
    });
    await refresher.refresh();
    fail = true;
    nowMs += MIN;
    await refresher.refresh();
    assert(applied.length === 1 && refresher.lastAttemptFailed(), 'failed slim poll applies nothing');
    await refresher.refresh({ full: true });
    assert(applied.length === 1 && refresher.lastAttemptFailed(), 'failed full refresh applies nothing');
    assert(refresher.fetchedUserId() === 'me', 'the earlier full set still counts for this member');
  }

  console.log('leagueStandingsRefresh: all assertions passed');
  // An assertion that throws rejects this promise; Node then exits non-zero (unhandled rejection).
})();
