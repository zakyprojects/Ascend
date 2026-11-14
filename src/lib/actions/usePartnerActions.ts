// Partner and pact actions of useAppState (invites, partnerships, partner stats, pacts, pact ticks) and
// the linked-pact effect, moved out of store.ts unchanged. The pact refs, pendingPledgeRequests,
// PACT_RETRY_LIMIT, pactRepairReady and linkedPactUserId stay in store.ts and are passed in. useAppState calls
// this hook right after pactRepairReady/linkedPactUserId (where the effect was, so the effect keeps its
// place in the effect order) and returns the same members as before. The effect's comment stays in
// store.ts above pactRepairReady.
import { useCallback, useEffect } from 'react';
import type { AppState, PartnerInvite, Partnership, SharedChallenge, SharedChallengeCategory } from '@/types';
import { isDeviceOffline } from '../store/deviceOffline';
import { todayKey } from '../time/dates';
import { adoptServerInviteId } from '../partners/partnerInvites';
import { applyPledgeToggle, linkedHabitFor, linkedBadHabitFor, badHabitStatusOn, habitDoneOn, planLinkedPactRepairs } from '../partners/pactLifecycle';
import { isPartnershipUser1 } from '../partners/partnershipSide';
import { leagueNow, getSeasonNumber } from '../time/leagueTime';
import { fetchProfileByUidFromSupabase } from '../auth/auth';
import { trustedNow } from '../time/clock';
import { supabase, isSupabaseConfigured, syncBroadcaster, sendPartnerInviteSupabase, fetchProfileByUsernameFromSupabase, fetchMemberCardFromSupabase, fetchPartnerInvitesSupabase, deletePartnershipSupabase, deletePartnerInviteSupabase, declinePartnerInviteSupabase, saveSharedChallengeSupabase, deleteSharedChallengeSupabase, acceptPartnerInviteAtomicSupabase, markNotificationReadSupabase } from '../auth/supabase';
import type { SharedChallengeSaveResult } from '../auth/supabase';
import { ilikeExact } from '../auth/usernameRules';
import type { StoreSetState } from '../store/storeSetState';

