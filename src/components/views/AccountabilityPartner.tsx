import { useState, useEffect, useMemo } from 'react';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { Users, UserPlus, Plus, Award, Zap, Trash2, X, Clock, CheckCircle2, Shield, Eye, EyeOff, BookOpen, Dumbbell, AlertTriangle, Sparkles, Activity, ShieldAlert, FileText, HeartHandshake } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { getCurrentTier } from '@/lib/tiers';
import { todayKey } from '@/lib/dates';
import { Partnership, SharedChallenge, SharedChallengeCategory, PartnerInvite } from '@/types';

const EMPTY_PARTNERSHIPS: Partnership[] = [];
const EMPTY_INVITES: PartnerInvite[] = [];
const EMPTY_CHALLENGES: SharedChallenge[] = [];

const CATEGORY_OPTIONS: { value: SharedChallengeCategory; label: string; icon: any; color: string }[] = [
  { value: 'habit', label: 'Habit Tracker', icon: CheckCircle2, color: 'text-emerald-400' },
  { value: 'reading', label: 'Book Reading', icon: BookOpen, color: 'text-sky-400' },
  { value: 'exercise', label: 'Exercise & Workout', icon: Dumbbell, color: 'text-amber-400' },
  { value: 'bad_habit', label: 'Bad Habit Reduction', icon: AlertTriangle, color: 'text-rose-400' },
  { value: 'skill', label: 'Skill Learning', icon: Zap, color: 'text-purple-400' },
  { value: 'journal', label: 'Daily Journaling', icon: FileText, color: 'text-indigo-400' },
  { value: 'recovery', label: 'Sobriety / Recovery', icon: ShieldAlert, color: 'text-teal-400' },
];

