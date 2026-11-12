// Hook test (real useAppState + in-process fake Supabase, see harness/): refreshNow (pull-to-refresh).
// Story: realtime is not delivering (a phone's socket dropped); another device adds a habit and this
// device has an edit the server never got. The user pulls to refresh, then pulls again offline.
//   T18 refreshNow sends the waiting edit, pulls the other device's row, re-reads the settings doc
//       inside the 3-minute reconnect throttle (force), refetches notifications, league standings and
//       partner data (invites, partnerships), fires APP_REFRESH_EVENT once (the focus session and the
//       Partners page pull), and resolves only after the table pull and the partner read.
//   T19 offline it sends nothing and fires nothing (the offline banner says why); it never rejects.
//   T20 the Partners page's partner day keys (usePartnerDayKeys) read the partners' time zones again.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { bootHook, story, until, quiet, rows, eq, assert, pass, fake, server, habit, seedServerHabits, setOnline, UID } from './harness/bootHook';
import { doc } from './harness/dom';
import { APP_REFRESH_EVENT } from '../store/appRefresh';

await story('refresh.hook (pull-to-refresh)', async () => {
  seedServerHabits(habit('srv-a', 'ServerHabit'));
  server.blob.set(UID, { state: { username: 'hooktester' }, updated_at: 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)' });

  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await until(() => (fake.inFlight.get('user_data') ?? 0) === 0, 'boot saves settled');
  await quiet(1500);

  let refreshEvents = 0;
  window.addEventListener(APP_REFRESH_EVENT, () => refreshEvents++);

  // T18 — realtime off, so the other device's row and the retry can only come from the refresh.
  const subscribers = [...server.subscribers];
  server.subscribers.clear();
  const other = habit('other-dev', 'FromOtherDevice');
  server.upsert('habits', [{ id: other.id, user_id: UID, data: other, updated_at: other.updatedAt }], 'other-device');

  // An edit whose save the server refused: it waits in the outbox / dirty flag.
  fake.fail('habits', 503, ['POST', 'PATCH']);
  const added = h.s().addCustomHabit('WaitingEdit', 'daily');
  await until(() => fake.requests({ table: 'habits' }).some((r) => r.method !== 'GET' && JSON.stringify(r.body).includes(added.id)), 'T18: the edit was tried and refused');
  fake.unfail('habits');
  await quiet(1500);
  assert(!rows('habits').some((r: any) => r.id === added.id), 'T18: before the refresh the edit is not on the server');
  assert(!h.s().state.habits.some((x) => x.id === 'other-dev'), 'T18: before the refresh the other device row has not arrived');

  fake.resetCounts();
  // The loader waits on refreshNow, so it must resolve only after the table pull.
  const heldPull = fake.hold((r) => r.table === 'habits' && r.method === 'GET');
  const heldPartners = fake.hold((r) => r.table === 'partnerships' && r.method === 'GET');
  let settled = false;
  const refreshing = h.s().refreshNow().then(() => (settled = true));
  await until(() => heldPull.hits > 0, 'T18: the table pull started');
  await quiet(500);
  assert(!settled, 'T18: refreshNow still waiting while the pull is held');
  heldPull.release();
  await until(() => heldPartners.hits > 0, 'T18: the partnerships read started');
  await quiet(500);
  assert(!settled, 'T18: refreshNow still waiting while the partnerships read is held');
  heldPartners.release();
  await refreshing;
  await until(() => h.s().state.habits.some((x) => x.id === 'other-dev'), 'T18: other device row pulled', 1000);
  await until(() => rows('habits').some((r: any) => r.id === added.id), 'T18: waiting edit sent', 3000);
  assert(fake.requests({ table: 'user_data', method: 'GET' }).length >= 1, 'T18: settings doc read again inside the 3-minute throttle');
  assert(fake.requests({ table: 'notifications', method: 'GET' }).length >= 1, 'T18: notifications refetched');
  assert(fake.requests({ table: 'rpc/ascend_league_boards' }).length >= 1, 'T18: league standings refetched');
  assert(fake.requests({ table: 'partner_invites', method: 'GET' }).length >= 1, 'T18: partner invites refetched');
  eq(refreshEvents, 1, 'T18: APP_REFRESH_EVENT fired once');
  assert(!fake.requests().some((r) => r.path.includes('reload')), 'T18: no reload');
  pass('T18 refreshNow sends the waiting edit, pulls rows + settings + notifications + standings + partners, fires the refresh event');

  // T19
  await quiet(1500);
  fake.offline = true;
  setOnline(false);
  await quiet(1500);
  const attempts = fake.offlineAttempts;
  let rejected = false;
  await h.s().refreshNow().catch(() => (rejected = true));
  await quiet(500);
  eq(fake.offlineAttempts - attempts, 0, 'T19: offline refresh sends nothing');
  eq(refreshEvents, 1, 'T19: offline refresh fires no event');
  assert(!rejected, 'T19: never rejects');
  fake.offline = false;
  setOnline(true);
  for (const sub of subscribers) server.subscribers.add(sub);
  pass('T19 offline refresh does nothing and never rejects');

  // T20
  const React = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { usePartnerDayKeys } = await import('../partners/usePartnerDayKeys');
  const zoneReads = () => fake.requests({ table: 'rpc/ascend_partner_timezones' }).length;
  const before = zoneReads();
  function PartnerDays() {
    usePartnerDayKeys(['partner-x']);
    return null;
  }
  createRoot((doc.createElement as () => Element)()).render(React.createElement(PartnerDays));
  await until(() => zoneReads() > before, 'T20: first time-zone read');
  await quiet(500);
  const afterMount = zoneReads();
  await h.s().refreshNow();
  await until(() => zoneReads() > afterMount, 'T20: time zones read again on refresh', 3000);
  pass('T20 refresh reads the partners\' time zones again');
});
