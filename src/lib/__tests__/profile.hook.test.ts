// Hook test (real useAppState + in-process fake Supabase, see harness/): the profile and settings
// actions of a signed-in account. Written for C2 (moving them out of useAppState).
//   T26  a new username and avatar are in state and the username reaches the account blob; a
//        username change keeps its change stamp; the theme pick is saved on the device and in the
//        account, and the theme switch reads the current pick (light -> dark -> light); the rank-up
//        and release-note marks are kept; the privacy and notification switches reach the profile
//        row; a failed profile write puts the switch back and says so.
import { bootHook, story, until, quiet, eq, assert, pass, server, fake, UID } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';
const changedAt = 'Tue 2026-11-10 10:00 AM PKT (UTC+05:00)';

await story('profile.hook (profile and settings actions)', async () => {
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });
  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await quiet(1500);
  const me = () => h.s().state.currentUser!;
  const blob = () => server.blob.get(UID)?.state ?? {};
  const profile = () => server.g('profiles').find((p: { id: string }) => p.id === UID);

  h.s().setUsername('HookName');
  await until(() => h.s().state.username === 'HookName' && me().username === 'HookName', 'T26: username in state');
  await until(() => blob().username === 'HookName', 'T26: username reached the account blob', 5000);

  h.s().updateProfileUsername('HookName2', changedAt);
  await until(() => me().username === 'HookName2', 'T26: changed username in state');
  eq(me().lastUsernameChangeAt, changedAt, 'T26: the username change keeps its change stamp');
  h.s().updateProfileAvatar('🦊');
  await until(() => me().avatar === '🦊', 'T26: avatar in state');

  // The device follows dark here (matchMedia never matches light), so 'light' is a real pick.
  h.s().setThemePreference('light');
  await until(() => h.s().state.themePreference === 'light', 'T26: theme pick in state');
  assert(!!h.s().state.themeUpdatedAt, 'T26: the theme pick is stamped');
  eq(h.storage.getItem('ascend_theme'), 'light', 'T26: the theme pick is saved on the device');
  await until(() => blob().themePreference === 'light', 'T26: theme pick reached the account blob', 5000);
  h.s().toggleThemePreference();
  await until(() => h.s().state.themePreference === 'dark', 'T26: the theme switch reads the current pick (light -> dark)');
  h.s().toggleThemePreference();
  await until(() => h.s().state.themePreference === 'light', 'T26: the theme switch reads the current pick (dark -> light)');

  h.s().setRankCelebrated({ season: 999, tierIndex: 1 });
  await until(() => h.s().state.rankCelebrated?.season === 999, 'T26: rank-up mark in state');
  h.s().setLastSeenRelease(105);
  await until(() => h.s().state.lastSeenRelease === 105, 'T26: release-note mark in state');

  await h.s().toggleProfilePrivacy();
  await until(() => me().isProfilePublic === false, 'T26: privacy switch off in state');
  eq(profile()?.is_profile_public, false, 'T26: privacy switch reached the profile row');
  await h.s().toggleNotificationPreference('notifDailyReminder');
  await until(() => me().notifDailyReminder === false, 'T26: notification switch off in state');
  eq(profile()?.notif_daily_reminder, false, 'T26: notification switch reached the profile row');

  fake.fail('profiles', 500, ['PATCH']);
  const toastsBefore = h.toasts.length;
  await h.s().toggleAcceptPartnerInvites();
  fake.unfail('profiles');
  await until(() => (me().acceptPartnerInvites ?? true) === true, 'T26: a failed profile write puts the switch back');
  await quiet(1500);
  eq(me().acceptPartnerInvites ?? true, true, 'T26: the switch stays back after the failed write');
  eq(profile()?.accept_partner_invites, true, 'T26: the failed write changed nothing on the profile row');
  assert(
    h.toasts.slice(toastsBefore).some((t) => t.kind === 'error' && t.title === "Couldn't change this setting"),
    'T26: a failed profile write says so'
  );
  pass('T26 profile, theme, marks and profile switches saved; a failed switch goes back');
});
