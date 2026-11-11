// Hook test (real useAppState + in-process fake Supabase, see harness/): the notification and league
// actions of a signed-in account. Written for C2 (moving them out of useAppState).
//   T32  the inbox loads from notifications; marking one read saves it; a mark-read the server refuses
//        goes back to unread with a toast; mark-all-read saves every row; clearing one removes it here
//        and on the server (tombstone); clearing the read ones empties the inbox; Retry fetches a new
//        notice; the partners Retry reloads (loading, then ready); getLeagueData counts a points change
//        made after it was first read.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { bootHook, story, until, quiet, eq, assert, pass, server, fake, UID } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';

await story('notifications.hook (notification and league actions)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });
  // eslint-disable-next-line no-restricted-syntax -- notices from the last minutes, inside the 30-day window
  const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
  const notice = (id: string, read: boolean, min: number) => ({
    id, recipient_id: UID, actor_id: null, type: 'partner_nudge', title: `T ${id}`, message: `M ${id}`, payload: {}, read, created_at: ago(min),
  });
  const N1 = 'c1000000-0000-4000-8000-000000000001';
  const N2 = 'c2000000-0000-4000-8000-000000000002';
  const N3 = 'c3000000-0000-4000-8000-000000000003';
  const N4 = 'c4000000-0000-4000-8000-000000000004';
  const tbl = () => server.g('notifications') as any[];
  tbl().push(notice(N1, false, 3), notice(N2, false, 2), notice(N3, true, 1));

  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  const inbox = () => h.s().state.notifications || [];
  const n = (id: string) => inbox().find((x) => x.id === id);
  const row = (id: string) => tbl().find((r) => r.id === id);
  await until(() => inbox().length === 3, 'T32: inbox loaded');
  await until(() => h.s().notificationsStatus === 'ready', 'T32: inbox ready');
  await quiet(1000);

  h.s().markNotificationRead(N1);
  await until(() => n(N1)?.read === true, 'T32: marked read in state');
  await until(() => row(N1)?.read === true, 'T32: mark-read reached the row', 5000);

  fake.fail('notifications', 500, ['PATCH']);
  const toastsBefore = h.toasts.length;
  h.s().markNotificationsRead([N2]);
  await until(() => h.toasts.length > toastsBefore, 'T32: refused mark-read shows a toast');
  await until(() => n(N2)?.read === false, 'T32: refused mark-read goes back to unread', 5000);
  eq(row(N2)?.read, false, 'T32: the refused row stays unread');
  fake.unfail('notifications');

  h.s().markAllNotificationsRead();
  await until(() => inbox().every((x) => x.read), 'T32: all read in state');
  await until(() => tbl().every((r) => r.read === true), 'T32: mark-all-read reached every row', 5000);

  h.s().clearNotifications([N1]);
  await until(() => !n(N1), 'T32: cleared notice gone from state');
  assert((h.s().state.deletedEntityIds || []).includes(N1), 'T32: cleared notice has a tombstone');
  await until(() => !row(N1), 'T32: cleared notice row removed', 5000);

  h.s().clearReadNotifications();
  await until(() => inbox().length === 0, 'T32: clearing the read ones empties the inbox');
  await until(() => tbl().length === 0, 'T32: their rows are removed', 5000);

  tbl().push(notice(N4, false, 0));
  await h.s().refreshNotifications();
  await until(() => n(N4)?.read === false, 'T32: Retry fetched the new notice');
  eq(h.s().notificationsStatus, 'ready', 'T32: inbox ready after Retry');

  await quiet(500);
  const partnerReads = () => fake.requests({ table: 'partnerships', method: 'GET' }).length;
  const readsBefore = partnerReads();
  await h.s().refreshPartners();
  assert(partnerReads() > readsBefore, 'T32: partners Retry reads the partnerships again');
  await until(() => h.s().partnersStatus === 'ready', 'T32: partners ready after Retry');

  const before = h.s().getLeagueData('weekly');
  const custom = h.s().addCustomHabit('HookLeague', 'daily');
  await until(() => h.s().state.habits.some((x) => x.name === 'HookLeague'), 'T32: habit added');
  const habitId = (custom as any)?.id ?? h.s().state.habits.find((x) => x.name === 'HookLeague')!.id;
  h.s().toggleHabit(habitId);
  await until(() => h.s().isHabitDone(h.s().state.habits.find((x) => x.id === habitId)!), 'T32: habit ticked');
  await until(() => h.s().getLeagueData('weekly').userPoints > before.userPoints, 'T32: getLeagueData counts the new points');
  pass('T32 inbox loaded, mark read (saved / refused goes back), mark all, clear one / clear read, Retry, partners Retry, league points recomputed');
});