export function AccountabilityPartner({ store }: { store: AppStore }) {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [challengeModalOpen, setChallengeModalOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [challengeToDelete, setChallengeToDelete] = useState<SharedChallenge | null>(null);
  const [inviteToCancel, setInviteToCancel] = useState<PartnerInvite | null>(null);

  const [partnerUidInput, setPartnerUidInput] = useState('');
  
  // Shared Challenge Creation Form States
  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeDuration, setChallengeDuration] = useState(7);
  const [user1Category, setUser1Category] = useState<SharedChallengeCategory>('habit');
  const [user1Target, setUser1Target] = useState('');
  const [user2Category, setUser2Category] = useState<SharedChallengeCategory>('habit');
  const [user2Target, setUser2Target] = useState('');

  const currentUser = store.state.currentUser;
  const currentUsername = store.state.username;

  const rawPartnerships = store.state.partnerships;
  const singlePartnership = store.state.partnership;
  const partnerships = useMemo(() => {
    return rawPartnerships || (singlePartnership ? [singlePartnership] : EMPTY_PARTNERSHIPS);
  }, [rawPartnerships, singlePartnership]);

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

  // Stats visibility logic (Mutual reciprocal check)
  const user1AllowStats = activePartnership?.user1AllowStats ?? false;
  const user2AllowStats = activePartnership?.user2AllowStats ?? false;

  const currentUserAllowStats = isUser1InActive ? user1AllowStats : user2AllowStats;
  const partnerAllowStats = isUser1InActive ? user2AllowStats : user1AllowStats;
  const bothStatsAllowed = Boolean(currentUserAllowStats && partnerAllowStats);

  // Real Partner high-level stats state loaded from Supabase
  const [partnerStatsData, setPartnerStatsData] = useState<{
    totalPoints: number;
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
  const [isStatsLoading, setIsStatsLoading] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    if (activePartnerUsername && bothStatsAllowed) {
      setIsStatsLoading(true);
      store.getPartnerProfileStats(activePartnerUsername).then((res) => {
        if (mounted) {
          if (res) {
            setPartnerStatsData(res as any);
          }
          setIsStatsLoading(false);
        }
      }).catch(() => {
        if (mounted) setIsStatsLoading(false);
      });
    } else {
      setPartnerStatsData(null);
      setIsStatsLoading(false);
    }
    return () => {
      mounted = false;
    };
  }, [activePartnerUsername, bothStatsAllowed, store]);

  const partnerTotalPoints = partnerStatsData ? partnerStatsData.totalPoints : 0;
  const partnerTier = getCurrentTier(partnerTotalPoints);
  const partnerHabitsCompleted = partnerStatsData?.stats?.habitsCompletedCount ?? 0;
  const partnerHabitsCompletedToday = partnerStatsData?.stats?.habitsCompletedTodayCount ?? 0;
  const partnerCurrentStreakDays = partnerStatsData?.stats?.currentStreakDays ?? partnerStatsData?.stats?.streakDays ?? 0;
  const partnerCurrentStreakCategory = partnerStatsData?.stats?.currentStreakCategory ?? partnerStatsData?.stats?.streakSource ?? '';
  const partnerCurrentStreakIsActive = partnerStatsData?.stats?.currentStreakIsActive !== undefined
    ? partnerStatsData.stats.currentStreakIsActive
    : true;
  const partnerBestStreakDays = partnerStatsData?.stats?.bestStreakDays ?? partnerStatsData?.stats?.streakDays ?? 0;
  const partnerBestStreakCategory = partnerStatsData?.stats?.bestStreakCategory ?? partnerStatsData?.stats?.streakSource ?? '';

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
    setInviteError(null);
    const trimmed = partnerUidInput.trim();
    if (!trimmed) return;

    if (currentUser?.uid && trimmed === currentUser.uid) {
      setInviteError("You can't send an accountability invite to yourself.");
      return;
    }

    if (partnerships.length >= 5) {
      setInviteError("You've reached the maximum limit of 5 accountability partners. Remove one to add another.");
      return;
    }

    try {
      await store.sendPartnerInvite(trimmed);
      setInviteModalOpen(false);
      setPartnerUidInput('');
    } catch (err: any) {
      setInviteError(err.message || 'Failed to send invite.');
    }
  };

  const handleCreateChallengeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePartnership) return;

    const u1Target = user1Target.trim() || 'Daily Activity';
    const u2Target = user2Target.trim() || 'Daily Activity';
    const title = challengeTitle.trim() || `${user1Category.toUpperCase()} vs ${user2Category.toUpperCase()}`;

    store.createSharedChallenge(
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
  };

  const handleAcceptInvite = async (inviteId: string) => {
    setInviteError(null);
    try {
      await store.acceptPartnerInvite(inviteId);
    } catch (err: any) {
      setInviteError(err.message || 'Failed to accept invite.');
    }
  };

  const handleToggleStats = async () => {
    if (!activePartnership) return;
    const newSetting = !currentUserAllowStats;
    await store.togglePartnerStatsVisibility(activePartnership.id, newSetting);
  };

  // Challenges specific to the currently selected partner relationship (isolated!)
  const isolatedChallenges = sharedChallenges.filter(
    (c) => activePartnership && c.partnershipId === activePartnership.id
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
              <Users className="text-emerald-400" size={26} />
              Accountability Partners
            </h1>
            <span className="badge bg-emerald-500/15 text-emerald-400 font-bold text-xs px-2.5 py-1">
              {partnerships.length} / 5 Partners
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Pair with up to 5 partners, build flexible multi-category challenges, and manage reciprocal stats privacy
          </p>
        </div>

        <div>
          {partnerships.length < 5 ? (
            <button onClick={() => setInviteModalOpen(true)} className="btn-primary flex items-center gap-2">
              <UserPlus size={18} />
              <span>Invite Partner</span>
            </button>
          ) : (
            <button disabled className="btn-secondary opacity-50 cursor-not-allowed text-xs py-2 px-3">
              Partner Limit Reached (5/5)
            </button>
          )}
        </div>
      </div>

      {inviteError && (
        <div className="card p-4 border-l-4 border-rose-500 bg-rose-500/10 text-xs text-rose-300 flex items-center justify-between">
          <span>{inviteError}</span>
          <button onClick={() => setInviteError(null)} className="text-slate-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

      {/* PENDING INVITES SECTION (INCOMING & SENT) */}
      {(incomingInvites.length > 0 || sentInvites.length > 0) && (
        <div className="card p-4 space-y-3 bg-bg-800 border border-emerald-500/20">
          <h2 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
            <Clock size={16} /> Partner Requests & Invites
          </h2>

          {/* Incoming Requests */}
          {incomingInvites.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-slate-400">Incoming Partner Invites:</span>
              {incomingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between bg-bg-700/60 p-3 rounded-xl border border-white/5 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{invite.fromAvatar || '🧑'}</span>
                    <div>
                      <span className="font-bold text-slate-100">{invite.fromUsername}</span>
                      <span className="text-slate-400 ml-1.5">wants to connect as accountability partners</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAcceptInvite(invite.id)}
                      className="px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg transition-all"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => store.declinePartnerInvite(invite.id)}
                      className="px-3 py-1 bg-bg-800 hover:bg-bg-700 text-slate-300 font-semibold rounded-lg border border-white/10 transition-all"
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
              <span className="text-[11px] font-semibold text-slate-400">Sent Invites (Pending):</span>
              {sentInvites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between bg-bg-700/40 p-2.5 rounded-xl border border-white/5 text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    <Clock size={14} className="text-amber-400" />
                    <span>Invite sent to <strong>{invite.toUsername}</strong></span>
                  </div>
                  <button
                    onClick={() => setInviteToCancel(invite)}
                    className="text-xs text-rose-400 hover:text-rose-300 font-medium transition-all px-2 py-1 bg-rose-500/10 rounded-lg hover:bg-rose-500/20"
                  >
                    Cancel Invite
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MULTI-PARTNER LIST / BLOCKS SELECTION HEADER */}
      {partnerships.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Active Partner Connections ({partnerships.length}/5)</h2>
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
                  className={`p-3.5 rounded-2xl border text-left transition-all relative flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'bg-gradient-to-b from-primary-500/20 to-bg-800 border-primary-500/50 shadow-lg ring-1 ring-primary-500/40 scale-[1.02]'
                      : 'bg-bg-800 border-white/5 hover:border-white/20 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-sm">
                        {pUsername.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-sm text-slate-100 truncate max-w-[100px]">{pUsername}</span>
                    </div>
                    {isSelected && <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />}
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-white/5">
                    <span>Active Challenges:</span>
                    <span className="font-bold text-emerald-400">{pChallenges.length}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ACTIVE PARTNER ISOLATED DETAIL VIEW */}
      {activePartnership ? (
        <div className="space-y-6 animate-fade-in">
          {/* Active Relationship Sub-Header & Actions */}
          <div className="card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xl">
                  {activePartnerUsername?.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-display font-bold text-slate-100 flex items-center gap-2">
                    <span>Partner: {activePartnerUsername}</span>
                    <span className="text-xs font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">Active</span>
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">Paired on {new Date(activePartnership.pairedAt).toLocaleDateString()}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button onClick={() => setChallengeModalOpen(true)} className="btn-primary text-xs flex items-center gap-1.5">
                  <Plus size={15} />
                  <span>Start Shared Challenge</span>
                </button>
                <button onClick={() => setEndConfirmOpen(true)} className="btn-secondary text-xs text-rose-400 hover:text-rose-300 border-rose-500/30 hover:bg-rose-500/10">
                  End Pairing
                </button>
              </div>
            </div>

            {/* PART C: PER-PARTNER STATS VISIBILITY PRIVACY CARD */}
            <div className="p-3.5 bg-bg-700/50 rounded-xl border border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Shield size={16} className={currentUserAllowStats ? 'text-emerald-400' : 'text-slate-400'} />
                  <span className="text-xs font-bold text-slate-200">Share Broader Profile Stats with {activePartnerUsername}</span>
                  {bothStatsAllowed ? (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <CheckCircle2 size={11} /> Mutual Stats Access Active
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                      Mutual Opt-In Required
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400">
                  When both you and {activePartnerUsername} enable stats sharing for this specific relationship, both of you can view each other's full profile rank, total points, and total habits completed.
                </p>
              </div>

              <button
                type="button"
                onClick={handleToggleStats}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                  currentUserAllowStats
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                    : 'bg-bg-800 text-slate-300 border border-white/10 hover:bg-bg-700'
                }`}
              >
                {currentUserAllowStats ? <Eye size={14} /> : <EyeOff size={14} />}
                <span>{currentUserAllowStats ? 'Sharing Enabled ✓' : 'Sharing Off'}</span>
              </button>
            </div>

            {/* BROADER PROFILE STATS CARD (MUTUAL PER-RELATIONSHIP OPT-IN REQUIRED) */}
            {bothStatsAllowed ? (
              isStatsLoading ? (
                <div className="p-8 bg-bg-800/80 rounded-2xl border border-white/10 flex items-center justify-center gap-3 text-slate-400 text-xs">
                  <AscendLoadingIndicator size="md" />
                  <span>Loading {activePartnerUsername}'s Stats...</span>
                </div>
              ) : (
                <div className="p-4 bg-bg-800/80 rounded-2xl border border-white/10 space-y-3">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Sparkles size={15} className="text-amber-400" />
                    {activePartnerUsername}'s Broader Profile Stats
                  </span>
                  <span className="text-[11px] text-emerald-400 font-semibold">{partnerTier.name} Tier</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  <div className="p-3 bg-bg-700/50 rounded-xl border border-white/5">
                    <span className="block text-[11px] text-slate-400">Total Points</span>
                    <span className="text-base font-display font-bold text-amber-400">{partnerTotalPoints} pts</span>
                  </div>
                  <div className="p-3 bg-bg-700/50 rounded-xl border border-white/5">
                    <span className="block text-[11px] text-slate-400">
                      {partnerCurrentStreakIsActive ? 'Current Streak' : 'Current Streak (deleted)'}
                    </span>
                    <span className="text-base font-display font-bold text-orange-400">
                      {partnerCurrentStreakDays}d
                      {partnerCurrentStreakCategory ? (
                        <span className="block text-[10px] text-orange-300/90 font-medium mt-0.5">
                          {partnerCurrentStreakCategory}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="p-3 bg-bg-700/50 rounded-xl border border-white/5">
                    <span className="block text-[11px] text-slate-400">Habits Done Today</span>
                    <span className="text-base font-display font-bold text-sky-400">{partnerHabitsCompletedToday}</span>
                  </div>
                  <div className="p-3 bg-bg-700/50 rounded-xl border border-white/5">
                    <span className="block text-[11px] text-slate-400">Total Habits Done</span>
                    <span className="text-base font-display font-bold text-emerald-400">{partnerHabitsCompleted}</span>
                  </div>
                </div>
              </div>
            )) : (
              <div className="p-3.5 bg-bg-800/40 rounded-xl border border-white/5 text-center text-xs text-slate-400">
                <span>Broader profile stats hidden. Enable stats sharing above (requires mutual opt-in) to unlock full profile stats for this partner.</span>
              </div>
            )}
          </div>

          {/* ISOLATED SHARED CHALLENGES SECTION */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="section-title flex items-center gap-2">
                <Award size={18} className="text-amber-400" />
                <span>Shared Challenges with {activePartnerUsername} ({isolatedChallenges.length})</span>
              </h2>
              <button onClick={() => setChallengeModalOpen(true)} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
                <Plus size={14} />
                <span>New Challenge</span>
              </button>
            </div>

            {isolatedChallenges.length === 0 ? (
              <div className="card p-8 text-center space-y-3">
                <p className="text-sm text-slate-400">No active shared challenges with {activePartnerUsername} yet.</p>
                <button onClick={() => setChallengeModalOpen(true)} className="btn-primary mx-auto text-xs flex items-center gap-1.5">
                  <Plus size={14} />
                  <span>Start First Shared Challenge</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isolatedChallenges.map((challenge) => {
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

                  const myDone = (isUser1ForChallenge ? challenge.user1DoneDate : challenge.user2DoneDate) === today;
                  const partnerDone = (isUser1ForChallenge ? challenge.user2DoneDate : challenge.user1DoneDate) === today;

                  return (
                    <div key={challenge.id} className="card p-5 space-y-4 relative group">
                      <button
                        onClick={() => setChallengeToDelete(challenge)}
                        className="absolute top-4 right-4 p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
                        title="Delete Shared Challenge"
                      >
                        <Trash2 size={16} />
                      </button>

                      <div className="space-y-1 pr-8">
                        <h3 className="font-display font-bold text-base text-slate-100">{challenge.title}</h3>
                        <div className="flex items-center gap-2 text-xs text-slate-400">
                          <span className="font-mono text-emerald-400 font-bold">{challenge.jointStreak} / {challenge.durationDays} Days Joint Streak</span>
                        </div>
                      </div>

                      {/* Multi-Category Activity Targets */}
                      <div className="grid grid-cols-2 gap-2 text-xs p-3 bg-bg-800 rounded-xl border border-white/5">
                        <div className="space-y-1">
                          <span className="block text-[11px] text-slate-500 font-semibold">Your Commit ({myCategory}):</span>
                          <span className="font-medium text-slate-200 block truncate">{myTarget}</span>
                          <span className={myDone ? 'text-emerald-400 font-bold flex items-center gap-1' : 'text-slate-500'}>
                            {myDone ? 'Completed Today ✓' : 'Pending Today'}
                          </span>
                        </div>

                        <div className="space-y-1 border-l border-white/5 pl-2.5">
                          <span className="block text-[11px] text-slate-500 font-semibold">{activePartnerUsername} ({partnerCategory}):</span>
                          <span className="font-medium text-slate-200 block truncate">{partnerTarget}</span>
                          <span className={partnerDone ? 'text-emerald-400 font-bold flex items-center gap-1' : 'text-slate-500'}>
                            {partnerDone ? 'Completed Today ✓' : 'Pending Today'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-500">
                          Joint streak advances when both complete their targets today.
                        </span>

                        <button
                          type="button"
                          onClick={() => store.logSharedChallengeHabit(challenge.id)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                            myDone
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-primary-500 hover:bg-primary-600 text-white shadow-md'
                          }`}
                        >
                          <CheckCircle2 size={14} />
                          <span>{myDone ? 'Done Today ✓' : 'Mark Done Today'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* NO ACTIVE PARTNERS EMPYT STATE */
        <div className="card p-10 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto text-2xl">
            <Users size={32} />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h2 className="text-xl font-display font-bold text-slate-100">No Active Accountability Partners</h2>
            <p className="text-xs text-slate-400">
              Enter a partner's 6-digit User ID to send an invite. You can connect with up to 5 partners simultaneously!
            </p>
          </div>
          <button onClick={() => setInviteModalOpen(true)} className="btn-primary mx-auto flex items-center gap-2">
            <UserPlus size={18} />
            <span>Invite Accountability Partner</span>
          </button>
        </div>
      )}

      {/* INVITE PARTNER MODAL */}
      <Modal
        open={inviteModalOpen}
        onClose={() => {
          setInviteModalOpen(false);
          setInviteError(null);
        }}
        title="Invite Accountability Partner"
      >
        <form onSubmit={handleSendInviteSubmit} className="space-y-4">
          <p className="text-xs text-slate-400">
            Enter your partner's 6-digit User ID (found in their Settings page) to send them an accountability invite. You can have up to 5 active partners.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Partner's 6-digit User ID</label>
            <input
              type="text"
              placeholder="e.g. 049201"
              value={partnerUidInput}
              onChange={(e) => setPartnerUidInput(e.target.value)}
              className="w-full bg-bg-700 border border-white/10 text-slate-100 placeholder:text-slate-500 rounded-xl px-3.5 py-2.5 text-sm font-mono tracking-widest focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all shadow-inner"
              maxLength={6}
            />
          </div>

          {inviteError && <div className="text-xs text-rose-400 font-semibold">{inviteError}</div>}

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
            <button type="submit" className="btn-primary text-xs flex items-center gap-1.5">
              <UserPlus size={16} />
              <span>Send Invite</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* PART B: START MULTI-CATEGORY SHARED CHALLENGE MODAL */}
      <Modal
        open={challengeModalOpen}
        onClose={() => setChallengeModalOpen(false)}
        title={`Start Shared Challenge with ${activePartnerUsername || 'Partner'}`}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleCreateChallengeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Challenge Title</label>
            <input
              type="text"
              placeholder="e.g. 30-Day Growth Sprint"
              value={challengeTitle}
              onChange={(e) => setChallengeTitle(e.target.value)}
              className="input-field text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Challenge Duration</label>
            <select
              value={challengeDuration}
              onChange={(e) => setChallengeDuration(Number(e.target.value))}
              className="input-field text-sm bg-bg-700 text-slate-100"
            >
              <option value={7}>7 Days</option>
              <option value={14}>14 Days</option>
              <option value={30}>30 Days</option>
              <option value={90}>90 Days</option>
            </select>
          </div>

          {/* User 1 (Your Target) Category & Item Selector */}
          <div className="p-3 bg-bg-800 rounded-xl border border-white/5 space-y-3">
            <label className="block text-xs font-bold text-emerald-400">Your Activity Commitment</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Category</label>
                <select
                  value={user1Category}
                  onChange={(e) => setUser1Category(e.target.value as SharedChallengeCategory)}
                  className="input-field text-xs bg-bg-700 text-slate-100"
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Specific Target Item</label>
                {user1Category === 'habit' && store.state.habits.length > 0 ? (
                  <select
                    value={user1Target}
                    onChange={(e) => setUser1Target(e.target.value)}
                    className="input-field text-xs bg-bg-700 text-slate-100"
                  >
                    <option value="">-- Select Habit --</option>
                    {store.state.habits.map((h) => (
                      <option key={h.id} value={h.name}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                ) : user1Category === 'reading' && store.state.libraryBooks.length > 0 ? (
                  <select
                    value={user1Target}
                    onChange={(e) => setUser1Target(e.target.value)}
                    className="input-field text-xs bg-bg-700 text-slate-100"
                  >
                    <option value="">-- Select Book --</option>
                    {store.state.libraryBooks.map((b) => (
                      <option key={b.id} value={b.title}>
                        {b.title}
                      </option>
                    ))}
                  </select>
                ) : user1Category === 'skill' && store.state.skills.length > 0 ? (
                  <select
                    value={user1Target}
                    onChange={(e) => setUser1Target(e.target.value)}
                    className="input-field text-xs bg-bg-700 text-slate-100"
                  >
                    <option value="">-- Select Skill --</option>
                    {store.state.skills.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    placeholder="e.g. Read 20 pages / 30m Gym"
                    value={user1Target}
                    onChange={(e) => setUser1Target(e.target.value)}
                    className="input-field text-xs"
                  />
                )}
              </div>
            </div>
          </div>

          {/* User 2 (Partner's Target) Category & Item Selector */}
          <div className="p-3 bg-bg-800 rounded-xl border border-white/5 space-y-3">
            <label className="block text-xs font-bold text-sky-400">{activePartnerUsername}'s Activity Commitment</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Category</label>
                <select
                  value={user2Category}
                  onChange={(e) => setUser2Category(e.target.value as SharedChallengeCategory)}
                  className="input-field text-xs bg-bg-700 text-slate-100"
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat.value} value={cat.value}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Specific Target Item</label>
                <input
                  type="text"
                  placeholder="e.g. 5km Run / Cold Shower"
                  value={user2Target}
                  onChange={(e) => setUser2Target(e.target.value)}
                  className="input-field text-xs"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setChallengeModalOpen(false)} className="btn-secondary text-xs">
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs flex items-center gap-1.5">
              <Plus size={16} />
              <span>Create Shared Challenge</span>
            </button>
          </div>
        </form>
      </Modal>

      {/* END PAIRING CONFIRMATION MODAL */}
      <ConfirmDeleteModal
        open={endConfirmOpen}
        onClose={() => setEndConfirmOpen(false)}
        onConfirm={async () => {
          if (activePartnership) {
            await store.endPartnership(activePartnership.id);
            setEndConfirmOpen(false);
          }
        }}
        title={`End Pairing with ${activePartnerUsername || 'Partner'}?`}
        itemName={activePartnerUsername || undefined}
        description={`Are you sure you want to end your accountability partnership with ${activePartnerUsername}? All shared challenges with this partner will be removed.`}
        confirmText="End Partnership"
      />

      {/* DELETE SHARED CHALLENGE CONFIRMATION MODAL */}
      <ConfirmDeleteModal
        open={Boolean(challengeToDelete)}
        onClose={() => setChallengeToDelete(null)}
        onConfirm={async () => {
          if (challengeToDelete) {
            await store.deleteSharedChallenge(challengeToDelete.id);
            setChallengeToDelete(null);
          }
        }}
        title="Delete Shared Challenge?"
        itemName={challengeToDelete?.title}
        description={`Are you sure you want to delete "${challengeToDelete?.title}"? This will permanently remove the joint challenge for both partners.`}
        confirmText="Delete Challenge"
      />

      {/* CANCEL SENT INVITE CONFIRMATION MODAL */}
      <ConfirmDeleteModal
        open={Boolean(inviteToCancel)}
        onClose={() => setInviteToCancel(null)}
        onConfirm={async () => {
          if (inviteToCancel) {
            await store.cancelPartnerInvite(inviteToCancel.id);
            setInviteToCancel(null);
          }
        }}
        title="Cancel Partner Invite?"
        itemName={`Invite to ${inviteToCancel?.toUsername}`}
        description={`Are you sure you want to cancel the pending invite sent to ${inviteToCancel?.toUsername}?`}
        confirmText="Cancel Invite"
      />
    </div>
  );
}
