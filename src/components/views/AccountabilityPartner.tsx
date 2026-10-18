import { useState, useEffect, useMemo, useCallback } from 'react';
import { Check, Clock, Flame, Plus, RotateCcw, Trash2, UserPlus, UserMinus, Users, WifiOff, Zap } from 'lucide-react';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { useAsyncAction, useAsyncActionKey } from '@/lib/useAsyncAction';
import { AppStore } from '@/lib/store';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { TierBadge } from '@/components/ui/TierBadge';
import { useToast } from '@/components/ui/Toast';
import { Button, Dialog, Disclosure, EmptyState, Form, Input, Skeleton, Switch, Tabs, useFormController } from '@/components/ui/primitives';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { PageHero } from '@/components/ui/PageHero';
import { TAP_TARGET, cx } from '@/components/ui/primitives/shared';
import { leagueNow } from '@/lib/leagueTime';
import { getProfileSeasonPointsByUsername } from '@/lib/auth';
import { isPartnershipUser1 } from '@/lib/partnershipSide';
import { calculateElapsedDays } from '@/lib/dates';
import { useLocalDayKey } from '@/lib/useLocalDayKey';
import { ptUnit, ptsText } from '@/lib/leagues';
import { createNotificationSupabase } from '@/lib/supabase';
import { calculateUnifiedStreak } from '@/lib/streakLogic';
import { toUserMessage } from '@/lib/userMessage';
import { sameName } from '@/lib/uniqueNames';
import { Partnership, SharedChallenge, PartnerInvite } from '@/types';
import { actionFeedback } from '@/lib/actionFeedback';

const EMPTY_PARTNERSHIPS: Partnership[] = [];
const EMPTY_INVITES: PartnerInvite[] = [];
const EMPTY_CHALLENGES: SharedChallenge[] = [];

const MAX_PARTNERS = 5;
const LENGTH_OPTIONS = [7, 14, 30];
// One nudge per partner per day (partnerKey -> dateKey of the last nudge, this device).
const NUDGE_STORAGE_KEY = 'ascend_partner_nudged_on';

function doneDates(c: SharedChallenge, user1: boolean): string[] {
  return user1
    ? c.user1DoneDates || (c.user1DoneDate ? [c.user1DoneDate] : [])
    : c.user2DoneDates || (c.user2DoneDate ? [c.user2DoneDate] : []);
}

function goalOf(c: SharedChallenge, user1: boolean): string {
  return (user1 ? c.user1Target : c.user2Target) || c.targetHabitName || c.title;
}

function initial(name: string | null | undefined): string {
  return (name || '?').charAt(0).toUpperCase();
}

