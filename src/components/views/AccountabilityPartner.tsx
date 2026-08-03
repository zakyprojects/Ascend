import { useState, useEffect } from 'react';
import { Users, UserPlus, Plus, CheckCircle2, XCircle, Bell, Award, Flame, Zap, Shield, HeartHandshake, Trash2, ArrowRight } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { getCurrentTier } from '@/lib/tiers';
import { TierBadge } from '@/components/ui/TierBadge';

export function AccountabilityPartner({ store }: { store: AppStore }) {
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [challengeModalOpen, setChallengeModalOpen] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);

  const [partnerUidInput, setPartnerUidInput] = useState('');
  const [challengeHabitName, setChallengeHabitName] = useState('30-min Exercise');
  const [challengeDuration, setChallengeDuration] = useState(7);

  const currentUser = store.state.currentUser;
  const currentUsername = store.state.username;
  const partnership = store.state.partnership;
  const partnerInvites = store.state.partnerInvites;
  const sharedChallenges = store.state.sharedChallenges;
  const partnerNotifications = store.state.partnerNotifications;

  // Compute active partner username
  const partnerUsername = partnership
    ? partnership.user1Username.toLowerCase() === currentUsername.toLowerCase()
      ? partnership.user2Username
      : partnership.user1Username
    : null;

  // Real Partner high-level stats state loaded from Supabase
  const [partnerStatsData, setPartnerStatsData] = useState<{ totalPoints: number; stats: any; avatar?: string } | null>(null);

  useEffect(() => {
    let mounted = true;
    if (partnerUsername) {
      store.getPartnerProfileStats(partnerUsername).then((res) => {
        if (mounted && res) {
          setPartnerStatsData(res);
        }
      });
    } else {
      setPartnerStatsData(null);
    }
    return () => {
      mounted = false;
    };
  }, [partnerUsername, store]);

  const partnerTotalPoints = partnerStatsData ? partnerStatsData.totalPoints : 0;
  const partnerTier = getCurrentTier(partnerTotalPoints);
  const partnerHabitsCompleted = partnerStatsData?.stats?.habitsCompletedCount ?? 0;
  const partnerStreakDays = partnerStatsData?.stats?.streakDays ?? 0;

  const pendingIncomingInvites = partnerInvites.filter(
    (i) => i.toUsername.toLowerCase() === currentUsername.toLowerCase() && i.status === 'pending'
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
    if (!challengeHabitName.trim()) return;
    store.createSharedChallenge(challengeHabitName, Number(challengeDuration));
    setChallengeModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
            <Users className="text-emerald-400" size={26} />
            Accountability Partner & Shared Challenges
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Pair with a partner, share high-level progress summaries, send encouragement, and tackle joint streak challenges
          </p>
        </div>

        {!partnership && (
          <button onClick={() => setInviteModalOpen(true)} className="btn-primary flex items-center gap-2">
            <UserPlus size={18} />
            <span>Invite Partner</span>
          </button>
        )}
      </div>

      {/* Notifications Box (Missed habit alerts & encouragements) */}
      {partnerNotifications.length > 0 && (
        <div className="space-y-2">
          <h2 className="section-title flex items-center gap-2 text-rose-400">
            <Bell size={18} />
            Partner Encouragement Notifications
          </h2>
          {partnerNotifications.map((notif) => (
            <div key={notif.id} className="card p-4 border-l-4 border-rose-500 bg-rose-500/10 flex items-center justify-between gap-3">
              <div className="text-xs text-slate-200">
                <span className="font-bold text-rose-300">Encouragement Triggered: </span>
                {notif.message}
              </div>
              <button
                onClick={() => store.dismissPartnerNotification(notif.id)}
                className="btn-ghost text-xs text-slate-400 hover:text-slate-200 shrink-0"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pending Incoming Invites */}
      {pendingIncomingInvites.length > 0 && !partnership && (
        <div className="card p-4 border-l-4 border-emerald-500 bg-emerald-500/10 space-y-3">
          <h3 className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Incoming Partner Requests</h3>
          {pendingIncomingInvites.map((invite) => (
            <div key={invite.id} className="flex items-center justify-between bg-bg-800 p-3 rounded-xl border border-white/5">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{invite.fromAvatar || '🧑'}</span>
                <div>
                  <div className="text-xs font-bold text-slate-200">{invite.fromUsername}</div>
                  <div className="text-[10px] text-slate-400">Wants to become your accountability partner</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => store.acceptPartnerInvite(invite.id)}
                  className="btn-primary text-xs py-1 px-3"
                >
                  Accept
                </button>
                <button
                  onClick={() => store.declinePartnerInvite(invite.id)}
                  className="btn-secondary text-xs py-1 px-3"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ACTIVE PARTNER VIEW */}
      {partnership ? (
        <div className="space-y-6">
          {/* Partner High-Level Progress Card */}
          <div className="card p-6 space-y-4 relative overflow-hidden bg-bg-800 border border-emerald-500/30">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl font-bold border border-emerald-500/40">
                  {partnerStatsData?.avatar || '🧑'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-100">{partnerUsername}</h2>
                    <span className="badge bg-emerald-500/15 text-emerald-400 text-[10px] font-bold">Active Partner</span>
                  </div>
                  <p className="text-xs text-slate-400">Paired since {partnership.pairedAt.split('T')[0]}</p>
                </div>
              </div>

              <button
                onClick={() => setEndConfirmOpen(true)}
                className="btn-ghost text-xs text-slate-500 hover:text-rose-400 flex items-center gap-1"
              >
                <Trash2 size={15} /> End Pairing
              </button>
            </div>

            {/* High-level progress summary metrics (baseline privacy respected) */}
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
                  <span>{partnerStreakDays} days streak ({partnerHabitsCompleted} habits done)</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 italic">
              Note: Detailed journal entries and specific habit names remain private unless partner profile privacy is explicitly set to visible.
            </p>
          </div>

          {/* Shared Challenges Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="section-title">Shared Streak Challenges</h2>
                <p className="text-xs text-slate-500">Commit to a habit together — joint streak advances only when both partners complete their daily target!</p>
              </div>
              <button onClick={() => setChallengeModalOpen(true)} className="btn-primary text-xs flex items-center gap-1.5">
                <Plus size={16} />
                <span>Start Shared Challenge</span>
              </button>
            </div>

            {sharedChallenges.length === 0 ? (
              <div className="card p-6 text-center text-xs text-slate-500">
                No shared challenges active yet. Click "Start Shared Challenge" to embark on a joint streak with {partnerUsername}!
              </div>
            ) : (
              <div className="space-y-3">
                {sharedChallenges.map((challenge) => (
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
                    </div>

                    <div className="flex items-center justify-between bg-bg-800 p-3 rounded-xl border border-white/5 text-xs">
                      <div>
                        <span className="text-slate-500">Your status today: </span>
                        <span className="font-bold text-emerald-400">
                          {challenge.user1DoneDate === store.state.habits[0]?.completions[0] ? 'Completed ✓' : 'Pending'}
                        </span>
                      </div>
                      <button
                        onClick={() => store.logSharedChallengeHabit(challenge.id)}
                        className="btn-primary text-xs py-1 px-3"
                      >
                        Log Challenge Habit Completed
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* NO PARTNER VIEW */
        <div className="card p-8 text-center space-y-4">
          <Users size={36} className="mx-auto text-emerald-400" />
          <h2 className="text-lg font-bold text-slate-100">Find an Accountability Partner</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Research shows that having a dedicated accountability partner increases goal success rates by up to 95%. Invite a friend or fellow member by username to stay on track together.
          </p>
          <button onClick={() => setInviteModalOpen(true)} className="btn-primary mx-auto">
            Invite Accountability Partner
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
          {inviteError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-400 font-medium">
              {inviteError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Partner's 6-Digit User ID (UID) *
            </label>
            <input
              type="text"
              maxLength={6}
              value={partnerUidInput}
              onChange={(e) => {
                setPartnerUidInput(e.target.value);
                if (inviteError) setInviteError(null);
              }}
              placeholder="e.g. 849201 or 100001"
              className="input font-mono tracking-widest text-sm"
              required
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Ask your partner for their 6-digit User ID (found in Settings under Profile Identity).
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setInviteModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Send Invite
            </button>
          </div>
        </form>
      </Modal>

      {/* Start Challenge Modal */}
      <Modal open={challengeModalOpen} onClose={() => setChallengeModalOpen(false)} title="Start Joint Challenge">
        <form onSubmit={handleCreateChallengeSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Target Habit / Goal</label>
            <input
              type="text"
              value={challengeHabitName}
              onChange={(e) => setChallengeHabitName(e.target.value)}
              placeholder="e.g. 30-min Exercise, Morning Meditation"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Challenge Duration</label>
            <select
              value={challengeDuration}
              onChange={(e) => setChallengeDuration(Number(e.target.value))}
              className="input"
            >
              <option value="7">7 Days</option>
              <option value="14">14 Days</option>
              <option value="30">30 Days</option>
            </select>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setChallengeModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Start Challenge
            </button>
          </div>
        </form>
      </Modal>

      {/* End Pairing Confirm Modal */}
      <Modal open={endConfirmOpen} onClose={() => setEndConfirmOpen(false)} title="End Accountability Partnership?">
        <div className="space-y-4 text-xs text-slate-300">
          <p>
            Ending this pairing will return both you and {partnerUsername} to no-partner status. Active joint challenges will be ended.
          </p>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setEndConfirmOpen(false)} className="btn-secondary flex-1">
              Keep Partner
            </button>
            <button
              onClick={() => {
                store.endPartnership();
                setEndConfirmOpen(false);
              }}
              className="btn-danger flex-1"
            >
              End Pairing
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
