// Hook test (real useAppState + in-process fake Supabase, see harness/): the partner and pact actions
// of a signed-in account. Written for C2 (moving the partner/pact actions out of useAppState).
//   T31  partners load from the server; the linked-pact pass (minute timer) ticks a pact whose habit is
//        done today once the server data is in; a pact tick is saved, a second tap while the first
//        save runs sends nothing; ticking again unticks; a new pact is saved (the same name twice is
//        refused) and deleting it leaves a tombstone and removes the row; an invite is sent once,
//        then cancelled; an incoming invite is declined; another is accepted (new partnership), and
//        ending that partnership removes it; a partner's profile stats come from the server.
// The fake has no partner RPCs and ignores PostgREST `or` filters, so this file answers the partner
// RPCs and the two `or` reads (partnerships, partner_invites) from FakeServer's tables itself.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { bootHook, story, until, quiet, eq, assert, pass, server, fake, UID, habit, seedServerHabits } from './harness/bootHook';

const blobAt = 'Sun 2026-11-01 5:00 AM PKT (UTC+05:00)';
const PARTNER = '22222222-2222-4222-8222-222222222222';
const PAL2 = '44444444-4444-4444-8444-444444444444';
const PAL3 = '77777777-7777-4777-8777-777777777777';
const PS1 = '88888888-8888-4888-8888-888888888888';
const PS2 = '99999999-9999-4999-8999-999999999999';
const PACT = '55555555-5555-4555-8555-555555555555';

const tbl = (t: string) => server.g(t) as any[];
const drop = (t: string, keep: (r: any) => boolean) => server.generic.set(t, tbl(t).filter(keep));
const rpcCalls: string[] = [];
function rpc(fn: string, a: any): unknown {
  if (fn === 'get_profile_by_uid') return tbl('profiles').filter((p) => p.uid === a.target_uid);
  if (fn === 'ascend_member_profiles') return tbl('profiles').filter((p) => p.username === a.p_username);
  if (fn === 'send_partner_invite_atomic') {
    tbl('partner_invites').push({
      id: a.p_invite_id, from_user_id: a.p_from_user_id, from_username: a.p_from_username, from_avatar: a.p_from_avatar,
      to_user_id: a.p_to_user_id, to_username: a.p_to_username, status: 'pending', created_at: blobAt,
    });
    return { success: true, invite_id: a.p_invite_id };
  }
  if (fn === 'decline_partner_invite_atomic') {
    drop('partner_invites', (r) => r.id !== a.p_invite_id);
    return { success: true };
  }
  if (fn === 'accept_partner_invite_atomic') {
    drop('partner_invites', (r) => r.id !== a.p_invite_id);
    tbl('partnerships').push({ id: PS2, user1_id: a.p_user1_id, user1_username: a.p_user1_username, user2_id: a.p_user2_id, user2_username: a.p_user2_username, paired_at: blobAt });
    return { success: true, partnership_id: PS2 };
  }
  if (fn === 'end_partnership_atomic') {
    drop('partnerships', (r) => r.id !== a.p_partnership_id);
    drop('shared_challenges', (r) => r.partnership_id !== a.p_partnership_id);
    return { success: true };
  }
  if (fn === 'delete_shared_challenge_atomic') {
    drop('shared_challenges', (r) => r.id !== a.p_challenge_id);
    return { success: true };
  }
  return undefined;
}
const base = globalThis.fetch;
const answer = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
(globalThis as any).fetch = async (input: any, init?: any) => {
  const req = input instanceof Request ? input : new Request(input, init);
  const url = new URL(req.url);
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const fn = url.pathname.slice('/rest/v1/rpc/'.length);
    const args = req.method === 'POST' ? await req.clone().json().catch(() => ({})) : {};
    const out = rpc(fn, args);
    if (out !== undefined) {
      rpcCalls.push(fn);
      return answer(out);
    }
  }
  if (req.method === 'GET' && url.searchParams.has('or')) {
    if (url.pathname === '/rest/v1/partnerships') return answer(tbl('partnerships').filter((r) => r.user1_id === UID || r.user2_id === UID));
    if (url.pathname === '/rest/v1/partner_invites') return answer(tbl('partner_invites').filter((r) => r.to_user_id === UID || r.from_user_id === UID));
  }
  return base(req);
};