export function AccountabilityPartner({ store }: { store: AppStore }) {
  const { showSuccessToast, showInfoToast, showErrorToast } = useToast();
  const { isLoading: isStatsLoading, executeFn: executeStatsFetch } = useAsyncAction();
  const { isLoading: isSubmittingInvite, executeFn: executeSendInvite } = useAsyncAction();
  const { isLoading: isSubmittingChallenge, executeFn: executeCreateChallenge } = useAsyncAction();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [challengeModalOpen, setChallengeModalOpen] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [challengeToDelete, setChallengeToDelete] = useState<SharedChallenge | null>(null);
  const [inviteToCancel, setInviteToCancel] = useState<PartnerInvite | null>(null);

  const [partnerUidInput, setPartnerUidInput] = useState('');

  // New challenge form
  const [myGoal, setMyGoal] = useState('');
  const [differentGoal, setDifferentGoal] = useState(false);
  const [partnerGoal, setPartnerGoal] = useState('');
  const [lengthDays, setLengthDays] = useState(14);

  const [nudgedOn, setNudgedOn] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(NUDGE_STORAGE_KEY) || '{}') || {};
    } catch {
      return {};
    }
  });

  const currentUser = store.state.currentUser;
  const currentUsername = store.state.username;
  // Follows local midnight: ticks, "done today" and the once-a-day nudge roll over without a reload.
  const today = useLocalDayKey();

  const rawPartnerships = store.state.partnerships;
  const singlePartnership = store.state.partnership;
  const partnerships = useMemo(() => {
    const list = rawPartnerships || (singlePartnership ? [singlePartnership] : EMPTY_PARTNERSHIPS);
    const map = new Map<string, Partnership>();
    for (const p of list) {
      if (!p) continue;
      const isU1 = isPartnershipUser1(p, currentUser?.id, currentUsername);
      const partnerName = (isU1 ? p.user2Username : p.user1Username).toLowerCase();
      const key = (isU1 ? p.user2Id : p.user1Id) || partnerName || p.id;
      if (!map.has(key)) map.set(key, p);
    }
    return Array.from(map.values());
  }, [rawPartnerships, singlePartnership, currentUsername, currentUser?.id]);

  const partnerInvites = store.state.partnerInvites || EMPTY_INVITES;
  const sharedChallenges = store.state.sharedChallenges || EMPTY_CHALLENGES;

  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  useEffect(() => {
    if (partnerships.length === 0) {
      setSelectedPartnerId(null);
    } else if (!selectedPartnerId || !partnerships.some((p) => p.id === selectedPartnerId)) {
      setSelectedPartnerId(partnerships[0].id);
    }
  }, [partnerships, selectedPartnerId]);

  const activePartnership: Partnership | null =
    partnerships.find((p) => p.id === selectedPartnerId) || partnerships[0] || null;
  const amUser1 = activePartnership ? isPartnershipUser1(activePartnership, currentUser?.id, currentUsername) : true;
  const partnerName = activePartnership ? (amUser1 ? activePartnership.user2Username : activePartnership.user1Username) : null;
  const partnerUserId = activePartnership ? (amUser1 ? activePartnership.user2Id : activePartnership.user1Id) : null;

  // Partner's published season points + streak
  const [partnerStats, setPartnerStats] = useState<{ seasonPoints?: number; streak: number; avatar?: string } | null>(null);
  const { getPartnerProfileStats } = store;
  useEffect(() => {
    let mounted = true;
    if (partnerName) {
      executeStatsFetch(async () => {
        try {
          const res = await getPartnerProfileStats(partnerName);
          if (!mounted) return;
          setPartnerStats(
            res
              ? {
                  seasonPoints: res.seasonPoints,
                  streak: res.stats?.currentStreakDays ?? res.stats?.streakDays ?? 0,
                  avatar: res.avatar,
                }
              : null
          );
        } catch {
          if (mounted) setPartnerStats(null);
        }
      });
    } else {
      setPartnerStats(null);
    }
    return () => {
      mounted = false;
    };
  }, [partnerName, getPartnerProfileStats, executeStatsFetch]);

  const mySeasonPoints = store.getLeagueData('ninetyDay').userPoints;
  const myStreak = useMemo(() => calculateUnifiedStreak(store.state).currentStreakDays || 0, [store.state]);
  const partnerSeasonPoints =
    partnerStats?.seasonPoints ?? (partnerName ? getProfileSeasonPointsByUsername(partnerName, 'ninetyDay', leagueNow()) : 0);

  // Requests (pending only, never with someone who is already a partner)
  const partnerNames = useMemo(
    () => new Set(partnerships.flatMap((p) => [p.user1Username.toLowerCase(), p.user2Username.toLowerCase()])),
    [partnerships]
  );
  const partnerIds = useMemo(() => new Set(partnerships.flatMap((p) => [p.user1Id, p.user2Id])), [partnerships]);
  const incomingInvites = partnerInvites.filter(
    (i) =>
      i.status === 'pending' &&
      i.toUsername.toLowerCase() === currentUsername.toLowerCase() &&
      !partnerIds.has(i.fromUserId) &&
      !partnerNames.has(i.fromUsername.toLowerCase())
  );
  const sentInvites = partnerInvites.filter(
    (i) =>
      i.status === 'pending' &&
      (i.fromUserId === currentUser?.id || i.fromUsername.toLowerCase() === currentUsername.toLowerCase()) &&
      !partnerIds.has(i.toUserId) &&
      !partnerNames.has(i.toUsername.toLowerCase())
  );
  // Waiting invites hold a place: once all are accepted you'd be over the limit.
  const placesUsed = partnerships.length + sentInvites.length;
  const canInvite = placesUsed < MAX_PARTNERS;
  const atPartnerLimit = partnerships.length >= MAX_PARTNERS;

  const challengesFor = useCallback(
    (p: Partnership) => sharedChallenges.filter((c) => c.partnershipId === p.id),
    [sharedChallenges]
  );
  const myChallenges = activePartnership ? challengesFor(activePartnership) : EMPTY_CHALLENGES;
  const runningChallenges = myChallenges.filter((c) => c.status === 'active');
  const finishedChallenges = myChallenges.filter((c) => c.status === 'completed' || c.status === 'expired');
  const partnerDoneAllToday =
    runningChallenges.length > 0 && runningChallenges.every((c) => doneDates(c, !amUser1).includes(today));

  // Partner data comes from the server (not the local save): loading / failed states with Retry.
  const partnersStatus = store.partnersStatus;
  const hasPartnerData = partnerships.length > 0 || partnerInvites.length > 0 || sharedChallenges.length > 0;
  const firstLoad = Boolean(currentUser?.id) && partnersStatus === 'loading' && !hasPartnerData;
  const loadFailed = partnersStatus === 'failed' && !hasPartnerData;
  const refreshFailed = partnersStatus === 'failed' && hasPartnerData;
  const { isLoading: isRetrying, executeFn: executeRetry } = useAsyncAction();
  const retry = () => executeRetry(() => store.refreshPartners());

  // Hero: today's ticks across every partner's running challenges.
  const heroNumbers = useMemo(() => {
    let running = 0;
    let doneToday = 0;
    let together = 0;
    for (const p of partnerships) {
      const u1 = isPartnershipUser1(p, currentUser?.id, currentUsername);
      for (const c of challengesFor(p)) {
        if (c.status !== 'active') continue;
        running++;
        together += c.totalJointDaysCompleted ?? 0;
        if (doneDates(c, u1).includes(today)) doneToday++;
      }
    }
    return { running, doneToday, together };
  }, [partnerships, challengesFor, currentUser?.id, currentUsername, today]);

  const myHabitNames = useMemo(
    () => Array.from(new Set((store.state.habits || []).map((h) => h.name.trim()).filter(Boolean))),
    [store.state.habits]
  );

  const inviteForm = useUnsavedChanges(inviteModalOpen, partnerUidInput);
  const challengeForm = useUnsavedChanges(challengeModalOpen, [myGoal, differentGoal, partnerGoal, lengthDays]);
  const inviteIssues = useFormController();
  const challengeIssues = useFormController();

  const openChallengeForm = (from?: SharedChallenge) => {
    const mine = from ? goalOf(from, amUser1) : '';
    const theirs = from ? goalOf(from, !amUser1) : '';
    setMyGoal(mine);
    setPartnerGoal(theirs === mine ? '' : theirs);
    setDifferentGoal(Boolean(from) && theirs !== mine);
    setLengthDays(from && LENGTH_OPTIONS.includes(from.durationDays) ? from.durationDays : 14);
    setChallengeModalOpen(true);
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingInvite) return;
    const uid = partnerUidInput.trim();
    if (!uid) return;
    if (currentUser?.uid && uid === currentUser.uid) {
      inviteIssues.showError("That's your own ID. Enter your friend's.", 'partner-invite-uid');
      return;
    }
    if (!canInvite) {
      inviteIssues.showError(`You can have ${MAX_PARTNERS} partners, waiting invites included. Cancel an invite or remove a partner first.`);
      return;
    }
    await executeSendInvite(async () => {
      try {
        await store.sendPartnerInvite(uid);
        setInviteModalOpen(false);
        setPartnerUidInput('');
        showSuccessToast('Invite sent', "You'll be partners once they accept.");
      } catch (err: any) {
        const message = toUserMessage(err, "Couldn't send the invite. Try again.");
        inviteIssues.showError(message, /\bID\b/.test(message) ? 'partner-invite-uid' : undefined);
      }
    });
  };

  const handleCreateChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePartnership || isSubmittingChallenge) return;
    const mine = myGoal.trim();
    const theirs = differentGoal ? partnerGoal.trim() : mine;
    if (!mine) {
      challengeIssues.showError('Write what you will do every day.', 'challenge-my-goal');
      return;
    }
    if (!theirs) {
      challengeIssues.showError(`Write what ${partnerName} will do every day.`, 'challenge-partner-goal');
      return;
    }
    // The challenge is named after your goal; two running ones with this partner can't share it.
    const running = store.state.sharedChallenges.filter((c) => c.partnershipId === activePartnership.id && c.status === 'active');
    if (running.some((c) => sameName(c.title, mine))) {
      challengeIssues.showError('You already have a running challenge with this name.', 'challenge-my-goal');
      return;
    }
    await executeCreateChallenge(async () => {
      try {
        await store.createSharedChallenge(
          mine,
          lengthDays,
          'habit',
          amUser1 ? mine : theirs,
          'habit',
          amUser1 ? theirs : mine,
          activePartnership.id
        );
        setChallengeModalOpen(false);
        showSuccessToast('Challenge started', `${lengthDays} days with ${partnerName}. Day 1 is today.`);
      } catch (err: any) {
        challengeIssues.showError(toUserMessage(err, "Couldn't start the challenge. Try again."));
      }
    });
  };

  const handleAccept = (inviteId: string) =>
    executeWithKey(`accept_invite_${inviteId}`, async () => {
      try {
        await store.acceptPartnerInvite(inviteId);
        showSuccessToast('Partner added', "You're partners now. Start a challenge together.");
      } catch (err: any) {
        showErrorToast("Couldn't accept", toUserMessage(err, 'Try again.'));
      }
    });

  const handleDecline = (inviteId: string) =>
    executeWithKey(`decline_invite_${inviteId}`, async () => {
      try {
        await store.declinePartnerInvite(inviteId);
      } catch (err: any) {
        showErrorToast("Couldn't decline", toUserMessage(err, 'Try again.'));
      }
    });

  const handleToggleToday = (challenge: SharedChallenge) =>
    executeWithKey(`log_${challenge.id}`, async () => {
      try {
        await store.logSharedChallengeHabit(challenge.id);
      } catch (err: any) {
        showErrorToast("Couldn't save", toUserMessage(err, 'Try again.'));
      }
    });

  const nudgeKey = activePartnership ? activePartnership.id : '';
  const nudgedToday = Boolean(nudgeKey) && nudgedOn[nudgeKey] === today;

  const handleNudge = () => {
    if (!activePartnership || !partnerUserId || !partnerName || nudgedToday) return;
    const key = activePartnership.id;
    return executeWithKey(`nudge_${key}`, async () => {
      try {
        await createNotificationSupabase({
          recipientId: partnerUserId,
          actorId: currentUser?.id,
          actorUsername: currentUsername,
          actorAvatar: currentUser?.avatar || '🧑',
          type: 'partner_nudge',
          title: 'Your partner nudged you',
          message: `${currentUsername} is waiting for you to finish today's challenges.`,
          payload: { date: today, dedupKey: `partner_nudge_${currentUser?.id || currentUsername}_${today}` },
        });
        const next = { ...nudgedOn, [key]: today };
        setNudgedOn(next);
        try {
          localStorage.setItem(NUDGE_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // storage full or blocked: the nudge itself was sent
        }
        showSuccessToast('Nudge sent', `${partnerName} got a reminder.`);
      } catch (err: any) {
        showErrorToast("Couldn't send nudge", toUserMessage(err, 'Try again later.'));
      }
    });
  };

  const renderChallenge = (c: SharedChallenge) => {
    const mineDone = doneDates(c, amUser1).includes(today);
    const theirsDone = doneDates(c, !amUser1).includes(today);
    const together = c.totalJointDaysCompleted ?? 0;
    const length = c.durationDays || 1;
    const day = Math.min(length, calculateElapsedDays(c.createdAt));
    const daysLeft = Math.max(0, length - day);
    const mine = goalOf(c, amUser1);
    const theirs = goalOf(c, !amUser1);
    const busy = isKeyLoading(`log_${c.id}`);

    return (
      <div key={c.id} className="card enter-item p-4 card-hover">
        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (!mineDone) actionFeedback('tick');
              handleToggleToday(c);
            }}
            aria-pressed={mineDone}
            aria-label={mineDone ? `Undo today for ${mine}` : `Mark ${mine} done today`}
            className={cx(
              'shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-300 active:scale-90',
              mineDone
                ? 'bg-primary-600 text-on-brand'
                : 'bg-bg-600 text-content-muted hover:bg-bg-500 hover:text-content-secondary'
            )}
          >
            {busy ? <AscendLoadingIndicator size="sm" /> : <Check size={22} />}
          </button>

          <div className="flex-1 min-w-0">
            <h3 className="item-name truncate text-content-secondary">{mine}</h3>
            {theirs !== mine && (
              <p className="text-xs text-content-muted truncate">
                {partnerName}: {theirs}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs">
              <span className={mineDone ? 'text-success-text' : 'text-content-muted'}>
                You: {mineDone ? 'done' : 'not yet'}
              </span>
              <span className={theirsDone ? 'text-success-text' : 'text-content-muted'}>
                {partnerName}: {theirsDone ? 'done' : 'not yet'}
              </span>
              {(c.jointStreak || 0) > 0 && (
                <span className="flex items-center gap-1 text-brand-text">
                  <Flame size={13} aria-hidden="true" />
                  <span className="figure">{c.jointStreak}d together</span>
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setChallengeToDelete(c)}
            aria-label={`Delete challenge ${mine}`}
            className={`shrink-0 p-2 rounded-lg text-content-muted hover:text-rose-theme hover:bg-rose-500/10 transition-colors ${TAP_TARGET}`}
          >
            <Trash2 size={16} />
          </button>
        </div>

        <div className="mt-3 space-y-1.5">
          <div
            className="h-1.5 rounded-full bg-overlay-subtle overflow-hidden"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={length}
            aria-valuenow={together}
            aria-label="Days done together"
          >
            <div className="h-full rounded-full bg-primary-500 transition-all" style={{ width: `${Math.min(100, (together / length) * 100)}%` }} />
          </div>
          <div className="flex items-center justify-between text-micro text-content-muted">
            <span>
              <span className="figure text-content-secondary">{together}</span> of {length} days done together
            </span>
            <span>{daysLeft === 0 ? 'Last day' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Partners</h1>
          <p className="page-subtitle">Do a daily challenge with a friend and keep each other going.</p>
        </div>
        {!firstLoad && !loadFailed && (
          <button
            type="button"
            onClick={() => setInviteModalOpen(true)}
            disabled={!canInvite}
            className="btn-primary sm:shrink-0 disabled:cursor-not-allowed"
          >
            <UserPlus size={18} aria-hidden="true" />
            <span>{canInvite ? 'Add partner' : `${MAX_PARTNERS} of ${MAX_PARTNERS} places used`}</span>
          </button>
        )}
      </div>

      {firstLoad ? (
        <div aria-busy="true" className="space-y-6">
          <span className="sr-only" role="status">Loading your partners</span>
          <div className="card p-5 sm:p-6 flex items-center gap-5">
            <Skeleton className="h-[104px] w-[104px] rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
          <div className="card p-5 space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </div>
      ) : loadFailed ? (
        <EmptyState
          icon={WifiOff}
          iconClassName="bg-overlay-subtle text-content-muted ring-1 ring-inset ring-overlay-default"
          title="Couldn't load your partners"
          description="Check your connection, then try again."
          action={
            <Button variant="secondary" size="sm" type="button" onClick={retry} loading={isRetrying}>
              Retry
            </Button>
          }
        />
      ) : (
      <>
      {refreshFailed && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-overlay-default px-4 py-2 text-xs text-content-secondary">
          <span className="flex items-center gap-2">
            <WifiOff size={14} aria-hidden="true" className="shrink-0 text-content-muted" />
            Couldn't refresh. Showing what was loaded last.
          </span>
          <Button variant="ghost" size="sm" type="button" onClick={retry} loading={isRetrying}>
            Retry
          </Button>
        </div>
      )}

      <Reveal index={0}>
        <PageHero
          ariaLabel="Your partners today"
          ring={
            heroNumbers.running > 0
              ? {
                  value: heroNumbers.doneToday,
                  max: heroNumbers.running,
                  label: `Challenges ticked today: ${heroNumbers.doneToday} of ${heroNumbers.running}`,
                  center: (
                    <>
                      {heroNumbers.doneToday}
                      <span className="text-sm font-medium text-content-muted">/{heroNumbers.running}</span>
                    </>
                  ),
                  caption: 'ticked today',
                }
              : undefined
          }
          lead={{
            label: 'Partners',
            value: <CountUp value={partnerships.length} />,
            hint: `of ${MAX_PARTNERS} places${sentInvites.length > 0 ? ` · ${sentInvites.length} waiting` : ''}`,
          }}
          stats={[
            { label: 'Running', value: <CountUp value={heroNumbers.running} />, hint: heroNumbers.running === 1 ? 'challenge' : 'challenges' },
            { label: 'Together', value: <CountUp value={heroNumbers.together} />, hint: 'days done together', valueClassName: 'text-brand-text' },
            { label: 'Requests', value: <CountUp value={incomingInvites.length} />, hint: 'to answer' },
          ]}
        />
      </Reveal>

      {(incomingInvites.length > 0 || sentInvites.length > 0) && (
        <div className="card p-4 space-y-1">
          <h2 className="section-title mb-2">
            Requests <span className="figure text-content-muted font-normal">{incomingInvites.length + sentInvites.length}</span>
          </h2>
          {incomingInvites.map((invite) => {
            const accepting = isKeyLoading(`accept_invite_${invite.id}`);
            const declining = isKeyLoading(`decline_invite_${invite.id}`);
            return (
              <div key={invite.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5 border-t border-overlay-subtle first:border-t-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-xl shrink-0" aria-hidden="true">{invite.fromAvatar || '🧑'}</span>
                  <p className="text-sm text-content-muted truncate">
                    <span className="item-name text-content-secondary">{invite.fromUsername}</span> wants to be your partner
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={accepting || declining || atPartnerLimit}
                    onClick={() => handleAccept(invite.id)}
                    aria-label={`Accept ${invite.fromUsername} as partner`}
                    className="btn-primary min-h-11 text-xs px-3 disabled:cursor-not-allowed"
                  >
                    {accepting && <AscendLoadingIndicator size="sm" />}
                    <span>{accepting ? 'Accepting…' : 'Accept'}</span>
                  </button>
                  <button
                    type="button"
                    disabled={accepting || declining}
                    onClick={() => handleDecline(invite.id)}
                    aria-label={`Decline ${invite.fromUsername}'s invite`}
                    className="btn-secondary min-h-11 text-xs px-3 disabled:cursor-not-allowed"
                  >
                    {declining && <AscendLoadingIndicator size="sm" />}
                    <span>{declining ? 'Declining…' : 'Decline'}</span>
                  </button>
                </div>
              </div>
            );
          })}
          {atPartnerLimit && incomingInvites.length > 0 && (
            <p className="text-xs text-content-muted pt-1">You have {MAX_PARTNERS} partners. Remove one to accept.</p>
          )}
          {sentInvites.map((invite) => (
            <div key={invite.id} className="flex items-center justify-between gap-2 py-2.5 border-t border-overlay-subtle first:border-t-0">
              <p className="flex items-center gap-2 text-sm text-content-muted min-w-0">
                <Clock size={14} className="shrink-0" aria-hidden="true" />
                <span className="truncate">
                  Waiting for <span className="item-name text-content-secondary">{invite.toUsername}</span> to accept
                </span>
              </p>
              <button
                type="button"
                onClick={() => setInviteToCancel(invite)}
                aria-label={`Cancel invite to ${invite.toUsername}`}
                className="btn-secondary min-h-11 text-xs px-3 shrink-0"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      {partnerships.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No partners yet"
          description="Add a friend with their 6-digit ID (it's in their Settings). Then pick something you'll both do every day and tick it off together."
          action={
            canInvite ? (
              <button type="button" onClick={() => setInviteModalOpen(true)} className="btn-primary mx-auto">
                <UserPlus size={16} aria-hidden="true" />
                <span>Add partner</span>
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          {partnerships.length > 1 && (
            <Tabs
              ariaLabel="Partners"
              scrollable
              value={activePartnership?.id ?? ''}
              onChange={(id) => setSelectedPartnerId(id)}
              items={partnerships.map((p) => {
                const u1 = isPartnershipUser1(p, currentUser?.id, currentUsername);
                const running = challengesFor(p).filter((c) => c.status === 'active');
                const left = running.filter((c) => !doneDates(c, u1).includes(today)).length;
                // Badge: challenges you still have to tick today with this partner.
                return { id: p.id, label: u1 ? p.user2Username : p.user1Username, badge: left || undefined };
              })}
            />
          )}

          {activePartnership && (
            <div className="space-y-6">
              <div className="card p-5 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary-500/20 text-brand-text flex items-center justify-center text-lg font-semibold shrink-0">
                    {partnerStats?.avatar && partnerStats.avatar !== '🧑' ? partnerStats.avatar : initial(partnerName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="section-title truncate">{partnerName}</h2>
                    <p className="text-xs text-content-muted">
                      {mySeasonPoints === partnerSeasonPoints
                        ? 'Level on points this season'
                        : mySeasonPoints > partnerSeasonPoints
                        ? `You're ahead by ${ptsText(mySeasonPoints - partnerSeasonPoints)} this season`
                        : `${partnerName} is ahead by ${ptsText(partnerSeasonPoints - mySeasonPoints)} this season`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRemoveConfirmOpen(true)}
                    aria-label={`Remove ${partnerName} as partner`}
                    title="Remove partner"
                    className={`shrink-0 p-2 rounded-lg text-content-muted hover:text-rose-theme hover:bg-rose-500/10 transition-colors ${TAP_TARGET}`}
                  >
                    <UserMinus size={18} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'You', points: mySeasonPoints, streak: myStreak, loading: false },
                    { label: partnerName || 'Partner', points: partnerSeasonPoints, streak: partnerStats?.streak ?? 0, loading: isStatsLoading && !partnerStats },
                  ].map((side) => (
                    <div key={side.label} className="rounded-xl border border-overlay-subtle p-3 space-y-1.5 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-content-muted truncate">{side.label}</span>
                        {!side.loading && <TierBadge totalPoints={side.points} size="sm" />}
                      </div>
                      {side.loading ? (
                        <Skeleton className="h-6 w-20" />
                      ) : (
                        <>
                          <p className="text-base">
                            <CountUp value={side.points} className="figure text-content-primary" />
                            <span className="text-xs text-content-muted"> {ptUnit(side.points)}</span>
                          </p>
                          <p className="flex items-center gap-1 text-xs text-content-muted">
                            <Flame size={12} className="text-brand-text" />
                            <span className="figure">{side.streak}</span> day streak
                          </p>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                {runningChallenges.length > 0 && (
                  <button
                    type="button"
                    onClick={handleNudge}
                    disabled={nudgedToday || partnerDoneAllToday || isKeyLoading(`nudge_${nudgeKey}`)}
                    className="btn-secondary w-full sm:w-auto disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isKeyLoading(`nudge_${nudgeKey}`) ? <AscendLoadingIndicator size="sm" /> : <Zap size={15} />}
                    <span>
                      {partnerDoneAllToday
                        ? `${partnerName} is done for today`
                        : nudgedToday
                        ? 'Nudged today'
                        : `Nudge ${partnerName}`}
                    </span>
                  </button>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="section-title">Challenges</h2>
                  <button type="button" onClick={() => openChallengeForm()} className="btn-primary min-h-11 text-xs px-3">
                    <Plus size={15} aria-hidden="true" />
                    <span>New challenge</span>
                  </button>
                </div>

                {runningChallenges.length === 0 ? (
                  <EmptyState
                    title="No challenge running"
                    description={`Pick one thing you and ${partnerName} will both do every day, like "Read 20 pages". Tick it each day you do it.`}
                  />
                ) : (
                  <div className="space-y-2.5">{runningChallenges.map(renderChallenge)}</div>
                )}

                <Disclosure title="How challenges work">
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>Tick your challenge each day you do it. A day counts when you both tick it.</li>
                    <li>Fill every day of the challenge together to finish it.</li>
                    <li>If your goal is one of your habits, ticking the habit ticks the challenge too.</li>
                    <li>Challenges don't give points. They're for keeping each other going.</li>
                  </ul>
                </Disclosure>

                {finishedChallenges.length > 0 && (
                  <div className="pt-2 space-y-2.5">
                    <h2 className="section-title">Finished</h2>
                    {finishedChallenges.map((c) => {
                      const completed = c.status === 'completed';
                      return (
                        <div key={c.id} className="card p-4 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="item-name truncate text-content-secondary">{goalOf(c, amUser1)}</h3>
                              <span className={cx('badge text-2xs px-2 py-0.5 rounded-full shrink-0', completed ? 'badge-emerald' : 'bg-overlay-subtle text-content-secondary')}>
                                {completed ? 'Completed' : 'Ended'}
                              </span>
                            </div>
                            <p className="text-xs text-content-muted mt-0.5">
                              <span className="figure">{c.totalJointDaysCompleted ?? 0}</span> of {c.durationDays} days done together
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openChallengeForm(c)}
                            aria-label={`Start ${goalOf(c, amUser1)} again`}
                            title="Start again"
                            className={`shrink-0 p-2 rounded-lg text-content-muted hover:text-content-secondary hover:bg-overlay-subtle transition-colors ${TAP_TARGET}`}
                          >
                            <RotateCcw size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setChallengeToDelete(c)}
                            aria-label={`Delete challenge ${goalOf(c, amUser1)}`}
                            className={`shrink-0 p-2 rounded-lg text-content-muted hover:text-rose-theme hover:bg-rose-500/10 transition-colors ${TAP_TARGET}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      </>
      )}

      <Dialog
        open={inviteModalOpen}
        preventClose={isSubmittingInvite}
        dirty={inviteForm.dirty}
        onClose={() => setInviteModalOpen(false)}
        title="Add a partner"
        description={`Enter your friend's 6-digit ID. They can find it in their Settings. You can have up to ${MAX_PARTNERS} partners.`}
        footer={
          <>
            <button
              type="button"
              disabled={isSubmittingInvite}
              onClick={() => inviteForm.confirmDiscard(() => setInviteModalOpen(false))}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" form="partner-invite-form" disabled={isSubmittingInvite} className="btn-primary">
              {isSubmittingInvite ? <AscendLoadingIndicator size="sm" /> : <UserPlus size={16} />}
              <span>{isSubmittingInvite ? 'Sending…' : 'Send invite'}</span>
            </button>
          </>
        }
      >
        <Form id="partner-invite-form" onSubmit={handleSendInvite} controller={inviteIssues}>
          <Input
            id="partner-invite-uid"
            label="Friend's ID"
            placeholder="e.g. 049201"
            value={partnerUidInput}
            onChange={(e) => setPartnerUidInput(e.target.value.replace(/\D/g, ''))}
            className="font-mono tabular-nums tracking-widest"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="send"
            maxLength={6}
            pattern="\d{6}"
            title="Enter the 6-digit ID."
            required
          />
        </Form>
      </Dialog>

      <Dialog
        open={challengeModalOpen}
        preventClose={isSubmittingChallenge}
        dirty={challengeForm.dirty}
        onClose={() => setChallengeModalOpen(false)}
        title={`New challenge with ${partnerName || 'partner'}`}
        footer={
          <>
            <button
              type="button"
              disabled={isSubmittingChallenge}
              onClick={() => challengeForm.confirmDiscard(() => setChallengeModalOpen(false))}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" form="challenge-create-form" disabled={isSubmittingChallenge} className="btn-primary">
              {isSubmittingChallenge ? <AscendLoadingIndicator size="sm" /> : <Plus size={16} />}
              <span>{isSubmittingChallenge ? 'Starting…' : 'Start challenge'}</span>
            </button>
          </>
        }
      >
        <Form id="challenge-create-form" onSubmit={handleCreateChallenge} controller={challengeIssues} className="space-y-5">
          <div className="space-y-2">
            <Input
              id="challenge-my-goal"
              label={differentGoal ? 'What will you do every day?' : 'What will you both do every day?'}
              placeholder="e.g. Read 20 pages"
              value={myGoal}
              onChange={(e) => setMyGoal(e.target.value)}
              maxLength={60}
              autoComplete="off"
            />
            {myHabitNames.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-content-muted">Your habits (ticking the habit ticks the challenge too)</p>
                <div className="flex flex-wrap gap-1.5">
                  {myHabitNames.slice(0, 8).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setMyGoal(name)}
                      aria-pressed={myGoal.trim() === name}
                      className={cx(
                        'min-h-9 sm:min-h-0 text-xs px-2.5 py-1 rounded-lg border transition-colors',
                        myGoal.trim() === name
                          ? 'bg-primary-500/15 text-brand-text border-primary-500/40'
                          : 'text-content-muted border-overlay-subtle hover:border-overlay-strong hover:text-content-secondary'
                      )}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-content-secondary">{partnerName} does something different</span>
            <Switch
              checked={differentGoal}
              onChange={() => setDifferentGoal((v) => !v)}
              label={`${partnerName} does something different`}
            />
          </div>

          {differentGoal && (
            <Input
              id="challenge-partner-goal"
              label={`What will ${partnerName} do every day?`}
              placeholder="e.g. 30 min workout"
              value={partnerGoal}
              onChange={(e) => setPartnerGoal(e.target.value)}
              maxLength={60}
              autoComplete="off"
            />
          )}

          <div role="group" aria-labelledby="challenge-length-label">
            <p id="challenge-length-label" className="block label mb-1.5">How long?</p>
            <div className="grid grid-cols-3 gap-2">
              {LENGTH_OPTIONS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setLengthDays(days)}
                  aria-pressed={lengthDays === days}
                  className={cx(
                    'min-h-11 rounded-xl border text-sm font-medium transition-colors',
                    lengthDays === days
                      ? 'bg-primary-500/15 border-primary-500/60 text-brand-text'
                      : 'border-overlay-subtle text-content-muted hover:bg-overlay-subtle'
                  )}
                >
                  {days} days
                </button>
              ))}
            </div>
          </div>
        </Form>
      </Dialog>

      <ConfirmDeleteModal
        open={removeConfirmOpen}
        onClose={() => setRemoveConfirmOpen(false)}
        onConfirm={async () => {
          if (!activePartnership) return;
          const id = activePartnership.id;
          const name = partnerName;
          await executeWithKey(`remove_partner_${id}`, async () => {
            await store.endPartnership(id);
            setRemoveConfirmOpen(false);
            showSuccessToast('Partner removed', `${name} is no longer your partner.`);
          });
        }}
        isDeleting={activePartnership ? isKeyLoading(`remove_partner_${activePartnership.id}`) : false}
        title={`Remove ${partnerName || 'partner'}?`}
        itemName={partnerName || undefined}
        description={`Your challenges with ${partnerName} are deleted for both of you, and ${partnerName} is told.`}
        confirmText="Remove partner"
      />

      <ConfirmDeleteModal
        open={Boolean(challengeToDelete)}
        onClose={() => setChallengeToDelete(null)}
        onConfirm={async () => {
          if (!challengeToDelete) return;
          const id = challengeToDelete.id;
          await executeWithKey(`delete_challenge_${id}`, async () => {
            await store.deleteSharedChallenge(id);
            setChallengeToDelete(null);
            showInfoToast('Challenge deleted', `${partnerName} is told.`);
          });
        }}
        isDeleting={challengeToDelete ? isKeyLoading(`delete_challenge_${challengeToDelete.id}`) : false}
        title="Delete challenge?"
        itemName={challengeToDelete ? goalOf(challengeToDelete, amUser1) : undefined}
        description={`It's deleted for both you and ${partnerName}, with all its days.`}
        confirmText="Delete challenge"
      />

      <ConfirmDeleteModal
        open={Boolean(inviteToCancel)}
        onClose={() => setInviteToCancel(null)}
        onConfirm={async () => {
          if (!inviteToCancel) return;
          const id = inviteToCancel.id;
          const to = inviteToCancel.toUsername;
          await executeWithKey(`cancel_invite_${id}`, async () => {
            await store.cancelPartnerInvite(id);
            setInviteToCancel(null);
            showSuccessToast('Invite cancelled', `Your invite to ${to} is cancelled.`);
          });
        }}
        isDeleting={inviteToCancel ? isKeyLoading(`cancel_invite_${inviteToCancel.id}`) : false}
        title="Cancel invite?"
        itemName={inviteToCancel ? `Invite to ${inviteToCancel.toUsername}` : undefined}
        description={`Cancel your invite to ${inviteToCancel?.toUsername}?`}
        confirmText="Cancel invite"
      />
    </div>
  );
}
