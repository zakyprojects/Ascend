// Hook test (real useAppState + in-process fake Supabase, see harness/): Leagues' "Couldn't refresh"
// line (isLeagueStandingsStale), read by Leagues.tsx above the standings.
//   LS1 standings loaded: not stale. A refresh that fails keeps the rows ('ready') and marks them stale;
//       stale stays while the next attempt runs; a good refresh clears it.
//   LS2 a refresh tried offline marks the shown rows stale too; back online, a good refresh clears it.
import { bootHook, story, until, assert, eq, pass, fake, server, setOnline, UID } from './harness/bootHook';

await story('leagueStale.hook (Leagues couldn\'t-refresh line)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)' });
  fake.leagueBoards = {
    weekly: { period_id: 'W', points: [[UID, 10]] },
    monthly: { period_id: 'M', points: [[UID, 10]] },
    ninetyDay: { points: [[UID, 10]] },
    members: [{ id: UID, username: 'hooktester', avatar: '🧑' }],
  };
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await until(() => h.s().getLeagueStandingsStatus() === 'ready', 'standings loaded');
  assert(!h.s().isLeagueStandingsStale(), 'LS1: fresh standings are not stale');

  // LS1: the next refresh fails.
  fake.fail('rpc/ascend_league_boards', 500);
  await h.s().refreshLeagueStandings({ full: true });
  eq(h.s().getLeagueStandingsStatus(), 'ready', 'LS1: rows stay after a failed refresh');
  await until(() => h.s().isLeagueStandingsStale(), 'LS1: failed refresh marks the rows stale');
  const held = fake.hold((r) => r.table === 'rpc/ascend_league_boards');
  fake.unfail('rpc/ascend_league_boards');
  const next = h.s().refreshLeagueStandings({ full: true });
  await until(() => held.hits > 0, 'LS1: next attempt running');
  assert(h.s().isLeagueStandingsStale(), 'LS1: still stale while the next attempt runs');
  held.release();
  await next;
  await until(() => !h.s().isLeagueStandingsStale(), 'LS1: a good refresh clears it');
  pass('LS1 failed refresh with rows shown: stale until a refresh succeeds');

  // LS2: offline.
  setOnline(false);
  await h.s().refreshLeagueStandings({ full: true });
  await until(() => h.s().isLeagueStandingsStale(), 'LS2: refresh tried offline marks the rows stale');
  eq(h.s().getLeagueStandingsStatus(), 'ready', 'LS2: rows stay offline');
  setOnline(true);
  await h.s().refreshLeagueStandings({ full: true });
  await until(() => !h.s().isLeagueStandingsStale(), 'LS2: back online, a good refresh clears it');
  pass('LS2 offline refresh marks the rows stale; back online it clears');
});