await story('partners.hook (partner and pact actions)', async () => {
  const { todayKey } = await import('../dates');
  const today = todayKey();
  server.blob.set(UID, { state: { username: 'hooktester', lastSeenRelease: 100 }, updated_at: blobAt });
  tbl('profiles').push(
    { id: PARTNER, uid: '222222', username: 'hookpartner', avatar: '🦊', total_points: 42, season_points: 7, stats: {}, is_profile_public: true, accept_partner_invites: true },
    { id: PAL2, uid: '444444', username: 'hookpal2', avatar: '🐼', is_profile_public: true, accept_partner_invites: true },
    { id: PAL3, uid: '777777', username: 'hookpal3', avatar: '🐯', is_profile_public: true, accept_partner_invites: true }
  );
  tbl('partnerships').push({ id: PS1, user1_id: UID, user1_username: 'hooktester', user2_id: PARTNER, user2_username: 'hookpartner', paired_at: blobAt });
  // eslint-disable-next-line no-restricted-syntax -- the pact starts now, so it is running today
  const startedAt = new Date().toISOString();
  tbl('shared_challenges').push({
    id: PACT, partnership_id: PS1, title: 'Walk daily', target_habit_name: 'HookWalk', duration_days: 7, joint_streak: 0,
    total_joint_days_completed: 0, user1_category: 'habit', user1_target: 'HookWalk', user2_category: 'habit', user2_target: 'Other',
    user1_done_dates: [], user2_done_dates: [], status: 'active', created_at: startedAt,
  });
  // The pact's habit is already done today (ticked on another device): the linked-pact pass catches up.
  seedServerHabits(habit('h-walk', 'HookWalk', { completions: { [today]: { done: true } } }));

  const h = await bootHook({ as: 'signedIn' });
  await until(h.loaded, 'signed-in boot loaded');
  await until(() => h.s().partnersStatus === 'ready', 'T31: partners loaded');
  await until(() => h.s().state.partnerships.some((p) => p.id === PS1), 'T31: partnership on screen');
  await until(() => h.s().state.sharedChallenges.some((c) => c.id === PACT), 'T31: pact on screen');
  await until(() => h.s().state.habits.some((x) => x.id === 'h-walk'), 'T31: linked habit loaded');
  await quiet(1500);

  const pact = (id = PACT) => h.s().state.sharedChallenges.find((c) => c.id === id);
  const pactDone = () => (pact()?.user1DoneDates || []).includes(today);
  const rowDone = () => tbl('shared_challenges').some((r) => r.id === PACT && (r.user1_done_dates || []).includes(today));
  assert(!pactDone(), 'T31: the pact starts unticked');

  // Linked-pact pass (minute timer): a difference seen on two passes in a row is brought in step.
  h.intervals.fire(60000);
  await quiet(300);
  h.intervals.fire(60000);
  await until(pactDone, 'T31: the linked-pact pass ticked the pact');
  await until(rowDone, 'T31: the linked-pact tick reached shared_challenges', 5000);

  // Manual tick: one save even when tapped twice at once; it toggles.
  await quiet(1000);
  const saves = () => fake.requests({ table: 'rpc/save_shared_challenge_atomic' }).length;
  const before = saves();
  await Promise.all([h.s().logSharedChallengeHabit(PACT), h.s().logSharedChallengeHabit(PACT)]);
  await until(() => !pactDone(), 'T31: a tap unticks the pact');
  await until(() => !rowDone(), 'T31: the untick reached shared_challenges', 5000);
  await quiet(500);
  eq(saves() - before, 1, 'T31: two taps at once send one save');
  await h.s().logSharedChallengeHabit(PACT);
  await until(pactDone, 'T31: tapping again ticks the pact');
  await until(rowDone, 'T31: the tick reached shared_challenges', 5000);

  // A new pact, the same name refused, then deleted.
  await h.s().createSharedChallenge('HookPact2', 7, 'habit', 'Other', 'habit', 'Other', PS1);
  const pact2 = () => h.s().state.sharedChallenges.find((c) => c.title === 'HookPact2');
  await until(pact2, 'T31: new pact in state');
  const pact2Id = pact2()!.id;
  await until(() => tbl('shared_challenges').some((r) => r.id === pact2Id), 'T31: new pact reached shared_challenges', 5000);
  await quiet(500);
  let refused = '';
  await h.s().createSharedChallenge('hookpact2', 7, 'habit', 'Other', 'habit', 'Other', PS1).catch((e: Error) => (refused = e.message));
  assert(refused.includes('already have a running challenge'), `T31: the same pact name is refused (got ${JSON.stringify(refused)})`);
  await h.s().deleteSharedChallenge(pact2Id);
  await until(() => !pact2(), 'T31: deleted pact gone from state');
  assert((h.s().state.deletedEntityIds || []).includes(pact2Id), 'T31: deleted pact has a tombstone');
  assert(!tbl('shared_challenges').some((r) => r.id === pact2Id), 'T31: deleted pact row removed');

  // Invite sent once, then cancelled.
  const sent = await h.s().sendPartnerInvite('444444');
  assert(sent, 'T31: invite sent');
  await until(() => h.s().state.partnerInvites.some((i) => i.id === sent.id && i.toUserId === PAL2), 'T31: invite in state');
  assert(tbl('partner_invites').some((r) => r.id === sent.id), 'T31: invite reached the server');
  await quiet(500);
  let twice = '';
  await h.s().sendPartnerInvite('444444').catch((e: Error) => (twice = e.message));
  assert(twice.includes('already pending'), `T31: a second invite to the same person is refused (got ${JSON.stringify(twice)})`);
  await h.s().cancelPartnerInvite(sent.id);
  await until(() => !h.s().state.partnerInvites.some((i) => i.id === sent.id), 'T31: cancelled invite gone from state');
  assert((h.s().state.deletedEntityIds || []).includes(sent.id), 'T31: cancelled invite has a tombstone');
  assert(!tbl('partner_invites').some((r) => r.id === sent.id), 'T31: cancelled invite row removed');

  // Incoming invites: one declined, one accepted.
  const incoming = (id: string, fromId: string, fromName: string) => ({
    id, from_user_id: fromId, from_username: fromName, from_avatar: '🐯', to_user_id: UID, to_username: 'hooktester', status: 'pending', created_at: blobAt,
  });
  const INV3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  tbl('partner_invites').push(incoming(INV3, PAL3, 'hookpal3'));
  await h.s().refreshPartners();
  await until(() => h.s().state.partnerInvites.some((i) => i.id === INV3), 'T31: incoming invite on screen');
  await h.s().declinePartnerInvite(INV3);
  await until(() => !h.s().state.partnerInvites.some((i) => i.id === INV3), 'T31: declined invite gone from state');
  assert((h.s().state.deletedEntityIds || []).includes(INV3), 'T31: declined invite has a tombstone');
  assert(!tbl('partner_invites').some((r) => r.id === INV3), 'T31: declined invite row removed');
  assert(rpcCalls.includes('decline_partner_invite_atomic'), 'T31: decline went to the server');

  const INV2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  tbl('partner_invites').push(incoming(INV2, PAL2, 'hookpal2'));
  await h.s().refreshPartners();
  await until(() => h.s().state.partnerInvites.some((i) => i.id === INV2), 'T31: second incoming invite on screen');
  await h.s().acceptPartnerInvite(INV2);
  await until(() => h.s().state.partnerships.some((p) => p.id === PS2 && p.user1Id === PAL2 && p.user2Id === UID), 'T31: accepted partnership in state');
  await until(() => !h.s().state.partnerInvites.some((i) => i.id === INV2), 'T31: accepted invite gone from state');
  assert(tbl('partnerships').some((r) => r.id === PS2), 'T31: accepted partnership on the server');
  await quiet(500);
  await h.s().endPartnership(PS2);
  await until(() => !h.s().state.partnerships.some((p) => p.id === PS2), 'T31: ended partnership gone from state');
  assert((h.s().state.deletedEntityIds || []).includes(PS2), 'T31: ended partnership has a tombstone');
  assert(!tbl('partnerships').some((r) => r.id === PS2), 'T31: ended partnership removed on the server');
  assert(h.s().state.partnerships.some((p) => p.id === PS1), 'T31: the other partnership stays');

  // Partner profile stats.
  const stats = await h.s().getPartnerProfileStats('hookpartner');
  eq([stats?.totalPoints, stats?.seasonPoints, stats?.avatar], [42, 7, '🦊'], 'T31: partner stats from the server');
  pass('T31 partners loaded, linked-pact pass, pact tick (one save per double tap), pact create/refuse/delete, invite send/cancel, decline, accept, end, partner stats');
});
