import { useState, useEffect } from 'react';
import { Users, UserPlus, Plus, Award, Zap, Trash2, X, Clock, CheckCircle2 } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { getCurrentTier } from '@/lib/tiers';
import { todayKey } from '@/lib/dates';
import { Partnership, SharedChallenge } from '@/types';

export function AccountabilityPartner({ store }: { store: AppStore }) {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [challengeModalOpen, setChallengeModalOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [challengeToDelete, setChallengeToDelete] = useState<SharedChallenge | null>(null);

  const [partnerUidInput, setPartnerUidInput] = useState('');
  const [challengeHabitName, setChallengeHabitName] = useState('30-min Exercise');
  const [challengeDuration, setChallengeDuration] = useState(7);

  const currentUser = store.state.currentUser;
  const currentUsername = store.state.username;
  const partnerships = store.state.partnerships || (store.state.partnership ? [store.state.partnership] : []);
  const partnerInvites = store.state.partnerInvites || [];
  const sharedChallenges = store.state.sharedChallenges || [];

  // Selected partner state (defaults to first partner if not set or out of bounds)
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

  // Active selected partner username
  const activePartnerUsername = activePartnership
    ? activePartnership.user1Username.toLowerCase() === currentUsername.toLowerCase()
      ? activePartnership.user2Username
      : activePartnership.user1Username
    : null;

  // Real Partner high-level stats state loaded from Supabase
  const [partnerStatsData, setPartnerStatsData] = useState<{
    totalPoints: number;
    stats: {
      streakDays: number;
      habitsCompletedCount: number;
      habitsCompletedTodayCount?: number;
      exerciseMinutes?: number;
      journalEntriesCount?: number;
      booksRead?: number;
    };
    avatar?: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    if (activePartnerUsername) {
      store.getPartnerProfileStats(activePartnerUsername).then((res) => {
        if (mounted && res) {
          setPartnerStatsData(res as any);
        }
      });
    } else {
      setPartnerStatsData(null);
    }
    return () => {
      mounted = false;
    };
  }, [activePartnerUsername, store]);

  const partnerTotalPoints = partnerStatsData ? partnerStatsData.totalPoints : 0;
  const partnerTier = getCurrentTier(partnerTotalPoints);
  const partnerHabitsCompleted = partnerStatsData?.stats?.habitsCompletedCount ?? 0;
  const partnerHabitsCompletedToday = partnerStatsData?.stats?.habitsCompletedTodayCount ?? 0;
  const partnerStreakDays = partnerStatsData?.stats?.streakDays ?? 0;

  // Pending incoming & sent invites
  const incomingInvites = partnerInvites.filter(
    (i) => i.toUsername.toLowerCase() === currentUsername.toLowerCase() && i.status === 'pending'
  );

  const sentInvites = partnerInvites.filter(
    (i) =>
      (i.fromUserId === currentUser?.id || i.fromUsername.toLowerCase() === currentUsername.toLowerCase()) &&
      i.status === 'pending'
  );

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
    if (!challengeHabitName.trim() || !activePartnership) return;
    store.createSharedChallenge(challengeHabitName, Number(challengeDuration), activePartnership.id);
    setChallengeModalOpen(false);
  };

  const handleAcceptInvite = async (inviteId: string) => {
    setInviteError(null);
    try {
      await store.acceptPartnerInvite(inviteId);
    } catch (err: any) {
      setInviteError(err.message || 'Failed to accept invite.');
    }
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
            Pair with up to 5 partners, track isolated joint streaks, and share real habit progress
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
                      <div className="font-bold text-slate-200">{invite.fromUsername}</div>
                      <div className="text-[10px] text-slate-400">Sent you an accountability partner request</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAcceptInvite(invite.id)}
                      className="btn-primary text-xs py-1 px-3"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => store.declinePartnerInvite(invite.id)}
                      className="btn-secondary text-xs py-1 px-3 text-slate-400 hover:text-white"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Invites Banner */}
      {inviteError && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 p-3 rounded-xl text-xs font-semibold flex items-center justify-between">
          <span>{inviteError}</span>
          <button onClick={() => setInviteError(null)} className="text-rose-400 hover:text-white">
            <X size={14} />
          </button>
        </div>
      )}

          {/* Sent Invites */}
          {sentInvites.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-semibold text-slate-400">Sent Invites (Pending):</span>
              {sentInvites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between bg-bg-700/60 p-3 rounded-xl border border-white/5 text-xs">
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">📩</span>
                    <div>
                      <div className="font-bold text-slate-200">To: {invite.toUsername}</div>
                      <div className="text-[10px] text-slate-400">Waiting for partner to accept</div>
                    </div>
                  </div>
                  <button
                    onClick={() => store.cancelPartnerInvite(invite.id)}
                    className="btn-secondary text-xs py-1 px-3 text-rose-400 hover:text-rose-300"
                  >
                    Cancel Invite
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MULTI-PARTNER BLOCK CARDS LIST */}
      {partnerships.length > 0 ? (
        <div className="space-y-6">
          {/* Partner Selector Tabs / Cards */}
          <div>
            <span className="text-xs font-semibold text-slate-400 block mb-2">Active Partners:</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {partnerships.map((p) => {
                const pUsername =
                  p.user1Username.toLowerCase() === currentUsername.toLowerCase() ? p.user2Username : p.user1Username;
                const isSelected = p.id === activePartnership?.id;
                const pChallenges = sharedChallenges.filter((c) => c.partnershipId === p.id);

                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPartnerId(p.id)}
                    className={`card p-3 text-left transition-all relative overflow-hidden flex items-center justify-between gap-2 border ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                        : 'border-white/5 bg-bg-800 hover:border-emerald-500/30'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-base shrink-0 border border-emerald-500/30">
                        🧑
                      </div>
                      <div className="truncate">
                        <div className="font-bold text-slate-100 text-xs truncate">{pUsername}</div>
                        <div className="text-[10px] text-slate-400">{pChallenges.length} shared challenge(s)</div>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0 shadow-sm shadow-emerald-400" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SELECTED PARTNER DETAIL VIEW (ISOLATED) */}
          {activePartnership && activePartnerUsername && (
            <div className="space-y-6">
              {/* Partner Overview Card (PART A: Real Data Stats) */}
              <div className="card p-6 space-y-4 relative overflow-hidden bg-bg-800 border border-emerald-500/30">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl font-bold border border-emerald-500/40">
                      {partnerStatsData?.avatar || '🧑'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-slate-100">{activePartnerUsername}</h2>
                        <span className="badge bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                          Active Partner
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">Paired since {activePartnership.pairedAt.split('T')[0]}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => setEndConfirmOpen(true)}
                    className="btn-ghost text-xs text-slate-500 hover:text-rose-400 flex items-center gap-1"
                  >
                    <Trash2 size={15} /> End Pairing
                  </button>
                </div>

                {/* High-level progress summary metrics (REAL DATA) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="bg-bg-700/60 p-3 rounded-xl border border-white/5">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Current Rank Tier</div>
                    <div className="text-sm font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
                      <Award size={16} />
                      <span>{partnerTier.name}</span>
                    </div>
                  </div>

                  <div className="bg-bg-700/60 p-3 rounded-xl border border-white/5">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Lifetime Points</div>
                    <div className="text-sm font-bold text-slate-100 mt-1">
                      {partnerTotalPoints.toLocaleString()} pts
                    </div>
                  </div>

                  <div className="bg-bg-700/60 p-3 rounded-xl border border-white/5">
                    <div className="text-[10px] text-slate-400 uppercase font-semibold">Active Streak</div>
                    <div className="text-sm font-bold text-blue-400 mt-1 flex items-center gap-1.5">
                      <Zap size={16} />
                      <span>
                        {partnerStreakDays} days streak ({partnerHabitsCompletedToday} done today, {partnerHabitsCompleted} lifetime)
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 italic">
                  Note: Metrics reflect live account statistics for {activePartnerUsername}.
                </p>
              </div>

              {/* Shared Challenges Section for Active Partner */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="section-title">Shared Streak Challenges with {activePartnerUsername}</h2>
                    <p className="text-xs text-slate-500">
                      Joint streak advances only when BOTH you and {activePartnerUsername} complete your daily target!
                    </p>
                  </div>
                  <button onClick={() => setChallengeModalOpen(true)} className="btn-primary text-xs flex items-center gap-1.5">
                    <Plus size={16} />
                    <span>Start Shared Challenge</span>
                  </button>
                </div>

                {isolatedChallenges.length === 0 ? (
                  <div className="card p-6 text-center text-xs text-slate-500">
                    No shared challenges active yet with {activePartnerUsername}. Click "Start Shared Challenge" to embark on a joint streak!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {isolatedChallenges.map((challenge) => {
                      const today = todayKey();
                      const isUser1 =
                        (currentUser?.id && activePartnership.user1Id === currentUser.id) ||
                        activePartnership.user1Username.toLowerCase() === currentUsername.toLowerCase();

                      const userDoneDate = isUser1 ? challenge.user1DoneDate : challenge.user2DoneDate;
                      const partnerDoneDate = isUser1 ? challenge.user2DoneDate : challenge.user1DoneDate;

                      const linkedHabit = store.state.habits.find(
                        (h) => h.name.trim().toLowerCase() === challenge.targetHabitName.trim().toLowerCase()
                      );
                      const isLinkedHabitDoneToday = linkedHabit ? linkedHabit.completions.includes(today) : false;
                      const isUserDoneToday = userDoneDate === today || isLinkedHabitDoneToday;
                      const isPartnerDoneToday = partnerDoneDate === today;

                      return (
                        <div key={challenge.id} className="card p-4 space-y-3 border-l-4 border-emerald-500">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                                {challenge.title}
                                <span className="badge bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">
                                  {challenge.jointStreak} / {challenge.durationDays} days joint streak
                                </span>
                              </h3>
                              <p className="text-xs text-slate-400">Target habit: {challenge.targetHabitName}</p>
                            </div>
                            <button
                              onClick={() => setChallengeToDelete(challenge)}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                              title="Delete Shared Challenge"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-bg-800 p-3 rounded-xl border border-white/5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <span className="text-slate-400">Your status today: </span>
                                <span className={`font-bold ${isUserDoneToday ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  {isUserDoneToday ? 'Completed ✓' : 'Pending'}
                                </span>
                              </div>
                              <button
                                onClick={() => store.logSharedChallengeHabit(challenge.id)}
                                className={`text-xs py-1 px-3 font-semibold rounded-lg transition-all ${
                                  isUserDoneToday
                                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                                    : 'btn-primary'
                                }`}
                              >
                                {isUserDoneToday ? 'Mark Pending' : 'Log Habit Completed'}
                              </button>
                            </div>

                            <div className="flex items-center justify-between sm:border-l sm:border-white/10 sm:pl-3">
                              <span className="text-slate-400">{activePartnerUsername}'s status: </span>
                              <span className={`font-bold ${isPartnerDoneToday ? 'text-emerald-400' : 'text-slate-400'}`}>
                                {isPartnerDoneToday ? 'Completed ✓' : 'Pending'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* NO PARTNERS YET VIEW */
        <div className="card p-8 text-center space-y-4">
          <Users size={40} className="mx-auto text-emerald-400" />
          <h2 className="text-lg font-bold text-slate-100">Find Accountability Partners</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            You can add up to 5 accountability partners! Research shows that having dedicated accountability partners increases goal success rates by up to 95%.
          </p>
          <button onClick={() => setInviteModalOpen(true)} className="btn-primary mx-auto flex items-center gap-2">
            <UserPlus size={18} />
            <span>Invite Accountability Partner</span>
          </button>
        </div>
      )}

      {/* Invite Partner Modal */}
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

      {/* Create Shared Challenge Modal */}
      <Modal
        open={challengeModalOpen}
        onClose={() => setChallengeModalOpen(false)}
        title={`Start Shared Challenge with ${activePartnerUsername || 'Partner'}`}
      >
        <form onSubmit={handleCreateChallengeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Target Habit Name</label>
            <input
              type="text"
              placeholder="e.g. 30-min Exercise"
              value={challengeHabitName}
              onChange={(e) => setChallengeHabitName(e.target.value)}
              className="input-field text-sm"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Tip: If this matches a habit in your Habit Tracker, ticking it will automatically complete your status today!
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Challenge Duration (Days)</label>
            <select
              value={challengeDuration}
              onChange={(e) => setChallengeDuration(Number(e.target.value))}
              className="input-field text-sm"
            >
              <option value={7}>7 Days</option>
              <option value={14}>14 Days</option>
              <option value={30}>30 Days</option>
              <option value={60}>60 Days</option>
              <option value={90}>90 Days</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setChallengeModalOpen(false)} className="btn-secondary text-xs">
              Cancel
            </button>
            <button type="submit" className="btn-primary text-xs">
              Create Challenge
            </button>
          </div>
        </form>
      </Modal>

      {/* End Pairing Confirmation Modal */}
      <Modal
        open={endConfirmOpen}
        onClose={() => setEndConfirmOpen(false)}
        title={`End Pairing with ${activePartnerUsername || 'Partner'}`}
      >
        <div className="space-y-4 text-xs text-slate-300">
          <p>
            Are you sure you want to end your accountability pairing with <strong className="text-emerald-400">{activePartnerUsername}</strong>?
          </p>
          <p className="text-slate-400">
            This will remove this partnership block and free up a slot for a new accountability partner. Shared challenges with {activePartnerUsername} will be removed.
          </p>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setEndConfirmOpen(false)} className="btn-secondary text-xs">
              Keep Partner
            </button>
            <button
              onClick={() => {
                if (activePartnership) {
                  store.endPartnership(activePartnership.id);
                }
                setEndConfirmOpen(false);
              }}
              className="btn-primary text-xs bg-rose-600 hover:bg-rose-500 border-rose-500"
            >
              End Pairing
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Shared Challenge Confirmation Modal */}
      <Modal
        open={!!challengeToDelete}
        onClose={() => setChallengeToDelete(null)}
        title="Delete Shared Challenge"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-300">
            Are you sure you want to delete <strong className="text-white">{challengeToDelete?.title}</strong>?
          </p>
          <p className="text-xs text-slate-400">
            This will permanently remove this challenge and its joint streak progress for both you and {activePartnerUsername}. Your partnership will remain active.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setChallengeToDelete(null)} className="btn-secondary text-xs">
              Cancel
            </button>
            <button
              onClick={async () => {
                if (challengeToDelete) {
                  await store.deleteSharedChallenge(challengeToDelete.id);
                  setChallengeToDelete(null);
                }
              }}
              className="btn-primary text-xs bg-rose-600 hover:bg-rose-500 border-rose-500 flex items-center gap-1.5"
            >
              <Trash2 size={14} />
              <span>Delete Challenge</span>
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