export function usePartnerActions(setState: StoreSetState, stateRef: { current: AppState }, state: AppState, trackPledgeWrite: <T>(challengeId: string, write: Promise<T>) => Promise<T>, settlePactSave: (sent: SharedChallenge, result: SharedChallengeSaveResult, isUser1: boolean) => boolean, pledgeWrites: { current: Map<string, { inFlight: number; lastSeq: number; skipped: boolean }> }, pactDiverged: { current: Set<string> }, pactRepairedOn: { current: Map<string, string> }, pactRetry: { current: Map<string, { day: string; failures: number }> }, pactRepairReady: { current: boolean }, linkedPactUserId: string | undefined, pendingPledgeRequests: Set<string>, PACT_RETRY_LIMIT: number) {
  // --- SOCIAL FEATURE 2: ACCOUNTABILITY PARTNER & SHARED CHALLENGES ---
  const sendPartnerInvite = useCallback(
    async (targetUidInput: string) => {
      const trimmedUid = targetUidInput.trim();
      if (!trimmedUid) {
        throw new Error("Enter your partner's ID.");
      }

      if (state.currentUser?.uid && trimmedUid === state.currentUser.uid) {
        throw new Error("You can't send an accountability invite to yourself.");
      }

      // Waiting invites hold a place, so accepting them all can never go over 5.
      const pendingSent = (state.partnerInvites || []).filter(
        (i) =>
          i.status === 'pending' &&
          (i.fromUserId === state.currentUser?.id || i.fromUsername?.toLowerCase() === state.username.toLowerCase())
      ).length;
      if ((state.partnerships || []).length + pendingSent >= 5) {
        throw new Error('You can have 5 partners, waiting invites included. Cancel an invite or remove a partner first.');
      }

      const profileData = await fetchProfileByUidFromSupabase(trimmedUid);

      if (!profileData) {
        throw new Error(`No one has the ID '${trimmedUid}'. Check the 6-digit ID and try again.`);
      }

      // Check if target user accepts partnership invites
      const acceptsInvites = profileData.accept_partner_invites ?? profileData.acceptPartnerInvites ?? true;
      if (!acceptsInvites) {
        throw new Error("This user isn't accepting partner invites right now");
      }

      const targetUserId = profileData.id;
      const targetUsername = profileData.username;

      if (targetUserId === state.currentUser?.id) {
        throw new Error("You can't send an accountability invite to yourself.");
      }

      // 1. Check if target user is ALREADY an active partner with current user (server re-checks)
      const isAlreadyPartnerLocal = (state.partnerships || []).some(
        (p) =>
          p.user1Id === targetUserId ||
          p.user2Id === targetUserId ||
          p.user1Username?.toLowerCase() === targetUsername.toLowerCase() ||
          p.user2Username?.toLowerCase() === targetUsername.toLowerCase()
      );
      if (isAlreadyPartnerLocal) {
        throw new Error(`You are already accountability partners with '${targetUsername}'.`);
      }

      // 2. Check if an invite is already pending between these two users in EITHER direction (local + DB)
      const alreadyPendingLocal = (state.partnerInvites || []).some((i) => {
        if (i.status !== 'pending') return false;
        const matchesTarget =
          i.toUserId === targetUserId ||
          i.toUsername?.toLowerCase() === targetUsername.toLowerCase() ||
          i.fromUserId === targetUserId ||
          i.fromUsername?.toLowerCase() === targetUsername.toLowerCase();
        const matchesCurrent =
          i.toUserId === state.currentUser?.id ||
          i.toUsername?.toLowerCase() === state.username.toLowerCase() ||
          i.fromUserId === state.currentUser?.id ||
          i.fromUsername?.toLowerCase() === state.username.toLowerCase();
        return matchesTarget && matchesCurrent;
      });
      if (alreadyPendingLocal) {
        throw new Error(`An invite between you and '${targetUsername}' is already pending.`);
      }

      // The sender is the signed-in session's user; the server requires exactly that id.
      const fromUserId = isSupabaseConfigured ? (await supabase.auth.getSession()).data.session?.user?.id : undefined;
      if (!fromUserId) {
        throw new Error("Couldn't send the invite. Sign in again and try again.");
      }

      // A failed read is not "none waiting".
      const existingDbInvites = await fetchPartnerInvitesSupabase(fromUserId, state.username);
      if (!existingDbInvites) {
        throw new Error("Couldn't check your invites. Check your connection and try again.");
      }
      const alreadyPendingDb = existingDbInvites.some((i) => {
        if (i.status !== 'pending') return false;
        return (
          i.fromUserId === targetUserId ||
          i.fromUsername?.toLowerCase() === targetUsername.toLowerCase() ||
          i.toUserId === targetUserId ||
          i.toUsername?.toLowerCase() === targetUsername.toLowerCase()
        );
      });
      if (alreadyPendingDb) {
        throw new Error(`An invite between you and '${targetUsername}' is already pending.`);
      }

      const invite: PartnerInvite = {
        id: crypto.randomUUID(),
        fromUserId,
        fromUsername: state.username,
        fromAvatar: state.currentUser?.avatar || '🧑',
        toUserId: targetUserId,
        toUsername: targetUsername,
        status: 'pending',
        createdAt: trustedNow().toISOString(),
      };

      setState(
        (prev) => ({
          ...prev,
          partnerInvites: [invite, ...prev.partnerInvites.filter((i) => i.id !== invite.id)],
        }),
        { immediate: true }
      );

      try {
        const serverId = await sendPartnerInviteSupabase(invite);
        const sent = serverId && serverId !== invite.id ? { ...invite, id: serverId } : invite;
        if (sent !== invite) {
          setState(
            (prev) => ({ ...prev, partnerInvites: adoptServerInviteId(prev.partnerInvites, invite.id, serverId) }),
            { immediate: true }
          );
        }
        // Other tabs hear about the invite only once the server holds it.
        syncBroadcaster.broadcast('PARTNER_INVITE_SENT', { invite: sent });
        return sent;
      } catch (err: any) {
        console.error('Failed to send partner invite to Supabase:', err);
        setState((prev) => ({
          ...prev,
          partnerInvites: prev.partnerInvites.filter((i) => i.id !== invite.id),
        }));
        throw err;
      }
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.username, state.partnerships, state.partnerInvites, state.currentUser]
  );

  const acceptPartnerInvite = useCallback(
    async (inviteId: string) => {
      if ((state.partnerships || []).length >= 5) {
        throw new Error("You've reached the maximum limit of 5 accountability partners. Remove one to accept another.");
      }
      const invite = state.partnerInvites.find((i) => i.id === inviteId);
      let fromId = invite?.fromUserId;
      const fromUsername = invite?.fromUsername || 'Partner';
      let toId = state.currentUser?.id;
      const toUsername = state.username;

      // Ensure both user IDs are canonical profile UUIDs from Supabase
      const isFromUuid = fromId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fromId);
      if (!isFromUuid && isSupabaseConfigured && fromUsername) {
        const { data: p1 } = await supabase.from('profiles').select('id').ilike('username', ilikeExact(fromUsername)).maybeSingle();
        if (p1?.id) fromId = p1.id;
      }
      const isToUuid = toId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(toId);
      if (!isToUuid && isSupabaseConfigured && toUsername) {
        const { data: p2 } = await supabase.from('profiles').select('id').ilike('username', ilikeExact(toUsername)).maybeSingle();
        if (p2?.id) toId = p2.id;
      }

      // Never stand in made-up ids: the local partnership must carry the real user ids.
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!fromId || !toId || !uuidPattern.test(fromId) || !uuidPattern.test(toId)) {
        throw new Error("Couldn't accept this invite. Refresh and try again.");
      }

      const result = await acceptPartnerInviteAtomicSupabase(inviteId, fromId, fromUsername, toId, toUsername);

      if (!result.success) {
        setState((prev) => ({
          ...prev,
          partnerInvites: prev.partnerInvites.filter((i) => i.id !== inviteId),
        }));
        throw new Error(result.error || 'This invite is no longer available');
      }

      const partnership: Partnership = {
        id: result.partnershipId,
        user1Id: fromId,
        user1Username: fromUsername,
        user2Id: toId,
        user2Username: toUsername,
        pairedAt: trustedNow().toISOString(),
      };

      syncBroadcaster.broadcast('PARTNER_ACCEPTED', partnership);

      // The sender's "accepted" notice is sent by accept_partner_invite_atomic.

      // Clear/mark-read the recipient's incoming partner_invite notification so it doesn't linger unread
      const staleNotif = (state.notifications || []).find(
        (n) => n.type === 'partner_invite' && (n.payload?.inviteId === inviteId || n.actorId === fromId)
      );
      if (staleNotif) {
        markNotificationReadSupabase(staleNotif.id).catch(() => {});
      }

      setState(
        (prev) => {
          const removedInviteIds: string[] = [];
          const updatedInvites = (prev.partnerInvites || []).filter((i) => {
            const isFromUser1 = i.fromUserId === fromId || i.fromUsername?.toLowerCase() === fromUsername.toLowerCase();
            const isToUser1 = i.toUserId === fromId || i.toUsername?.toLowerCase() === fromUsername.toLowerCase();
            const isFromUser2 = i.fromUserId === toId || i.fromUsername?.toLowerCase() === toUsername.toLowerCase();
            const isToUser2 = i.toUserId === toId || i.toUsername?.toLowerCase() === toUsername.toLowerCase();

            const isBetweenPair = (isFromUser1 && isToUser2) || (isFromUser2 && isToUser1);
            if (isBetweenPair) {
              removedInviteIds.push(i.id);
              return false;
            }
            return true;
          });
          if (inviteId && !removedInviteIds.includes(inviteId)) {
            removedInviteIds.push(inviteId);
          }
          const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), ...removedInviteIds].slice(-500);
          const updatedPartnerships = [
            partnership,
            ...(prev.partnerships || []).filter((p) => {
              if (p.id === partnership.id) return false;
              const u1 = (p.user1Username || '').toLowerCase();
              const u2 = (p.user2Username || '').toLowerCase();
              const fromLower = fromUsername.toLowerCase();
              const toLower = toUsername.toLowerCase();
              const isBetweenPair =
                ((u1 === fromLower || p.user1Id === fromId) && (u2 === toLower || p.user2Id === toId)) ||
                ((u1 === toLower || p.user1Id === toId) && (u2 === fromLower || p.user2Id === fromId));
              return !isBetweenPair;
            }),
          ];
          return {
            ...prev,
            partnerInvites: updatedInvites,
            partnerships: updatedPartnerships,
            partnership: updatedPartnerships[0] || null,
            deletedEntityIds: updatedDeletedEntityIds,
            notifications: (prev.notifications || []).map((n) =>
              n.type === 'partner_invite' && (n.payload?.inviteId === inviteId || n.actorId === fromId)
                ? { ...n, read: true }
                : n
            ),
          };
        },
        { immediate: true }
      );
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.partnerInvites, state.partnerships, state.notifications, state.currentUser, state.username]
  );

  const cancelPartnerInvite = useCallback(async (inviteId: string) => {
    await deletePartnerInviteSupabase(inviteId);
    syncBroadcaster.broadcast('PARTNER_INVITE_CANCELLED', { inviteId });
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), inviteId].slice(-500);
        return {
          ...prev,
          partnerInvites: prev.partnerInvites.filter((i) => i.id !== inviteId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const declinePartnerInvite = useCallback(async (inviteId: string) => {
    const invite = state.partnerInvites.find((i) => i.id === inviteId);

    const staleNotif = (state.notifications || []).find(
      (n) => n.type === 'partner_invite' && (n.payload?.inviteId === inviteId || (invite && n.actorId === invite.fromUserId))
    );
    if (staleNotif) {
      markNotificationReadSupabase(staleNotif.id).catch(() => {});
    }

    // The server sends the sender's "declined" notice in the same step.
    await declinePartnerInviteSupabase(inviteId);
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), inviteId].slice(-500);
        return {
          ...prev,
          partnerInvites: prev.partnerInvites.filter((i) => i.id !== inviteId),
          deletedEntityIds: updatedDeletedEntityIds,
          notifications: (prev.notifications || []).map((n) =>
            n.type === 'partner_invite' && (n.payload?.inviteId === inviteId || (invite && n.actorId === invite.fromUserId))
              ? { ...n, read: true }
              : n
          ),
        };
      },
      { immediate: true }
    );
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.partnerInvites, state.notifications, state.username, state.currentUser]);

  const endPartnership = useCallback(async (partnershipId?: string) => {
    const targetId = partnershipId || state.partnership?.id || state.partnerships[0]?.id;
    if (!targetId) return;

    // Snapshot partnership and associated challenges for rollback
    const partnershipToEnd = (state.partnerships || []).find((p) => p.id === targetId) || state.partnership;
    const challengesToEnd = (state.sharedChallenges || []).filter((c) => c.partnershipId === targetId);

    // Optimistic UI update
    setState(
      (prev) => {
        const updatedPartnerships = (prev.partnerships || []).filter((p) => p.id !== targetId);
        const removedChallengeIds = prev.sharedChallenges
          .filter((c) => c.partnershipId === targetId)
          .map((c) => c.id);
        const updatedDeletedEntityIds = [
          ...(prev.deletedEntityIds || []),
          targetId,
          ...removedChallengeIds,
        ].slice(-500);

        return {
          ...prev,
          partnerships: updatedPartnerships,
          partnership: updatedPartnerships[0] || null,
          sharedChallenges: prev.sharedChallenges.filter((c) => c.partnershipId !== targetId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );

    try {
      await deletePartnershipSupabase(targetId);
      syncBroadcaster.broadcast('PARTNER_ENDED', { partnershipId: targetId });
    } catch (err: any) {
      console.error('Failed to end partnership in database:', err);
      // Rollback optimistic state immediately
      setState((prev) => {
        const currentIds = new Set((prev.partnerships || []).map((p) => p.id));
        const restoredPartnerships = partnershipToEnd && !currentIds.has(targetId)
          ? [partnershipToEnd, ...(prev.partnerships || [])]
          : prev.partnerships || [];

        const challengeIds = new Set((prev.sharedChallenges || []).map((c) => c.id));
        const restoredChallenges = [
          ...(prev.sharedChallenges || []),
          ...challengesToEnd.filter((c) => !challengeIds.has(c.id)),
        ];

        const rollbackDeletedIds = (prev.deletedEntityIds || []).filter(
          (id) => id !== targetId && !challengesToEnd.some((c) => c.id === id)
        );

        return {
          ...prev,
          partnerships: restoredPartnerships,
          partnership: restoredPartnerships[0] || null,
          sharedChallenges: restoredChallenges,
          deletedEntityIds: rollbackDeletedIds,
        };
      });
      throw err;
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.partnership, state.partnerships, state.sharedChallenges]);

  const getPartnerProfileStats = useCallback(async (partnerUsername: string) => {
    if (!partnerUsername) return null;
    const profile = await fetchProfileByUsernameFromSupabase(partnerUsername);
    if (!profile) return null;
    // Streak and today's habits come from the server's live count (ascend_member_card), so they are
    // right even while the partner hasn't opened the app; the stats they last published are the fallback.
    const fetched = profile.id ? await fetchMemberCardFromSupabase(profile.id) : null;
    const card = fetched?.ok ? fetched.card : undefined;
    const rawStats = profile.stats || {};
    const habitsCompletedCount = rawStats.habitsCompletedCount || 0;
    const habitsCompletedTodayCount = card ? card.today.habitsDone : rawStats.habitsCompletedTodayCount || 0;
    const streakDays = card ? card.streak.days : rawStats.streakDays || 0;
    const currentStreakDays = card ? card.streak.days : rawStats.currentStreakDays ?? rawStats.streakDays ?? 0;
    const currentStreakCategory = card ? card.streak.category : rawStats.currentStreakCategory ?? rawStats.streakSource ?? '';
    const currentStreakIsActive = card ? true : rawStats.currentStreakIsActive !== undefined
      ? rawStats.currentStreakIsActive
      : true;
    const bestStreakDays = rawStats.bestStreakDays ?? rawStats.streakDays ?? 0;
    const bestStreakCategory = rawStats.bestStreakCategory ?? rawStats.streakSource ?? '';

    // The server derives season_points for the running season (refreshed at every season start).
    const computedSeasonPts = typeof profile.season_points === 'number' ? profile.season_points : 0;
    const activeSeasonNumber = getSeasonNumber(leagueNow());

    return {
      totalPoints: profile.total_points || 0,
      seasonPoints: computedSeasonPts,
      seasonId: activeSeasonNumber,
      season_id: activeSeasonNumber,
      season_points: computedSeasonPts,
      stats: {
        ...rawStats,
        streakDays,
        streakSource: card ? (card.streak.days > 0 ? card.streak.category : undefined) : rawStats.streakSource,
        currentStreakDays,
        currentStreakCategory,
        currentStreakIsActive,
        bestStreakDays,
        bestStreakCategory,
        habitsCompletedCount,
        habitsCompletedTodayCount,
      },
      avatar: profile.avatar || '🧑',
      isProfilePublic: profile.is_profile_public ?? true,
    };
  }, []);

  const createSharedChallenge = useCallback(
    async (
      title: string,
      durationDays: number,
      user1Category: SharedChallengeCategory = 'habit',
      user1Target: string = '',
      user2Category: SharedChallengeCategory = 'habit',
      user2Target: string = '',
      targetPartnershipId?: string,
      /** A running challenge this one replaces ("Start again from today"): its name may be reused. */
      replacesChallengeId?: string
    ) => {
      const pId = targetPartnershipId || state.partnership?.id || state.partnerships[0]?.id;
      if (!pId) {
        throw new Error('No active partnership found.');
      }

      const trimmedTitle = title.trim();
      const normTitle = trimmedTitle.toLowerCase();

      if (!trimmedTitle) {
        throw new Error('Write what you will do every day.');
      }

      // Prevent duplicate creation if an active challenge with the same title already exists on this partnership
      const existingActive = (state.sharedChallenges || []).find(
        (c) =>
          c &&
          c.partnershipId === pId &&
          c.status === 'active' &&
          c.id !== replacesChallengeId &&
          (c.title || '').trim().toLowerCase() === normTitle
      );
      if (existingActive) {
        throw new Error(
          `You already have a running challenge "${existingActive.title}" with this partner.`
        );
      }

      const challenge: SharedChallenge = {
        id: crypto.randomUUID(),
        partnershipId: pId,
        title: trimmedTitle,
        targetHabitName: user1Target || trimmedTitle,
        durationDays,
        jointStreak: 0,
        totalJointDaysCompleted: 0,
        lastJointCompletionDate: undefined,
        user1Category,
        user1Target: user1Target.trim(),
        user2Category,
        user2Target: user2Target.trim(),
        status: 'active',
        createdAt: trustedNow().toISOString(),
      };

      // Your goal is one of your habits and it is already done today: the pact starts with today
      // ticked. The server starts every pact empty, so today goes in with a second save (the same
      // own-side, own-today rule as any tick). Both saves count as one pact write, so the server's
      // empty first copy (realtime, poll) never shows in between.
      const latest = stateRef.current;
      const creatorPartnership =
        (latest.partnerships || []).find((p) => p.id === pId) || (latest.partnership?.id === pId ? latest.partnership : null);
      const isUser1 = creatorPartnership
        ? isPartnershipUser1(creatorPartnership, latest.currentUser?.id, latest.username)
        : true;
      const linkedHabit = linkedHabitFor(challenge, isUser1, latest.habits || []);
      // A resist challenge starts ticked when its bad habit is already logged Resisted today.
      const linkedBadHabit = linkedBadHabitFor(challenge, isUser1, latest.badHabits || []);
      const startsTicked = linkedHabit
        ? habitDoneOn(linkedHabit)
        : Boolean(linkedBadHabit && badHabitStatusOn(linkedBadHabit.id, latest.badHabitLogs || [], todayKey()) === 'resisted');
      const shown = startsTicked ? applyPledgeToggle(challenge, isUser1, true).updated : challenge;

      // Optimistically update local UI state
      setState((prev) => ({
        ...prev,
        sharedChallenges: [shown, ...prev.sharedChallenges],
      }));

      let todayTickFailed = false;
      let notStartedForMe = false;
      let todayTickResult: SharedChallengeSaveResult | null = null;
      try {
        await trackPledgeWrite(
          challenge.id,
          (async () => {
            const created = await saveSharedChallengeSupabase(challenge);
            // The server's shared start date (day 1 for both partners) goes on screen at once.
            const startDate = created.stored?.startDate;
            if (startDate) {
              setState((prev) => ({
                ...prev,
                sharedChallenges: prev.sharedChallenges.map((c) => (c.id === challenge.id ? { ...c, startDate } : c)),
              }));
            }
            if (!startsTicked) return;
            // Day 1 is still to come for me (my partner is ahead in time): today can't be ticked.
            if (startDate && startDate > todayKey()) {
              notStartedForMe = true;
              return;
            }
            try {
              todayTickResult = await saveSharedChallengeSupabase(shown);
            } catch (err) {
              console.error("Failed to save today's tick on a new joint pact:", err);
              todayTickFailed = true;
            }
          })()
        );
      } catch (err: any) {
        console.error('Failed to create joint pact in Supabase:', err);
        // Rollback only this specific challenge object by ID
        setState((prev) => ({
          ...prev,
          sharedChallenges: (prev.sharedChallenges || []).filter((c) => c.id !== challenge.id),
        }));
        throw err;
      }

      if (notStartedForMe) {
        // The optimistic tick goes back quietly: the card says the challenge starts tomorrow.
        setState((prev) => ({
          ...prev,
          sharedChallenges: prev.sharedChallenges.map((c) =>
            c.id === challenge.id ? applyPledgeToggle(c, isUser1, false).updated : c
          ),
        }));
        syncBroadcaster.broadcast('CHALLENGE_UPDATED', challenge);
        return { startedTicked: false, todayTickFailed: false };
      }

      if (todayTickFailed) {
        // The pact exists; only today's tick goes back (the linked-pact pass tries it again).
        setState((prev) => ({
          ...prev,
          sharedChallenges: prev.sharedChallenges.map((c) =>
            c.id === challenge.id ? applyPledgeToggle(c, isUser1, false).updated : c
          ),
        }));
        syncBroadcaster.broadcast('CHALLENGE_UPDATED', challenge);
        return { startedTicked: false, todayTickFailed };
      }
      syncBroadcaster.broadcast('CHALLENGE_UPDATED', shown);
      // A tick the server left out (another day than the account's) goes back with its own toast.
      const tickRefused = todayTickResult !== null && settlePactSave(shown, todayTickResult, isUser1);
      return { startedTicked: startsTicked && !tickRefused, todayTickFailed };
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.partnership, state.partnerships, state.sharedChallenges]
  );

  const deleteSharedChallenge = useCallback(async (challengeId: string) => {
    const challengeToDelete = (state.sharedChallenges || []).find((c) => c.id === challengeId);

    // Optimistically update local UI state
    setState(
      (prev) => {
        const updatedDeletedEntityIds = [...(prev.deletedEntityIds || []), challengeId].slice(-500);
        return {
          ...prev,
          sharedChallenges: prev.sharedChallenges.filter((c) => c.id !== challengeId),
          deletedEntityIds: updatedDeletedEntityIds,
        };
      },
      { immediate: true }
    );

    try {
      await deleteSharedChallengeSupabase(challengeId);
      syncBroadcaster.broadcast('CHALLENGE_DELETED', { challengeId });
    } catch (err: any) {
      console.error('Failed to delete shared challenge in Supabase:', err);
      // Rollback only this specific challenge back into the list if partnership still exists
      if (challengeToDelete) {
        setState((prev) => {
          const partnershipExists = (prev.partnerships || []).some(
            (p) => p.id === challengeToDelete.partnershipId
          ) || prev.partnership?.id === challengeToDelete.partnershipId;

          if (!partnershipExists) {
            return prev;
          }

          return {
            ...prev,
            sharedChallenges: prev.sharedChallenges.some((c) => c.id === challengeId)
              ? prev.sharedChallenges
              : [challengeToDelete, ...prev.sharedChallenges],
            deletedEntityIds: (prev.deletedEntityIds || []).filter((id) => id !== challengeId),
          };
        });
      }
      throw err;
    }
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sharedChallenges]);

  const logSharedChallengeHabit = useCallback(
    async (challengeId: string, forcedState?: boolean) => {
      if (pendingPledgeRequests.has(challengeId)) {
        return;
      }
      pendingPledgeRequests.add(challengeId);

      const today = todayKey();

      const idx = state.sharedChallenges.findIndex((c) => c.id === challengeId);
      if (idx === -1) {
        pendingPledgeRequests.delete(challengeId);
        return;
      }
      const target = state.sharedChallenges[idx];
      const previousChallenge = target;
      // A finished pact takes no more ticks.
      if (target.status !== 'active') {
        pendingPledgeRequests.delete(challengeId);
        return;
      }

      const challengePartnership =
        (state.partnerships || []).find((p) => p.id === target.partnershipId) || state.partnership;

      const isUser1 = challengePartnership
        ? isPartnershipUser1(challengePartnership, state.currentUser?.id, state.username)
        : true;

      const myDoneDates = isUser1
        ? (target.user1DoneDates || (target.user1DoneDate ? [target.user1DoneDate] : []))
        : (target.user2DoneDates || (target.user2DoneDate ? [target.user2DoneDate] : []));

      let isDoneToday: boolean;
      if (typeof forcedState === 'boolean') {
        isDoneToday = forcedState;
      } else {
        isDoneToday = !myDoneDates.includes(today);
      }

      const { updated } = applyPledgeToggle(target, isUser1, isDoneToday);

      // Optimistically update local UI state targeting only this challenge
      setState((prev) => ({
        ...prev,
        sharedChallenges: prev.sharedChallenges.map((c) => (c.id === challengeId ? updated : c)),
      }));

      try {
        const result = await trackPledgeWrite(challengeId, saveSharedChallengeSupabase(updated));
        syncBroadcaster.broadcast('CHALLENGE_UPDATED', updated);
        settlePactSave(updated, result, isUser1);
        // The partner's notices come from the server (shared_challenges trigger).
      } catch (err: any) {
        console.error('Failed to log shared challenge day in Supabase:', err);
        // Rollback only this specific challenge object by ID
        setState((prev) => ({
          ...prev,
          sharedChallenges: prev.sharedChallenges.map((c) => (c.id === challengeId ? previousChallenge : c)),
        }));
        throw err;
      } finally {
        pendingPledgeRequests.delete(challengeId);
      }
    },
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.sharedChallenges, state.partnerships, state.partnership, state.currentUser, state.username]
  );

  useEffect(() => {
    if (!linkedPactUserId || !isSupabaseConfigured) return;
    const run = () => {
      if (!pactRepairReady.current || isDeviceOffline()) return;
      const current = stateRef.current;
      if (current.currentUser?.id !== linkedPactUserId) return;
      const today = todayKey();
      for (const [id, entry] of pactRetry.current) {
        if (entry.day !== today || entry.failures >= PACT_RETRY_LIMIT) pactRetry.current.delete(id);
      }
      const { repairs, diverged } = planLinkedPactRepairs({
        challenges: current.sharedChallenges || [],
        habits: current.habits || [],
        badHabits: current.badHabits || [],
        badHabitLogs: current.badHabitLogs || [],
        sideOf: (c) => {
          const partnership =
            (current.partnerships || []).find((p) => p.id === c.partnershipId) ||
            (current.partnership?.id === c.partnershipId ? current.partnership : null);
          return partnership ? isPartnershipUser1(partnership, current.currentUser?.id, current.username) : null;
        },
        today,
        isBusy: (id) => (pledgeWrites.current.get(id)?.inFlight ?? 0) > 0 || pendingPledgeRequests.has(id),
        divergedBefore: pactDiverged.current,
        attemptedOn: pactRepairedOn.current,
        retry: new Set(pactRetry.current.keys()),
      });
      pactDiverged.current = diverged;
      for (const { challenge, isUser1, done, isRetry } of repairs) {
        if (!isRetry) pactRepairedOn.current.set(challenge.id, today);
        const { updated } = applyPledgeToggle(challenge, isUser1, done);
        setState((prev) => ({
          ...prev,
          sharedChallenges: prev.sharedChallenges.map((c) => (c.id === challenge.id ? updated : c)),
        }));
        trackPledgeWrite(challenge.id, saveSharedChallengeSupabase(updated)).then(
          (result) => {
            pactRetry.current.delete(challenge.id);
            syncBroadcaster.broadcast('CHALLENGE_UPDATED', updated);
            // A day the server left out is not sent again today (a retry marks the day too).
            if (settlePactSave(updated, result, isUser1)) pactRepairedOn.current.set(challenge.id, today);
          },
          (err) => {
            console.error('Failed to bring a linked pact in step with its habit:', err);
            const entry = pactRetry.current.get(challenge.id);
            pactRetry.current.set(challenge.id, {
              day: today,
              failures: (entry?.day === today ? entry.failures : 0) + 1,
            });
          }
        );
      }
    };
    const timer = window.setInterval(run, 60_000);
    return () => window.clearInterval(timer);
    // False positive: setState/trackPledgeWrite are stable; everything else is read from refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedPactUserId]);

  return {
    sendPartnerInvite,
    acceptPartnerInvite,
    cancelPartnerInvite,
    declinePartnerInvite,
    endPartnership,
    getPartnerProfileStats,
    createSharedChallenge,
    logSharedChallengeHabit,
    deleteSharedChallenge,
  };
}
