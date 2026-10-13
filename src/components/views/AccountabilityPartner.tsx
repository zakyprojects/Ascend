import { useState, useEffect, useMemo, useCallback } from 'react';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { useAsyncAction, useAsyncActionKey } from '@/lib/useAsyncAction';
import {
  UserPlus,
  Plus,
  Zap,
  Trash2,
  X,
  Clock,
  CheckCircle2,
  BookOpen,
  Dumbbell,
  AlertTriangle,
  ShieldAlert,
  FileText,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  RotateCcw,
  Flame,
  Users,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { TierBadge } from '@/components/ui/TierBadge';
import { useToast } from '@/components/ui/Toast';
import { Dialog, EmptyState, Skeleton } from '@/components/ui/primitives';
import { CountUp } from '@/components/ui/Motion';
import { ProgressRing } from '@/components/ui/charts';
import { TAP_TARGET, TAP_AREA } from '@/components/ui/primitives/shared';
import { getCurrentTier } from '@/lib/tiers';
import { leagueNow, getSeasonNumber } from '@/lib/leagueTime';
import { getProfileSeasonPointsByUsername } from '@/lib/auth';
import { todayKey, formatDateShort, parseDate, calculateElapsedDays, addDays } from '@/lib/dates';
import { createNotificationSupabase, checkRecentPartnerNudgeSent } from '@/lib/supabase';
import { calculateUnifiedStreak } from '@/lib/streakLogic';
import { Partnership, SharedChallenge, SharedChallengeCategory, PartnerInvite } from '@/types';

const EMPTY_PARTNERSHIPS: Partnership[] = [];
const EMPTY_INVITES: PartnerInvite[] = [];
const EMPTY_CHALLENGES: SharedChallenge[] = [];

const CATEGORY_OPTIONS: {
  value: SharedChallengeCategory;
  label: string;
  icon: typeof CheckCircle2;
  color: string;
  borderColor: string;
  bgColor: string;
}[] = [
  { value: 'habit', label: 'Habit', icon: CheckCircle2, color: 'text-success-text', borderColor: 'border-emerald-500/40', bgColor: 'bg-emerald-500/10' },
  { value: 'exercise', label: 'Workout', icon: Dumbbell, color: 'text-warning-text', borderColor: 'border-amber-500/40', bgColor: 'bg-amber-500/10' },
  { value: 'reading', label: 'Reading', icon: BookOpen, color: 'text-sky-theme', borderColor: 'border-sky-500/40', bgColor: 'bg-sky-500/10' },
  { value: 'bad_habit', label: 'Reduction', icon: AlertTriangle, color: 'text-rose-theme', borderColor: 'border-rose-500/40', bgColor: 'bg-rose-500/10' },
  { value: 'skill', label: 'Skill', icon: Zap, color: 'text-purple-hierarchy', borderColor: 'border-purple-500/40', bgColor: 'bg-purple-500/10' },
  { value: 'journal', label: 'Journal', icon: FileText, color: 'text-indigo-theme', borderColor: 'border-indigo-500/40', bgColor: 'bg-indigo-500/10' },
  { value: 'recovery', label: 'Sobriety', icon: ShieldAlert, color: 'text-teal-theme', borderColor: 'border-teal-500/40', bgColor: 'bg-teal-500/10' },
];

const SUGGESTIONS_BY_CATEGORY: Record<SharedChallengeCategory, string[]> = {
  exercise: ['30m Strength Training', '5km Morning Run', '10,000 Daily Steps', '20m HIIT Workout', 'Core & Mobility Session'],
  reading: ['Read 20 Pages', 'Read 1 Chapter', '30m Deep Reading', 'Audiobook 20m'],
  habit: ['Morning Meditation', 'Drink 3L Water', 'No Sugar Today', 'Sleep by 11pm', 'Cold Shower'],
  bad_habit: ['Zero Junk Food', 'No Screen Before Bed', 'No Social Media Scroll', 'Zero Alcohol', 'No Snoozing Alarm'],
  skill: ['30m Coding Practice', 'Language Lesson', 'Guitar Practice', 'Design Study', 'Writing 500 Words'],
  journal: ['Morning Intention Log', 'Evening Reflection', 'Gratitude (3 items)', 'Mindful Check-in'],
  recovery: ['One Day Clean & Sober', 'Urge Surfing (10m)', 'Support Session', 'Trigger Journaling'],
};

const DURATION_OPTIONS = [
  { days: 7, label: '7 Days', bonus: '+50 XP', desc: 'Sprint' },
  { days: 14, label: '14 Days', bonus: '+120 XP', desc: 'Habit Builder' },
  { days: 30, label: '30 Days', bonus: '+300 XP', desc: 'Lock-In' },
  { days: 90, label: '90 Days', bonus: '+1,000 XP', desc: 'Mastery' },
];

function createTimelineDay(
  baseKey: string,
  offsetDays: number,
  dayNumber: number,
  todayStr: string,
  forceFutureFalse = false
) {
  const dateKey = addDays(baseKey, offsetDays);
  const d = parseDate(dateKey) || new Date();
  const dayLabel = d.toLocaleDateString('en-US', { weekday: 'narrow' });
  const shortDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const isToday = dateKey === todayStr;
  const isPast = dateKey < todayStr;
  const isFuture = forceFutureFalse ? false : dateKey > todayStr;

  return {
    dateKey,
    dayLabel,
    shortDate,
    dayNumber,
    isToday,
    isPast,
    isFuture,
  };
}

export function AccountabilityPartner({ store }: { store: AppStore }) {
  const { showSuccessToast, showInfoToast, showErrorToast } = useToast();
  const { isLoading: isStatsLoading, executeFn: executeStatsFetch } = useAsyncAction();
  const { isLoading: isSubmittingInvite, executeFn: executeSendInvite } = useAsyncAction();
  const { isLoading: isSubmittingChallenge, executeFn: executeCreateChallenge } = useAsyncAction();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [challengeModalOpen, setChallengeModalOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [challengeToDelete, setChallengeToDelete] = useState<SharedChallenge | null>(null);
  const [inviteToCancel, setInviteToCancel] = useState<PartnerInvite | null>(null);

  const [partnerUidInput, setPartnerUidInput] = useState('');
  const [showPastPacts, setShowPastPacts] = useState(false);

  // Shared Challenge Creation Form States
  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeDuration, setChallengeDuration] = useState(14);
  const [user1Category, setUser1Category] = useState<SharedChallengeCategory>('habit');
  const [user1Target, setUser1Target] = useState('');
  const [user2Category, setUser2Category] = useState<SharedChallengeCategory>('habit');
  const [user2Target, setUser2Target] = useState('');
  const [challengeError, setChallengeError] = useState<string | null>(null);

  // Local Nudge Cooldowns Map (challengeId -> timestamp ms)
  const [nudgeCooldowns, setNudgeCooldowns] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('ascend_partner_nudge_cooldowns');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const currentUser = store.state.currentUser;
  const currentUsername = store.state.username;

  const rawPartnerships = store.state.partnerships;
  const singlePartnership = store.state.partnership;
  const partnerships = useMemo(() => {
    const list = rawPartnerships || (singlePartnership ? [singlePartnership] : EMPTY_PARTNERSHIPS);
    const map = new Map<string, Partnership>();
    for (const p of list) {
      if (!p) continue;
      const partnerName = (
        p.user1Username.toLowerCase() === currentUsername.toLowerCase() ? p.user2Username : p.user1Username
      ).toLowerCase();
      const partnerId =
        (currentUser?.id && p.user1Id === currentUser.id ? p.user2Id : p.user1Id) || partnerName;
      const key = partnerId || partnerName || p.id;
      if (!map.has(key)) {
        map.set(key, p);
      }
    }
    return Array.from(map.values());
  }, [rawPartnerships, singlePartnership, currentUsername, currentUser?.id]);

  const partnerInvites = store.state.partnerInvites || EMPTY_INVITES;
  const sharedChallenges = store.state.sharedChallenges || EMPTY_CHALLENGES;

  // Selected partner relationship state
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);

  useEffect(() => {
    if (partnerships.length > 0) {
      if (!selectedPartnerId || !partnerships.some((p) => p.id === selectedPartnerId)) {
        setSelectedPartnerId(partnerships[0].id);
      }
    } else {
      setSelectedPartnerId(null);
    }
  }, [partnerships, selectedPartnerId]);

  const activePartnership: Partnership | null =
    partnerships.find((p) => p.id === selectedPartnerId) || partnerships[0] || null;

  // Identify partner username and roles for current user
  const isUser1InActive = activePartnership
    ? activePartnership.user1Username.toLowerCase() === currentUsername.toLowerCase()
    : true;

  const activePartnerUsername = activePartnership
    ? isUser1InActive
      ? activePartnership.user2Username
      : activePartnership.user1Username
    : null;

  const activePartnerUserId = activePartnership
    ? isUser1InActive
      ? activePartnership.user2Id
      : activePartnership.user1Id
    : null;

  // Real Partner high-level stats state loaded from Supabase
  const [partnerStatsData, setPartnerStatsData] = useState<{
    totalPoints: number;
    seasonPoints?: number;
    stats: {
      streakDays: number;
      streakSource?: string;
      currentStreakDays?: number;
      currentStreakCategory?: string;
      currentStreakIsActive?: boolean;
      bestStreakDays?: number;
      bestStreakCategory?: string;
      habitsCompletedCount: number;
      habitsCompletedTodayCount?: number;
      exerciseMinutes?: number;
      journalEntriesCount?: number;
      booksRead?: number;
    };
    avatar?: string;
    isProfilePublic?: boolean;
  } | null>(null);

  const { getPartnerProfileStats } = store;

  useEffect(() => {
    let mounted = true;
    if (activePartnerUsername) {
      executeStatsFetch(async () => {
        try {
          const res = await getPartnerProfileStats(activePartnerUsername);
          if (mounted) {
            if (res) {
              setPartnerStatsData(res as any);
            } else {
              setPartnerStatsData(null);
            }
          }
        } catch {
          if (mounted) setPartnerStatsData(null);
        }
      });
    } else {
      setPartnerStatsData(null);
    }
    return () => {
      mounted = false;
    };
  }, [activePartnerUsername, getPartnerProfileStats, executeStatsFetch]);

  // Current Season & Lazy Client-Side Evaluation
  const currentSeason = getSeasonNumber(leagueNow());

  // Current User Stats
  const mySeasonPoints = store.getLeagueData('ninetyDay').userPoints;
  const myTotalPoints = mySeasonPoints;
  const myTier = getCurrentTier(mySeasonPoints);
  const myHabitsCompletedToday = (store.state.habits || []).filter((h) => {
    const today = todayKey();
    return Array.isArray(h.completions)
      ? h.completions.includes(today)
      : h.completions?.[today]?.done === true;
  }).length;
  const myHabitsCompletedTotal = (store.state.habits || []).reduce(
    (acc, h) =>
      acc +
      (Array.isArray(h.completions)
        ? h.completions.length
        : Object.values(h.completions || {}).filter((c) => c && c.done).length),
    0
  );
  const myStreakData = useMemo(() => calculateUnifiedStreak(store.state), [store.state]);
  const myCurrentStreakDays = myStreakData.currentStreakDays || 0;

  // Partner Stats (Lazy Client-Side Evaluation)
  const partnerSeason = (partnerStatsData as any)?.season_id ?? (partnerStatsData as any)?.seasonId ?? 1;
  const partnerPoints = (partnerSeason === currentSeason)
    ? (partnerStatsData?.seasonPoints ?? (partnerStatsData as any)?.season_points ?? partnerStatsData?.totalPoints ?? (activePartnerUsername ? getProfileSeasonPointsByUsername(activePartnerUsername, 'ninetyDay', leagueNow()) : 0))
    : 0;
  const partnerTotalPoints = partnerPoints;
  const partnerSeasonPoints = partnerPoints;
  const partnerTier = getCurrentTier(partnerSeasonPoints);
  const partnerHabitsCompleted = partnerStatsData?.stats?.habitsCompletedCount ?? 0;
  const partnerHabitsCompletedToday = partnerStatsData?.stats?.habitsCompletedTodayCount ?? 0;
  const partnerCurrentStreakDays =
    partnerStatsData?.stats?.currentStreakDays ?? partnerStatsData?.stats?.streakDays ?? 0;

  // Sets of active partner usernames & user IDs
  const activePartnerUsernamesSet = useMemo(
    () => new Set(partnerships.flatMap((p) => [p.user1Username.toLowerCase(), p.user2Username.toLowerCase()])),
    [partnerships]
  );
  const activePartnerUserIdsSet = useMemo(
    () => new Set(partnerships.flatMap((p) => [p.user1Id, p.user2Id])),
    [partnerships]
  );

  // Pending incoming & sent invites excluding users who are already active partners
  const incomingInvites = partnerInvites.filter((i) => {
    if (i.status !== 'pending') return false;
    if (i.toUsername.toLowerCase() !== currentUsername.toLowerCase()) return false;
    const isPartnerAlready =
      activePartnerUserIdsSet.has(i.fromUserId) ||
      activePartnerUsernamesSet.has(i.fromUsername.toLowerCase());
    return !isPartnerAlready;
  });

  const sentInvites = partnerInvites.filter((i) => {
    if (i.status !== 'pending') return false;
    const isFromMe = i.fromUserId === currentUser?.id || i.fromUsername.toLowerCase() === currentUsername.toLowerCase();
    if (!isFromMe) return false;
    const isPartnerAlready =
      activePartnerUserIdsSet.has(i.toUserId) ||
      activePartnerUsernamesSet.has(i.toUsername.toLowerCase());
    return !isPartnerAlready;
  });

  const [inviteError, setInviteError] = useState<string | null>(null);

  const handleSendInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingInvite) return;
    setInviteError(null);
    const trimmed = partnerUidInput.trim();
    if (!trimmed) return;

    if (currentUser?.uid && trimmed === currentUser.uid) {
      setInviteError("You can't send an accountability invite to yourself.");
      return;
    }

    if (partnerships.length >= 5) {
      setInviteError("You already have 5 partners, the maximum. Remove one to add another.");
      return;
    }

    const targetUid = trimmed;
    await executeSendInvite(async () => {
      try {
        await store.sendPartnerInvite(targetUid);
        setInviteModalOpen(false);
        setPartnerUidInput('');
        setInviteError(null);
        showSuccessToast('Invite sent', 'Your partner invite is on its way.');
      } catch (err: any) {
        const errorMessage = err?.message || 'Failed to send invite.';
        setInviteError(errorMessage);
        showErrorToast('Invite failed', errorMessage);
      }
    });
  };

  const handleCreateChallengeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePartnership || isSubmittingChallenge) return;

    setChallengeError(null);
    await executeCreateChallenge(async () => {
      try {
        const u1Target = user1Target.trim() || 'Daily Activity';
        const u2Target = user2Target.trim() || 'Daily Activity';
        const title = challengeTitle.trim() || `${user1Category.toUpperCase()} & ${user2Category.toUpperCase()} Pact`;

        await store.createSharedChallenge(
          title,
          Number(challengeDuration),
          isUser1InActive ? user1Category : user2Category,
          isUser1InActive ? u1Target : u2Target,
          isUser1InActive ? user2Category : user1Category,
          isUser1InActive ? u2Target : u1Target,
          activePartnership.id
        );

        setChallengeModalOpen(false);
        setChallengeTitle('');
        setUser1Target('');
        setUser2Target('');
        setChallengeError(null);
        showSuccessToast('Joint Pact Locked In!', `"${title}" has begun with @${activePartnerUsername}.`);
      } catch (err: any) {
        const errorMessage = err?.message || 'Failed to create pact.';
        setChallengeError(errorMessage);
        showErrorToast('Could not create pact', errorMessage);
      }
    });
  };

  const handleAcceptInvite = async (inviteId: string) => {
    setInviteError(null);
    await executeWithKey(`accept_invite_${inviteId}`, async () => {
      try {
        await store.acceptPartnerInvite(inviteId);
        showSuccessToast('Partner connected', "You're now accountability partners.");
      } catch (err: any) {
        setInviteError(err.message || 'Failed to accept invite.');
      }
    });
  };

  // Challenges specific to the currently selected partner relationship
  const isolatedChallenges = useMemo(() => {
    return sharedChallenges.filter(
      (c) => activePartnership && c.partnershipId === activePartnership.id
    );
  }, [sharedChallenges, activePartnership]);

  const activePacts = useMemo(() => {
    return isolatedChallenges.filter((c) => c.status === 'active');
  }, [isolatedChallenges]);

  const pastPacts = useMemo(() => {
    return isolatedChallenges.filter((c) => c.status === 'completed' || c.status === 'expired');
  }, [isolatedChallenges]);

  // Nudge Partner Handler with DB check fallback for cross-device support
  const handleNudgePartner = useCallback(
    async (challenge: SharedChallenge) => {
      if (!activePartnerUserId || !activePartnerUsername) return;

      const now = Date.now();
      const existingCooldown = nudgeCooldowns[challenge.id] || 0;

      if (now < existingCooldown) {
        const remainingMinutes = Math.ceil((existingCooldown - now) / 60000);
        showInfoToast('Nudge on cooldown', `You can nudge ${activePartnerUsername} again in ${remainingMinutes}m.`);
        return;
      }

      const today = todayKey();

      await executeWithKey(`nudge_${challenge.id}`, async () => {
        // Check remote notifications table to prevent bypassing cooldown on alternate devices/browsers
        const wasRecentlySent = await checkRecentPartnerNudgeSent(activePartnerUserId, challenge.id, today);
        if (wasRecentlySent) {
          const newCooldown = now + 2 * 60 * 60 * 1000;
          const updatedCooldowns = { ...nudgeCooldowns, [challenge.id]: newCooldown };
          setNudgeCooldowns(updatedCooldowns);
          try {
            localStorage.setItem('ascend_partner_nudge_cooldowns', JSON.stringify(updatedCooldowns));
          } catch {
            // ignore
          }
          showInfoToast('Nudge on cooldown', `You already nudged @${activePartnerUsername} in the last 2 hours.`);
          return;
        }

        const dedupKey = `partner_nudge_${challenge.id}_${today}`;

        try {
          await createNotificationSupabase({
            recipientId: activePartnerUserId,
            actorId: currentUser?.id,
            actorUsername: currentUsername,
            actorAvatar: currentUser?.avatar || '🧑',
            type: 'partner_nudge',
            title: 'Accountability Pact Nudge',
            message: `${currentUsername} is waiting on you to lock in today's pledge for "${challenge.title}"!`,
            payload: {
              challengeId: challenge.id,
              challengeTitle: challenge.title,
              date: today,
              dedupKey,
            },
          });

          const newCooldown = now + 2 * 60 * 60 * 1000; // 2 hours
          const updatedCooldowns = { ...nudgeCooldowns, [challenge.id]: newCooldown };
          setNudgeCooldowns(updatedCooldowns);
          try {
            localStorage.setItem('ascend_partner_nudge_cooldowns', JSON.stringify(updatedCooldowns));
          } catch {
            // ignore localStorage err
          }

          showSuccessToast('Nudge sent', `Reminded @${activePartnerUsername} about today's pledge.`);
        } catch (err: any) {
          showErrorToast('Failed to send nudge', err.message || 'Please try again later.');
        }
      });
    },
    [activePartnerUserId, activePartnerUsername, currentUser, currentUsername, nudgeCooldowns, showInfoToast, showSuccessToast, showErrorToast, executeWithKey]
  );

  // Activity Matrix Timeline anchored to pact creation start date and bounded by pact duration
  const matrixTimeline = useMemo(() => {
    if (!activePartnership) return [];

    const targetPacts = activePacts.length > 0 ? activePacts : isolatedChallenges;

    let earliestStartIso = activePartnership.pairedAt;
    if (targetPacts.length > 0) {
      const sortedPactDates = targetPacts
        .map((c) => c.createdAt)
        .filter(Boolean)
        .sort();
      if (sortedPactDates.length > 0) {
        earliestStartIso = sortedPactDates[0];
      }
    }

    const todayStr = todayKey();

    const parsedStart = parseDate(earliestStartIso);
    const startKey = parsedStart ? todayKey(parsedStart) : todayStr;

    // Calculate days elapsed from local start date to today using shared utility (1-indexed, Day 1 = start date)
    const elapsedDays = calculateElapsedDays(earliestStartIso);

    // Max duration for target pacts (default 14 if none)
    const maxDuration = targetPacts.length > 0
      ? Math.max(...targetPacts.map((c) => c.durationDays || 14))
      : 14;

    const days: {
      dateKey: string;
      dayLabel: string;
      shortDate: string;
      dayNumber: number;
      isToday: boolean;
      isPast: boolean;
      isFuture: boolean;
    }[] = [];

    if (maxDuration <= 14) {
      // For pacts <= 14 days, show exactly maxDuration day cells (Days 1..maxDuration)
      for (let i = 0; i < maxDuration; i++) {
        days.push(createTimelineDay(startKey, i, i + 1, todayStr));
      }
    } else {
      // For pacts > 14 days
      if (elapsedDays <= 14) {
        // First 14 days: Day 1..14
        for (let i = 0; i < 14; i++) {
          days.push(createTimelineDay(startKey, i, i + 1, todayStr));
        }
      } else if (elapsedDays <= maxDuration) {
        // Rolling 14 trailing calendar days ending today
        for (let i = 13; i >= 0; i--) {
          days.push(createTimelineDay(todayStr, -i, elapsedDays - i, todayStr, true));
        }
      } else {
        // Pact duration window has fully elapsed -> freeze at the final 14 days (up to maxDuration)
        const finalPactDayKey = addDays(startKey, maxDuration - 1);
        for (let i = 13; i >= 0; i--) {
          days.push(createTimelineDay(finalPactDayKey, -i, maxDuration - i, todayStr));
        }
      }
    }

    return days;
  }, [activePartnership, isolatedChallenges, activePacts]);

  const heatmapData = useMemo(() => {
    if (!activePartnership || matrixTimeline.length === 0) return [];

    return matrixTimeline.map((day) => {
      // Filter pacts that were active on this day (between creation date and creation date + durationDays - 1)
      const activePactsOnDay = isolatedChallenges.filter((c) => {
        const pDate = parseDate(c.createdAt);
        const pKey = pDate ? todayKey(pDate) : (c.createdAt ? c.createdAt.slice(0, 10) : '2000-01-01');
        const duration = c.durationDays || 14;
        const endKey = addDays(pKey, duration - 1);
        return pKey <= day.dateKey && day.dateKey <= endKey;
      });

      const hasActivePacts = activePactsOnDay.length > 0;

      // Check user completed challenge pledge on this date across active pacts
      const myDone = hasActivePacts && activePactsOnDay.some((c) => {
        const isU1 = (currentUser?.id && activePartnership.user1Id === currentUser.id) ||
          activePartnership.user1Username.toLowerCase() === currentUsername.toLowerCase();
        const doneDates = isU1
          ? (c.user1DoneDates || (c.user1DoneDate ? [c.user1DoneDate] : []))
          : (c.user2DoneDates || (c.user2DoneDate ? [c.user2DoneDate] : []));
        return doneDates.includes(day.dateKey);
      });

      // Check partner completed challenge pledge on this date across active pacts
      const partnerDone = hasActivePacts && activePactsOnDay.some((c) => {
        const isU1 = (currentUser?.id && activePartnership.user1Id === currentUser.id) ||
          activePartnership.user1Username.toLowerCase() === currentUsername.toLowerCase();
        const doneDates = isU1
          ? (c.user2DoneDates || (c.user2DoneDate ? [c.user2DoneDate] : []))
          : (c.user1DoneDates || (c.user1DoneDate ? [c.user1DoneDate] : []));
        return doneDates.includes(day.dateKey);
      });

      let status: 'both' | 'you_only' | 'partner_only' | 'none' = 'none';
      if (myDone && partnerDone) status = 'both';
      else if (myDone) status = 'you_only';
      else if (partnerDone) status = 'partner_only';

      return {
        ...day,
        hasActivePacts,
        myDone,
        partnerDone,
        status,
      };
    });
  }, [activePartnership, currentUsername, currentUser, isolatedChallenges, matrixTimeline]);

  // Compute sync rate strictly across days that have actually elapsed with active pacts
  const elapsedDaysList = useMemo(() => heatmapData.filter((d) => !d.isFuture && d.hasActivePacts), [heatmapData]);
  const elapsedDaysCount = Math.max(1, elapsedDaysList.length);
  const jointSyncCount = useMemo(() => elapsedDaysList.filter((d) => d.status === 'both').length, [elapsedDaysList]);
  const jointSyncRate = Math.round((jointSyncCount / elapsedDaysCount) * 100);

  // User's active habit names for suggestion pills
  const userHabitNames = useMemo(() => {
    return (store.state.habits || []).map((h) => h.name);
  }, [store.state.habits]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">Accountability Partners</h1>
            <span className="text-xs text-content-muted tabular-nums">
              {partnerships.length} / 5 Partners
            </span>
          </div>
          <p className="page-subtitle">Make pacts with friends and keep each other on track.</p>
        </div>

        <div>
          {partnerships.length < 5 ? (
            <button onClick={() => setInviteModalOpen(true)} className="btn-primary flex items-center gap-2">
              <UserPlus size={18} />
              <span>Invite Partner</span>
            </button>
          ) : (
            <button disabled className="btn-secondary opacity-50 cursor-not-allowed text-xs py-2 px-3">
              Partner limit reached (5/5)
            </button>
          )}
        </div>
      </div>

      {inviteError && (
        <div className="rounded-xl border border-rose-500/30 border-l-4 border-l-rose-500 bg-rose-500/10 p-4 text-xs text-rose-theme flex items-center justify-between">
          <span>{inviteError}</span>
          <button
            onClick={() => setInviteError(null)}
            aria-label="Dismiss error"
            className={`text-content-muted hover:text-content-primary ${TAP_TARGET}`}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* PENDING INVITES SECTION (INCOMING & SENT) */}
      {(incomingInvites.length > 0 || sentInvites.length > 0) && (
        <div className="card p-4 space-y-3">
          <h2 className="section-title">
            Partner requests
          </h2>

          {/* Incoming Requests */}
          {incomingInvites.length > 0 && (
            <div className="space-y-2">
              <span className="stat-label block">Incoming invites</span>
              {incomingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between py-3 border-t border-overlay-subtle text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{invite.fromAvatar || '🧑'}</span>
                    <div>
                      <span className="item-name">{invite.fromUsername}</span>
                      <span className="text-content-muted ml-1.5">wants to be your accountability partner</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={isKeyLoading(`accept_invite_${invite.id}`)}
                      onClick={() => handleAcceptInvite(invite.id)}
                      className="px-3 py-1 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 disabled:cursor-not-allowed text-on-brand font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      {isKeyLoading(`accept_invite_${invite.id}`) ? (
                        <AscendLoadingIndicator size="sm" />
                      ) : null}
                      <span>{isKeyLoading(`accept_invite_${invite.id}`) ? 'Accepting...' : 'Accept'}</span>
                    </button>
                    <button
                      onClick={() => store.declinePartnerInvite(invite.id)}
                      className="px-3 py-1 hover:bg-overlay-subtle text-content-tertiary font-medium rounded-lg border border-overlay-default transition-colors"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Sent Invites */}
          {sentInvites.length > 0 && (
            <div className="space-y-2 pt-1">
              <span className="stat-label block">Sent invites (pending)</span>
              {sentInvites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between py-2.5 border-t border-overlay-subtle text-xs">
                  <div className="flex items-center gap-2 text-content-tertiary">
                    <Clock size={14} className="text-warning-text" />
                    <span>Invite sent to <strong className="item-name text-content-secondary">{invite.toUsername}</strong></span>
                  </div>
                  <button
                    onClick={() => setInviteToCancel(invite)}
                    className="bg-rose-500/10 text-xs text-rose-theme hover:text-rose-theme-muted font-medium transition-colors px-2 py-1 rounded-lg hover:bg-rose-500/20"
                  >
                    Cancel Invite
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MULTI-PARTNER SELECTOR */}
      {partnerships.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="section-title">Partners ({partnerships.length}/5)</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {partnerships.map((p) => {
              const pUsername = p.user1Username.toLowerCase() === currentUsername.toLowerCase() ? p.user2Username : p.user1Username;
              const isSelected = activePartnership?.id === p.id;
              const pChallenges = sharedChallenges.filter((c) => c.partnershipId === p.id && c.status === 'active');

              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPartnerId(p.id)}
                  className={`p-3.5 rounded-2xl border text-left transition-colors relative flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'bg-emerald-500/5 border-emerald-500/50 ring-1 ring-emerald-500/30'
                      : 'border-overlay-subtle hover:bg-overlay-subtle text-content-tertiary'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-success-text flex items-center justify-center text-sm font-semibold leading-none">
                        {pUsername.charAt(0).toUpperCase()}
                      </div>
                      <span className="item-name text-sm truncate max-w-[100px]">{pUsername}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-micro text-content-muted pt-2 border-t border-overlay-subtle">
                    <span>Active pacts</span>
                    <span className="figure text-success-text">{pChallenges.length}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ACTIVE PARTNER DETAIL VIEW */}
      {activePartnership ? (
        <div className="space-y-6 animate-fade-in">
          {/* Active Relationship Sub-Header & Actions */}
          <div className="card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-overlay-subtle pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-success-text text-lg font-semibold leading-none">
                  {activePartnerUsername?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="section-title flex items-center gap-2">
                    <span>Partner: {activePartnerUsername}</span>
                    <span className="text-2xs font-medium text-success-text bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">Active</span>
                  </h2>
                  <p className="text-xs text-content-muted mt-0.5">Paired on {formatDateShort(activePartnership.pairedAt)}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button onClick={() => setChallengeModalOpen(true)} className="btn-primary text-xs flex items-center gap-1.5">
                  <Plus size={15} />
                  <span>Pledge Joint Pact</span>
                </button>
                <button onClick={() => setEndConfirmOpen(true)} className="btn-secondary text-xs text-rose-theme hover:text-rose-theme-muted">
                  End Pairing
                </button>
              </div>
            </div>

            {/* ITEM 4: "YOU VS PARTNER" SIDE-BY-SIDE HEAD-TO-HEAD COMPARISON CARD */}
            {isStatsLoading && !partnerStatsData ? (
              <div
                role="status"
                aria-label={`Loading ${activePartnerUsername}'s stats`}
                className="pt-1 space-y-4"
              >
                <div className="flex items-center justify-between border-b border-overlay-subtle pb-3">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[0, 1].map((col) => (
                    <div key={col} className="p-4 rounded-xl border border-overlay-subtle space-y-3">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="space-y-1.5">
                          <Skeleton className="h-3.5 w-24" />
                          <Skeleton className="h-2.5 w-14" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {[0, 1, 2, 3].map((cell) => (
                          <Skeleton key={cell} className="h-12" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="pt-1 space-y-4 relative">
                {isStatsLoading && (
                  <div className="absolute top-0 right-0 flex items-center gap-1.5 text-micro text-content-muted bg-bg-900/80 px-2 py-1 rounded-lg">
                    <AscendLoadingIndicator size="sm" />
                    <span>Updating...</span>
                  </div>
                )}
                {/* Versus Header */}
                <div className="flex items-center justify-between border-b border-overlay-subtle pb-3">
                  <div className="flex items-center gap-2">
                    <span className="section-title">Head-to-head</span>
                  </div>

                  <div className="text-xs font-medium">
                    {mySeasonPoints > partnerSeasonPoints ? (
                      <span className="text-success-text flex items-center gap-1">
                        You lead by <CountUp value={mySeasonPoints - partnerSeasonPoints} className="figure" /> pts
                      </span>
                    ) : partnerSeasonPoints > mySeasonPoints ? (
                      <span className="text-warning-text flex items-center gap-1">
                        {activePartnerUsername} leads by <CountUp value={partnerSeasonPoints - mySeasonPoints} className="figure" /> pts
                      </span>
                    ) : (
                      <span className="text-content-muted">Tied in points</span>
                    )}
                  </div>
                </div>

                {/* Dual Column Head-to-Head */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* You Column */}
                  <div
                    className={`p-4 rounded-xl border transition-all ${
                      mySeasonPoints > partnerSeasonPoints
                        ? 'border-primary-500/40 bg-primary-500/5'
                        : 'border-overlay-subtle'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{currentUser?.avatar || '🧑'}</span>
                        <div>
                          <span className="item-name text-sm">You ({currentUsername})</span>
                          {mySeasonPoints > partnerSeasonPoints && (
                            <span className="badge badge-emerald text-2xs px-2 py-0.5 rounded-full ml-1.5">Leading</span>
                          )}
                          <span className="block text-2xs text-success-text">{myTier.name} Tier</span>
                        </div>
                      </div>
                      <TierBadge totalPoints={mySeasonPoints} size="sm" />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="py-1.5">
                        <span className="stat-label block mb-0.5">Points</span>
                        <CountUp value={mySeasonPoints} className="figure text-base text-warning-text" />
                      </div>
                      <div className="py-1.5">
                        <span className="stat-label block mb-0.5">Current streak</span>
                        <span className="figure text-base text-[color:var(--badge-orange-text)]">{myCurrentStreakDays}d</span>
                      </div>
                      <div className="py-1.5">
                        <span className="stat-label block mb-0.5">Habits done today</span>
                        <span className="figure text-base text-sky-theme">{myHabitsCompletedToday}</span>
                      </div>
                      <div className="py-1.5">
                        <span className="stat-label block mb-0.5">Total habits</span>
                        <span className="figure text-base text-success-text">{myHabitsCompletedTotal}</span>
                      </div>
                    </div>
                  </div>

                  {/* Partner Column */}
                  <div
                    className={`p-4 rounded-xl border transition-all ${
                      partnerSeasonPoints > mySeasonPoints
                        ? 'border-primary-500/40 bg-primary-500/5'
                        : 'border-overlay-subtle'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{partnerStatsData?.avatar || '🧑'}</span>
                        <div>
                          <span className="item-name text-sm">{activePartnerUsername}</span>
                          {partnerSeasonPoints > mySeasonPoints && (
                            <span className="badge badge-emerald text-2xs px-2 py-0.5 rounded-full ml-1.5">Leading</span>
                          )}
                          <span className="block text-2xs text-success-text">{partnerTier.name} Tier</span>
                        </div>
                      </div>
                      <TierBadge totalPoints={partnerSeasonPoints} size="sm" />
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="py-1.5">
                        <span className="stat-label block mb-0.5">Points</span>
                        <CountUp value={partnerSeasonPoints} className="figure text-base text-warning-text" />
                      </div>
                      <div className="py-1.5">
                        <span className="stat-label block mb-0.5">Current streak</span>
                        <span className="figure text-base text-[color:var(--badge-orange-text)]">{partnerCurrentStreakDays}d</span>
                      </div>
                      <div className="py-1.5">
                        <span className="stat-label block mb-0.5">Habits done today</span>
                        <span className="figure text-base text-sky-theme">{partnerHabitsCompletedToday}</span>
                      </div>
                      <div className="py-1.5">
                        <span className="stat-label block mb-0.5">Total habits</span>
                        <span className="figure text-base text-success-text">{partnerHabitsCompleted}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ITEM 5: 14-DAY DUAL-TRACK ACTIVITY HEATMAP */}
            <div className="pt-4 border-t border-overlay-subtle space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-overlay-subtle pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="section-title">
                    {matrixTimeline.length > 0 ? `${matrixTimeline.length}-day` : '14-day'} consistency
                  </span>
                </div>
                <div className="flex items-center gap-3 text-micro flex-wrap">
                  <span className="text-content-muted">
                    Both done: <strong className="figure text-success-text">{jointSyncRate}%</strong> <span className="tabular-nums">({jointSyncCount}/{elapsedDaysCount} active {elapsedDaysCount === 1 ? 'day' : 'days'})</span>
                  </span>
                  <div className="flex items-center gap-2 text-2xs text-content-muted flex-wrap">
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Both done</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500/80 inline-block" /> You only</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-sky-500/80 inline-block" /> Partner only</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-rose-500/15 border border-rose-500/40 text-rose-theme font-semibold text-3xs inline-flex items-center justify-center leading-none">!</span> Missed day</span>
                    <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-bg-900 border border-amber-500/40 text-warning-text text-3xs inline-flex items-center justify-center">·</span> Pending</span>
                  </div>
                </div>
              </div>

              {/* Matrix Grid */}
              <div className="space-y-2 pt-1 overflow-x-auto pb-1">
                {/* Day Header Row */}
                <div className="flex items-center gap-1 min-w-[500px]">
                  <div className="w-20 stat-label text-content-disabled">Day</div>
                  {heatmapData.map((d) => (
                    <div key={d.dateKey} className="flex-1 text-center">
                      <span className={`text-2xs font-medium block ${d.isToday ? 'text-success-text font-semibold' : d.isFuture ? 'text-content-subtle' : 'text-content-muted'}`}>
                        {d.dayLabel}
                      </span>
                      <span className={`tabular-nums text-3xs block ${d.isToday ? 'text-success-text font-semibold' : d.isFuture ? 'text-content-subtle' : 'text-content-disabled'}`}>
                        D{d.dayNumber}
                      </span>
                    </div>
                  ))}
                </div>

                {/* You Row */}
                <div className="flex items-center gap-1 min-w-[500px]">
                  <div className="w-20 item-name text-xs text-content-tertiary truncate">You</div>
                  {heatmapData.map((d) => {
                    let cellContent = '·';
                    let cellStyle = 'bg-bg-900 border border-overlay-subtle text-content-subtle';
                    let tooltip = `${d.shortDate} (Day ${d.dayNumber}): No activity`;

                    if (d.myDone) {
                      cellContent = '✓';
                      if (d.status === 'both') {
                        cellStyle = 'bg-emerald-500 text-white';
                      } else {
                        cellStyle = 'bg-amber-500/80 text-white';
                      }
                      tooltip = `${d.shortDate} (Day ${d.dayNumber}): You completed your pledge`;
                    } else if (d.isPast) {
                      if (d.hasActivePacts) {
                        cellContent = '!';
                        cellStyle = 'bg-rose-500/15 border border-rose-500/40 text-rose-theme';
                        tooltip = `${d.shortDate} (Day ${d.dayNumber}): Missed pledge`;
                      } else {
                        cellContent = '·';
                        cellStyle = 'bg-bg-900/40 border border-overlay-subtle text-content-subtle';
                        tooltip = `${d.shortDate} (Day ${d.dayNumber}): No active pacts`;
                      }
                    } else if (d.isToday) {
                      if (d.hasActivePacts) {
                        cellContent = '·';
                        cellStyle = 'bg-bg-900 border border-amber-500/40 text-warning-text';
                        tooltip = `${d.shortDate} (Day ${d.dayNumber}): Pending today`;
                      } else {
                        cellContent = '·';
                        cellStyle = 'bg-bg-900/40 border border-overlay-subtle text-content-subtle';
                        tooltip = `${d.shortDate} (Day ${d.dayNumber}): No active pacts`;
                      }
                    } else {
                      cellContent = '·';
                      cellStyle = 'bg-bg-900/40 border border-overlay-subtle text-content-subtle';
                      tooltip = `${d.shortDate} (Day ${d.dayNumber}): Upcoming`;
                    }

                    return (
                      <div
                        key={`you-${d.dateKey}`}
                        className="flex-1 flex justify-center py-0.5"
                        title={tooltip}
                      >
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-semibold transition-all duration-200 ${cellStyle}`}
                        >
                          {cellContent}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Partner Row */}
                <div className="flex items-center gap-1 min-w-[500px]">
                  <div className="w-20 item-name text-xs text-content-tertiary truncate">{activePartnerUsername}</div>
                  {heatmapData.map((d) => {
                    let cellContent = '·';
                    let cellStyle = 'bg-bg-900 border border-overlay-subtle text-content-subtle';
                    let tooltip = `${d.shortDate} (Day ${d.dayNumber}): No activity`;

                    if (d.partnerDone) {
                      cellContent = '✓';
                      if (d.status === 'both') {
                        cellStyle = 'bg-emerald-500 text-white';
                      } else {
                        cellStyle = 'bg-sky-500/80 text-white';
                      }
                      tooltip = `${d.shortDate} (Day ${d.dayNumber}): ${activePartnerUsername} completed their pledge`;
                    } else if (d.isPast) {
                      if (d.hasActivePacts) {
                        cellContent = '!';
                        cellStyle = 'bg-rose-500/15 border border-rose-500/40 text-rose-theme';
                        tooltip = `${d.shortDate} (Day ${d.dayNumber}): ${activePartnerUsername} missed their pledge`;
                      } else {
                        cellContent = '·';
                        cellStyle = 'bg-bg-900/40 border border-overlay-subtle text-content-subtle';
                        tooltip = `${d.shortDate} (Day ${d.dayNumber}): No active pacts`;
                      }
                    } else if (d.isToday) {
                      if (d.hasActivePacts) {
                        cellContent = '·';
                        cellStyle = 'bg-bg-900 border border-amber-500/40 text-warning-text';
                        tooltip = `${d.shortDate} (Day ${d.dayNumber}): Pending today`;
                      } else {
                        cellContent = '·';
                        cellStyle = 'bg-bg-900/40 border border-overlay-subtle text-content-subtle';
                        tooltip = `${d.shortDate} (Day ${d.dayNumber}): No active pacts`;
                      }
                    } else {
                      cellContent = '·';
                      cellStyle = 'bg-bg-900/40 border border-overlay-subtle text-content-subtle';
                      tooltip = `${d.shortDate} (Day ${d.dayNumber}): Upcoming`;
                    }

                    return (
                      <div
                        key={`partner-${d.dateKey}`}
                        className="flex-1 flex justify-center py-0.5"
                        title={tooltip}
                      >
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center text-2xs font-semibold transition-all duration-200 ${cellStyle}`}
                        >
                          {cellContent}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* SHARED CHALLENGES SECTION (JOINT PACTS) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="section-title">
                <span>Active pacts with {activePartnerUsername} ({activePacts.length})</span>
              </h2>
              <button onClick={() => setChallengeModalOpen(true)} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
                <Plus size={14} />
                <span>Pledge Joint Pact</span>
              </button>
            </div>

            {activePacts.length === 0 ? (
              <EmptyState
                title="No active pacts"
                description={`Nothing running with ${activePartnerUsername} right now.`}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activePacts.map((challenge) => {
                  const today = todayKey();
                  const challengePartnership =
                    partnerships.find((p) => p.id === challenge.partnershipId) || activePartnership;

                  const isUser1ForChallenge = challengePartnership
                    ? (currentUser?.id && challengePartnership.user1Id === currentUser.id) ||
                      challengePartnership.user1Username.toLowerCase() === currentUsername.toLowerCase()
                    : isUser1InActive;

                  const myCategory = isUser1ForChallenge ? (challenge.user1Category || 'habit') : (challenge.user2Category || 'habit');
                  const myTarget = isUser1ForChallenge ? (challenge.user1Target || challenge.targetHabitName) : (challenge.user2Target || challenge.targetHabitName);

                  const partnerCategory = isUser1ForChallenge ? (challenge.user2Category || 'habit') : (challenge.user1Category || 'habit');
                  const partnerTarget = isUser1ForChallenge ? (challenge.user2Target || challenge.targetHabitName) : (challenge.user1Target || challenge.targetHabitName);

                  const myDoneDates = isUser1ForChallenge
                    ? (challenge.user1DoneDates || (challenge.user1DoneDate ? [challenge.user1DoneDate] : []))
                    : (challenge.user2DoneDates || (challenge.user2DoneDate ? [challenge.user2DoneDate] : []));
                  const partnerDoneDates = isUser1ForChallenge
                    ? (challenge.user2DoneDates || (challenge.user2DoneDate ? [challenge.user2DoneDate] : []))
                    : (challenge.user1DoneDates || (challenge.user1DoneDate ? [challenge.user1DoneDate] : []));

                  const myDone = myDoneDates.includes(today);
                  const partnerDone = partnerDoneDates.includes(today);

                  const totalCompleted = challenge.totalJointDaysCompleted ?? challenge.jointStreak ?? 0;
                  const totalProgressPercent = Math.min(100, Math.round((totalCompleted / (challenge.durationDays || 1)) * 100));

                  // Nudge Cooldown check
                  const cooldownEnd = nudgeCooldowns[challenge.id] || 0;
                  const isNudgeCooldown = Date.now() < cooldownEnd;
                  const nudgeCooldownMinutes = isNudgeCooldown ? Math.ceil((cooldownEnd - Date.now()) / 60000) : 0;

                  return (
                    <div key={challenge.id} className="card p-5 space-y-4 relative group hover:border-emerald-500/30 transition-colors">
                      <button
                        onClick={() => setChallengeToDelete(challenge)}
                        aria-label={`Delete joint pact "${challenge.title}"`}
                        className={`absolute top-4 right-4 p-1.5 text-content-disabled hover:text-rose-theme hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer ${TAP_AREA}`}
                        title="Delete Joint Pact"
                      >
                        <Trash2 size={16} />
                      </button>

                      {/* Header + Joint Streak Progress Ring */}
                      <div className="flex items-start justify-between gap-4 pr-6">
                        <div className="space-y-1">
                          <h3 className="section-title">{challenge.title}</h3>
                          <div className="flex items-center gap-2 text-xs text-content-muted">
                            <span className="figure text-success-text">
                              Streak {challenge.jointStreak}d · {totalCompleted} of {challenge.durationDays} days done
                            </span>
                          </div>
                        </div>

                        {/* Circular Progress Ring */}
                        <ProgressRing
                          value={challenge.jointStreak || 0}
                          max={challenge.durationDays || 1}
                          label="Pact streak progress"
                          tone="success"
                          size={80}
                        >
                          <Flame size={16} className="text-brand-text mb-0.5" />
                          <span className="figure text-sm text-content-primary leading-none">
                            {challenge.jointStreak}d
                          </span>
                          <span className="text-3xs text-content-muted mt-0.5">streak</span>
                        </ProgressRing>
                      </div>

                      {/* Milestone Checkpoints */}
                      <div className="grid grid-cols-4 gap-1.5 pt-1">
                        {[
                          { pct: 25, label: 'Quarter' },
                          { pct: 50, label: 'Halfway' },
                          { pct: 75, label: 'Mastery' },
                          { pct: 100, label: 'Done' },
                        ].map((m) => {
                          const achieved = totalProgressPercent >= m.pct;
                          return (
                            <div
                              key={m.pct}
                              className={`text-center py-1 px-1.5 rounded-lg text-2xs ${
                                achieved
                                  ? 'bg-emerald-500/15 text-success-text'
                                  : 'bg-overlay-subtle text-content-disabled'
                              }`}
                            >
                              <span className="block figure">{m.pct}%</span>
                              <span className="text-3xs opacity-80">{m.label}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Multi-Category Activity Targets */}
                      <div className="grid grid-cols-2 gap-2.5 text-xs p-3.5 rounded-xl border border-overlay-subtle">
                        {/* Your Commitment */}
                        <div className="space-y-1.5">
                          <span className="block text-micro text-content-muted">Your pledge ({myCategory})</span>
                          <span className="item-name text-content-secondary block truncate">{myTarget}</span>
                          <div className="pt-0.5">
                            {myDone ? (
                              <span className="text-success-text font-medium flex items-center gap-1 text-micro">
                                <CheckCircle2 size={13} /> Pledge Locked In
                              </span>
                            ) : (
                              <span className="text-warning-text font-medium flex items-center gap-1 text-micro">
                                <Clock size={12} /> Pending today
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Partner Commitment + Nudge Button */}
                        <div className="space-y-1.5 border-l border-overlay-subtle pl-2.5">
                          <span className="block text-micro text-content-muted">{activePartnerUsername}'s pledge ({partnerCategory})</span>
                          <span className="item-name text-content-secondary block truncate">{partnerTarget}</span>
                          <div className="pt-0.5">
                            {partnerDone ? (
                              <span className="text-success-text font-medium flex items-center gap-1 text-micro">
                                <CheckCircle2 size={13} /> Pledge Locked In
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={isNudgeCooldown || isKeyLoading(`nudge_${challenge.id}`)}
                                onClick={() => handleNudgePartner(challenge)}
                                className={`px-2 py-0.5 rounded-lg text-micro font-medium transition-colors flex items-center gap-1 cursor-pointer select-none ${
                                  isNudgeCooldown || isKeyLoading(`nudge_${challenge.id}`)
                                    ? 'text-content-disabled border border-overlay-subtle cursor-not-allowed opacity-60'
                                    : 'bg-amber-500/20 hover:bg-amber-500/30 text-warning-text border border-amber-500/40'
                                }`}
                              >
                                {isKeyLoading(`nudge_${challenge.id}`) ? (
                                  <AscendLoadingIndicator size="sm" />
                                ) : (
                                  <Zap size={11} className={isNudgeCooldown ? 'text-content-disabled' : 'text-warning-text fill-warning-text'} />
                                )}
                                <span>
                                  {isKeyLoading(`nudge_${challenge.id}`)
                                    ? 'Nudging...'
                                    : isNudgeCooldown
                                    ? `Nudged (${nudgeCooldownMinutes}m)`
                                    : `Nudge ${activePartnerUsername}`}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Dual-Pill Sync Status & Log Action */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1 border-t border-overlay-subtle">
                        {/* Dual-Pill Indicator */}
                        <div>
                          {myDone && partnerDone ? (
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-500/10 px-2.5 py-1 text-xs font-medium text-brand-text">
                              <CheckCircle2 size={13} /> Both locked in today
                            </div>
                          ) : myDone && !partnerDone ? (
                            <div className="badge-amber inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full">
                              <Clock size={13} /> You locked in · waiting on {activePartnerUsername}
                            </div>
                          ) : !myDone && partnerDone ? (
                            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-500/15 border border-sky-500/30 text-sky-theme text-xs font-medium rounded-full">
                              <Clock size={13} /> {activePartnerUsername} locked in · log your pledge
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1.5 text-xs text-content-muted">
                              <Clock size={13} /> Waiting on today's pledges
                            </div>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={isKeyLoading(`log_pledge_${challenge.id}`)}
                          onClick={async () => {
                            await executeWithKey(`log_pledge_${challenge.id}`, async () => {
                              try {
                                await store.logSharedChallengeHabit(challenge.id);
                              } catch (err: any) {
                                showErrorToast('Failed to log pledge', err.message || 'Your progress could not be saved.');
                              }
                            });
                          }}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer select-none flex items-center gap-1.5 ${
                            isKeyLoading(`log_pledge_${challenge.id}`)
                              ? 'opacity-70 cursor-not-allowed'
                              : ''
                          } ${
                            myDone
                              ? 'bg-emerald-500/20 text-success-text border border-emerald-500/40 hover:bg-emerald-500/30'
                              : 'bg-primary-600 hover:bg-primary-700 text-on-brand'
                          }`}
                        >
                          {isKeyLoading(`log_pledge_${challenge.id}`) ? (
                            <AscendLoadingIndicator size="sm" />
                          ) : (
                            <CheckCircle2 size={14} />
                          )}
                          <span>
                            {isKeyLoading(`log_pledge_${challenge.id}`)
                              ? 'Logging...'
                              : myDone
                              ? 'Pledge Locked In'
                              : "Log Today's Pledge"}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* PAST JOINT PACTS (COMPLETED & EXPIRED) */}
            {pastPacts.length > 0 && (
              <div className="pt-3 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowPastPacts((prev) => !prev)}
                  className="w-full flex items-center justify-between py-2 text-content-tertiary hover:text-content-primary transition-colors cursor-pointer select-none"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg font-semibold leading-snug">Past joint pacts ({pastPacts.length})</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-content-muted">
                    <span>{showPastPacts ? 'Hide' : 'Show'}</span>
                    {showPastPacts ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </div>
                </button>

                {showPastPacts && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {pastPacts.map((challenge) => {
                      const isCompleted = challenge.status === 'completed';
                      const isExpired = challenge.status === 'expired';
                      const totalCompleted = challenge.totalJointDaysCompleted ?? challenge.jointStreak ?? 0;

                      const isUser1ForChallenge =
                        (currentUser?.id && activePartnership?.user1Id === currentUser.id) ||
                        activePartnership?.user1Username.toLowerCase() === currentUsername.toLowerCase();

                      const myCategory = isUser1ForChallenge ? (challenge.user1Category || 'habit') : (challenge.user2Category || 'habit');
                      const myTarget = isUser1ForChallenge ? (challenge.user1Target || challenge.targetHabitName) : (challenge.user2Target || challenge.targetHabitName);
                      const partnerCategory = isUser1ForChallenge ? (challenge.user2Category || 'habit') : (challenge.user1Category || 'habit');
                      const partnerTarget = isUser1ForChallenge ? (challenge.user2Target || challenge.targetHabitName) : (challenge.user1Target || challenge.targetHabitName);

                      return (
                        <div
                          key={challenge.id}
                          className={`card p-5 space-y-4 relative ${
                            isCompleted ? 'border border-emerald-500/30' : 'opacity-90'
                          }`}
                        >
                          <button
                            onClick={() => setChallengeToDelete(challenge)}
                            aria-label={`Delete pact history "${challenge.title}"`}
                            className={`absolute top-4 right-4 p-1.5 text-content-disabled hover:text-rose-theme hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer ${TAP_AREA}`}
                            title="Delete Pact History"
                          >
                            <Trash2 size={16} />
                          </button>

                          <div className="flex items-start justify-between gap-3 pr-6">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <h3 className="text-lg font-semibold leading-snug text-content-secondary">{challenge.title}</h3>
                                {isCompleted ? (
                                  <span className="px-2 py-0.5 rounded-full text-2xs font-medium bg-emerald-500/20 text-success-text">
                                    Completed
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-2xs font-medium bg-amber-500/20 text-warning-text">
                                    Expired
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-content-muted">
                                {isCompleted
                                  ? `Locked in all ${challenge.durationDays} of ${challenge.durationDays} days.`
                                  : `Locked in ${totalCompleted} of ${challenge.durationDays} days.`}
                              </p>
                            </div>
                          </div>

                          {/* Multi-Category Targets Info (Read-Only) */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="block text-2xs text-content-muted">Your pledge ({myCategory})</span>
                              <span className="item-name text-content-tertiary block truncate">{myTarget}</span>
                            </div>
                            <div className="border-l border-overlay-subtle pl-2">
                              <span className="block text-2xs text-content-muted">{activePartnerUsername}'s pledge ({partnerCategory})</span>
                              <span className="item-name text-content-tertiary block truncate">{partnerTarget}</span>
                            </div>
                          </div>

                          {/* Action: Pledge New Pact if expired */}
                          <div className="flex items-center justify-between pt-1 border-t border-overlay-subtle text-xs text-content-muted">
                            <span className="text-micro italic">
                              {isCompleted ? 'Pact completed' : 'Pact ended'}
                            </span>
                            {isExpired && (
                              <button
                                type="button"
                                onClick={() => {
                                  setChallengeTitle(challenge.title);
                                  setChallengeDuration(challenge.durationDays);
                                  setUser1Category(challenge.user1Category || 'habit');
                                  setUser1Target(challenge.user1Target || challenge.targetHabitName);
                                  setUser2Category(challenge.user2Category || 'habit');
                                  setUser2Target(challenge.user2Target || challenge.targetHabitName);
                                  setChallengeModalOpen(true);
                                }}
                                className="btn-primary text-xs py-1 px-2.5 flex items-center gap-1"
                              >
                                <RotateCcw size={13} />
                                <span>Pledge New Pact</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* NO ACTIVE PARTNERS EMPTY STATE */
        <EmptyState
          icon={Users}
          title="No partners yet"
          description="Enter a friend's 6-digit user ID to send an invite. You can have up to 5 partners."
          action={
            <button onClick={() => setInviteModalOpen(true)} className="btn-secondary mx-auto text-xs flex items-center gap-1.5">
              <UserPlus size={14} />
              <span>Invite a partner</span>
            </button>
          }
        />
      )}

      {/* INVITE PARTNER MODAL */}
      <Dialog
        open={inviteModalOpen}
        onClose={() => {
          setInviteModalOpen(false);
          setInviteError(null);
        }}
        title="Invite Accountability Partner"
      >
        <form onSubmit={handleSendInviteSubmit} className="space-y-4">
          <p className="text-xs text-content-muted">
            Enter your partner's 6-digit user ID (it's in their Settings). You can have up to 5 partners.
          </p>

          <div>
            <label htmlFor="partner-invite-uid" className="block text-xs font-medium text-content-tertiary mb-1">Partner's user ID</label>
            <input
              id="partner-invite-uid"
              type="text"
              placeholder="e.g. 049201"
              value={partnerUidInput}
              onChange={(e) => {
                setPartnerUidInput(e.target.value);
                if (inviteError) setInviteError(null);
              }}
              className="w-full bg-bg-700 border border-overlay-default text-content-primary placeholder:text-content-disabled rounded-xl px-3.5 py-2.5 text-sm font-mono tabular-nums tracking-widest focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
              maxLength={6}
            />
          </div>

          {inviteError && <div className="text-xs text-rose-theme font-medium">{inviteError}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setInviteModalOpen(false);
                setInviteError(null);
              }}
              className="btn-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingInvite}
              className={`btn-primary text-xs flex items-center gap-1.5 ${
                isSubmittingInvite ? 'opacity-50 cursor-not-allowed hover:shadow-none' : ''
              }`}
            >
              {isSubmittingInvite ? (
                <AscendLoadingIndicator size="sm" />
              ) : (
                <UserPlus size={16} />
              )}
              <span>{isSubmittingInvite ? 'Sending...' : 'Send Invite'}</span>
            </button>
          </div>
        </form>
      </Dialog>

      {/* ITEM 1: START MULTI-CATEGORY SHARED CHALLENGE MODAL (PLEDGE JOINT PACT) */}
      <Dialog
        open={challengeModalOpen}
        onClose={() => {
          setChallengeModalOpen(false);
          setChallengeError(null);
        }}
        title={`Pledge Joint Pact with ${activePartnerUsername || 'Partner'}`}
        maxWidth="max-w-xl"
      >
        <form onSubmit={handleCreateChallengeSubmit} className="space-y-5">
          {/* Title */}
          <div>
            <label htmlFor="pact-create-title" className="block text-xs font-medium text-content-tertiary mb-1">Pact title</label>
            <input
              id="pact-create-title"
              type="text"
              placeholder="e.g. 14-day morning routine"
              value={challengeTitle}
              onChange={(e) => {
                setChallengeTitle(e.target.value);
                if (challengeError) setChallengeError(null);
              }}
              className={`input-field text-sm ${challengeError ? 'border-rose-500/60 focus:border-rose-500 focus:ring-rose-500/30' : ''}`}
            />
            {challengeError && (
              <div className="text-xs text-rose-theme font-medium mt-1.5 flex items-center gap-1.5">
                <AlertCircle size={14} className="shrink-0" />
                <span>{challengeError}</span>
              </div>
            )}
          </div>

          {/* Duration Selector: Visual Pill Segments */}
          <div>
            <label className="block text-xs font-medium text-content-tertiary mb-1.5">Duration</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DURATION_OPTIONS.map((opt) => {
                const isSelected = challengeDuration === opt.days;
                return (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => setChallengeDuration(opt.days)}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500/60 text-success-text'
                        : 'border-overlay-subtle hover:bg-overlay-subtle text-content-muted'
                    }`}
                  >
                    <span className="item-name text-xs">{opt.label}</span>
                    <span className="figure text-2xs text-success-text mt-0.5">{opt.bonus}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* User 1 (Your Pledge) Section */}
          <div className="rounded-xl border border-overlay-default p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <label className="block text-base font-semibold leading-tight text-success-text">
                Your daily pledge
              </label>
              <span className="text-micro text-content-disabled">Pick a category and target</span>
            </div>

            {/* Visual Category Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {CATEGORY_OPTIONS.map((cat) => {
                const Icon = cat.icon;
                const isSelected = user1Category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => {
                      setUser1Category(cat.value);
                      setUser1Target('');
                    }}
                    className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 ${
                      isSelected
                        ? `${cat.bgColor} ${cat.borderColor} ring-1 ring-emerald-400/60`
                        : 'border-overlay-subtle hover:bg-overlay-subtle text-content-muted'
                    }`}
                  >
                    <Icon size={16} className={cat.color} />
                    <span className={`text-xs font-medium ${isSelected ? 'text-content-primary' : 'text-content-tertiary'}`}>
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Target Input & Smart Suggestions */}
            <div className="space-y-1.5">
              <label htmlFor="pact-create-user1-target" className="block text-micro text-content-muted font-medium">Target</label>
              <input
                id="pact-create-user1-target"
                type="text"
                placeholder="e.g. Read 20 pages / 30m Gym / 10k Steps"
                value={user1Target}
                onChange={(e) => setUser1Target(e.target.value)}
                className="input-field text-xs"
              />

              {/* Suggestions chips */}
              <div className="space-y-1 pt-1">
                <span className="text-2xs text-content-disabled block">Suggestions</span>
                <div className="flex flex-wrap gap-1.5">
                  {(user1Category === 'habit' && userHabitNames.length > 0
                    ? userHabitNames
                    : SUGGESTIONS_BY_CATEGORY[user1Category]
                  ).slice(0, 5).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setUser1Target(suggestion)}
                      className={`text-2xs px-2 py-0.5 rounded-lg border transition-all ${
                        user1Target === suggestion
                          ? 'bg-emerald-500/20 text-success-text border-emerald-500/40'
                          : 'text-content-muted border-overlay-subtle hover:border-overlay-strong hover:text-content-secondary'
                      }`}
                    >
                      + {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* User 2 (Partner's Pledge) Section */}
          <div className="rounded-xl border border-overlay-default p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <label className="block text-base font-semibold leading-tight text-sky-theme">
                {activePartnerUsername}'s daily pledge
              </label>
              <span className="text-micro text-content-disabled">Partner objective</span>
            </div>

            {/* Visual Category Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {CATEGORY_OPTIONS.map((cat) => {
                const Icon = cat.icon;
                const isSelected = user2Category === cat.value;
                return (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => {
                      setUser2Category(cat.value);
                      setUser2Target('');
                    }}
                    className={`p-2 rounded-xl border text-left transition-all flex items-center gap-2 ${
                      isSelected
                        ? `${cat.bgColor} ${cat.borderColor} ring-1 ring-sky-400/60`
                        : 'border-overlay-subtle hover:bg-overlay-subtle text-content-muted'
                    }`}
                  >
                    <Icon size={16} className={cat.color} />
                    <span className={`text-xs font-medium ${isSelected ? 'text-content-primary' : 'text-content-tertiary'}`}>
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Partner Target Input & Suggestions */}
            <div className="space-y-1.5">
              <label htmlFor="pact-create-user2-target" className="block text-micro text-content-muted font-medium">Target</label>
              <input
                id="pact-create-user2-target"
                type="text"
                placeholder="e.g. 5km Run / Cold Shower / 30m Coding"
                value={user2Target}
                onChange={(e) => setUser2Target(e.target.value)}
                className="input-field text-xs"
              />

              {/* Suggestions chips */}
              <div className="space-y-1 pt-1">
                <span className="text-2xs text-content-disabled block">Suggestions</span>
                <div className="flex flex-wrap gap-1.5">
                  {SUGGESTIONS_BY_CATEGORY[user2Category].slice(0, 5).map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setUser2Target(suggestion)}
                      className={`text-2xs px-2 py-0.5 rounded-lg border transition-all ${
                        user2Target === suggestion
                          ? 'badge-sky'
                          : 'text-content-muted border-overlay-subtle hover:border-overlay-strong hover:text-content-secondary'
                      }`}
                    >
                      + {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setChallengeModalOpen(false)} className="btn-secondary text-xs">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingChallenge}
              className={`btn-primary text-xs flex items-center gap-1.5 ${
                isSubmittingChallenge ? 'opacity-50 cursor-not-allowed hover:shadow-none' : ''
              }`}
            >
              {isSubmittingChallenge ? (
                <AscendLoadingIndicator size="sm" />
              ) : (
                <Plus size={16} />
              )}
              <span>{isSubmittingChallenge ? 'Locking In...' : 'Lock In Pact'}</span>
            </button>
          </div>
        </form>
      </Dialog>

      {/* END PAIRING CONFIRMATION MODAL */}
      <ConfirmDeleteModal
        open={endConfirmOpen}
        onClose={() => setEndConfirmOpen(false)}
        onConfirm={async () => {
          if (activePartnership) {
            await executeWithKey(`end_partnership_${activePartnership.id}`, async () => {
              try {
                await store.endPartnership(activePartnership.id);
                showSuccessToast('Pairing ended', `You're no longer partners with ${activePartnerUsername}.`);
                setEndConfirmOpen(false);
              } catch (err: any) {
                showErrorToast('Could not end pairing', err.message || 'Please try again.');
              }
            });
          }
        }}
        isDeleting={activePartnership ? isKeyLoading(`end_partnership_${activePartnership.id}`) : false}
        title={`End Pairing with ${activePartnerUsername || 'Partner'}?`}
        itemName={activePartnerUsername || undefined}
        description={`End your partnership with ${activePartnerUsername}? All joint pacts with them will be removed.`}
        confirmText="End Partnership"
      />

      {/* DELETE SHARED CHALLENGE CONFIRMATION MODAL */}
      <ConfirmDeleteModal
        open={Boolean(challengeToDelete)}
        onClose={() => setChallengeToDelete(null)}
        onConfirm={async () => {
          if (challengeToDelete) {
            const challengeId = challengeToDelete.id;
            const challengeTitle = challengeToDelete.title;
            setChallengeToDelete(null);
            store.deleteSharedChallenge(challengeId);
            showSuccessToast('Pact removed', `Deleted "${challengeTitle}".`, `challenge_${challengeId}`);
          }
        }}
        title="Delete Joint Pact?"
        itemName={challengeToDelete?.title}
        description={`Delete "${challengeToDelete?.title}"? This removes the pact for both of you, for good.`}
        confirmText="Delete Pact"
      />

      {/* CANCEL SENT INVITE CONFIRMATION MODAL */}
      <ConfirmDeleteModal
        open={Boolean(inviteToCancel)}
        onClose={() => setInviteToCancel(null)}
        onConfirm={async () => {
          if (inviteToCancel) {
            const inviteId = inviteToCancel.id;
            const toUser = inviteToCancel.toUsername;
            setInviteToCancel(null);
            store.cancelPartnerInvite(inviteId);
            showSuccessToast('Invite cancelled', `Cancelled invite to ${toUser}.`, `invite_${inviteId}`);
          }
        }}
        title="Cancel Partner Invite?"
        itemName={`Invite to ${inviteToCancel?.toUsername}`}
        description={`Cancel your invite to ${inviteToCancel?.toUsername}?`}
        confirmText="Cancel Invite"
      />
    </div>
  );
}