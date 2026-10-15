import { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Flame, AlertTriangle, RefreshCw, Activity, PhoneCall, Play, Pause, RotateCcw, Award, Trash2 } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { CravingLog, getAwardKey } from '@/types';
import { formatDateLong } from '@/lib/dates';
import { leagueNow, getSeasonNumber } from '@/lib/leagueTime';
import { wouldExceedRecoverySeasonCap, RECOVERY_POINTS } from '@/lib/pointsConfig';
import { CapMeter } from '@/components/ui/CapMeter';
import { recoverySeasonCapNote } from '@/lib/capCopy';
import { Dialog, EmptyState, PageColumns } from '@/components/ui/primitives';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { ProgressRing } from '@/components/ui/charts';
import { trustedNow } from '@/lib/clock';

const DISTRACTION_ACTIVITIES = [
  'Drink a cold glass of water slowly',
  'Do 10 deep jumping jacks or air squats',
  'Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell',
  'Step outside or look out a window for 2 minutes',
  'Listen to your favorite energetic or calming song',
  'Wash your hands or face with cold water',
  'Call or message a trusted friend or family member',
];

export function AddictionRecovery({ store }: { store: AppStore }) {
  const { showErrorToast, showSuccessToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [cravingModalOpen, setCravingModalOpen] = useState(false);
  const [setupTrackerModalOpen, setSetupTrackerModalOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [deleteTrackerConfirmOpen, setDeleteTrackerConfirmOpen] = useState(false);
  const [deleteCravingModalLog, setDeleteCravingModalLog] = useState<CravingLog | null>(null);
  const [celebrationMilestone, setCelebrationMilestone] = useState<string | null>(null);

  // Form states
  const [trackerTitle, setTrackerTitle] = useState('Sobriety');
  const [intensity, setIntensity] = useState(5);
  const [triggerText, setTriggerText] = useState('');
  const [copingText, setCopingText] = useState('');

  // Distraction index
  const [distractionIdx, setDistractionIdx] = useState(0);

  const tracker = store.state.addictionTracker;
  const cravingLogs = store.state.cravingLogs;

  const activeSeasonNum = getSeasonNumber(leagueNow());
  const revokedSet = new Set(tracker?.revokedAwardIds || []);
  const heldSeasonPoints = (tracker?.awardedMilestones || [])
    .filter((a) => !revokedSet.has(getAwardKey(a)) && a.seasonNumber === activeSeasonNum)
    .reduce((sum, a) => sum + (a.points || 0), 0);

  // Auto-check milestones on mount
  useEffect(() => {
    store.checkAddictionMilestones();
  }, [store]);

  // Calculate live streak counter
  const [timeElapsed, setTimeElapsed] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    if (!tracker?.startDate) return;

    const updateTimer = () => {
      const start = new Date(tracker.startDate).getTime();
      const now = trustedNow().getTime();
      const diff = Math.max(0, now - start);

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeElapsed({ days, hours, minutes, seconds });
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [tracker?.startDate]);

  const milestones = [
    { key: '1w', label: '1 Week Clean', requiredHours: 168, points: 10, icon: '🏅' },
    { key: '1m', label: '1 Month Clean', requiredHours: 720, points: 25, icon: '🏆' },
    { key: '90d', label: '90 Days Clean', requiredHours: 2160, points: 50, icon: '👑' },
  ];

  // Ring towards the next milestone, from the live counter (whole hours clean).
  const elapsedHours = timeElapsed.days * 24 + timeElapsed.hours;
  const nextMilestone = milestones.find((m) => elapsedHours < m.requiredHours);
  const hoursToNext = nextMilestone ? nextMilestone.requiredHours - elapsedHours : 0;

  const handleStartTracker = (e: React.FormEvent) => {
    e.preventDefault();
    store.setAddictionTracker(trackerTitle, trustedNow().toISOString());
    setSetupTrackerModalOpen(false);
  };

  const handleLogCravingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    store.logCraving(Number(intensity), triggerText, copingText);
    setCravingModalOpen(false);
    setIntensity(5);
    setTriggerText('');
    setCopingText('');
  };

  return (
    <div className="space-y-6">
      {/* Top Header + Emergency Button */}
      {/* Phones keep the button in the top-right corner too (compact), instead of a full-width row. */}
      <div className="page-header max-sm:flex-row max-sm:items-start max-sm:justify-between">
        <div>
          <h1 className="page-title">Addiction Recovery</h1>
          <p className="page-subtitle">Your sobriety streak, craving log and emergency support.</p>
        </div>

        <button
          onClick={() => setEmergencyModalOpen(true)}
          className="shrink-0 px-3 py-1.5 sm:px-4 sm:py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs shadow-sm flex items-center justify-center gap-1.5 sm:gap-2"
        >
          <PhoneCall size={14} aria-hidden="true" />
          <span>Emergency<span className="max-sm:hidden"> Support</span></span>
        </button>
      </div>

      {/* Persistent Disclaimer Banner */}
      <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 flex gap-3">
        <AlertTriangle size={16} className="text-warning-text shrink-0 mt-0.5" />
        <div className="text-xs text-content-tertiary leading-relaxed">
          <span className="font-semibold text-warning-text">Medical disclaimer:</span> This is a self-help tool. It does <span className="underline">not replace</span> medical treatment or therapy. If you are in crisis, have severe withdrawal, or a serious addiction, contact a licensed professional or a helpline (e.g. SAMHSA Helpline: 1-800-662-4357).
        </div>
      </div>

      <PageColumns
        lead={
          <>
            {/* Main Sobriety Streak Card */}
            {!tracker ? (
              <EmptyState
                icon={ShieldCheck}
                title="Set up your sobriety tracker"
                description="Pick what you're recovering from (e.g. alcohol, smoking, sugar, social media) and start tracking milestones."
                action={
                  <button onClick={() => setSetupTrackerModalOpen(true)} className="btn-primary">
                    Start Sobriety Tracker
                  </button>
                }
              />
            ) : (
              <div className="card p-6 relative overflow-hidden space-y-6">
                <div className="flex items-start justify-between gap-3 border-b border-overlay-subtle pb-4 sm:items-center">
                  <div className="min-w-0">
                    <span className="stat-label">Sobriety counter</span>
                    <h2 className="section-title mt-1">{tracker.title}</h2>
                  </div>
                  {/* Phones: the two actions stack in the corner instead of taking a row of their own. */}
                  <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <button
                      onClick={() => setResetConfirmOpen(true)}
                      className="btn-ghost text-xs text-content-muted hover:text-warning-text flex items-center gap-1.5 max-sm:px-2 max-sm:py-1"
                    >
                      <RefreshCw size={14} />
                      <span>Reset Timer</span>
                    </button>
                    <button
                      onClick={() => setDeleteTrackerConfirmOpen(true)}
                      className="btn-ghost text-xs text-content-muted hover:text-rose-theme flex items-center gap-1.5 max-sm:px-2 max-sm:py-1"
                      title="Delete sobriety tracker"
                    >
                      <Trash2 size={14} />
                      <span>Delete Tracker</span>
                    </button>
                  </div>
                </div>

                {/* Live Counter Display */}
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="p-3">
                    <div className="figure text-3xl sm:text-4xl text-rose-theme">{timeElapsed.days}</div>
                    <div className="stat-label mt-1">Days</div>
                  </div>
                  <div className="p-3">
                    <div className="figure text-3xl sm:text-4xl text-content-primary">{timeElapsed.hours}</div>
                    <div className="stat-label mt-1">Hours</div>
                  </div>
                  <div className="p-3">
                    <div className="figure text-3xl sm:text-4xl text-content-primary">{timeElapsed.minutes}</div>
                    <div className="stat-label mt-1">Mins</div>
                  </div>
                  <div className="p-3">
                    <div className="figure text-3xl sm:text-4xl text-content-primary">{timeElapsed.seconds}</div>
                    <div className="stat-label mt-1">Secs</div>
                  </div>
                </div>

                {/* Next milestone */}
                <div className="flex items-center gap-4 pt-4 border-t border-overlay-subtle">
                  <ProgressRing
                    value={nextMilestone ? elapsedHours : 1}
                    max={nextMilestone ? nextMilestone.requiredHours : 1}
                    label={nextMilestone ? `Progress to ${nextMilestone.label}` : 'All milestones reached'}
                    tone="warning"
                    size={56}
                    thickness={5}
                  >
                    <span className="text-xl" aria-hidden="true">{nextMilestone ? nextMilestone.icon : '👑'}</span>
                  </ProgressRing>
                  <div className="min-w-0">
                    <div className="stat-label">Next milestone</div>
                    {nextMilestone ? (
                      <p className="item-name text-sm mt-0.5">
                        {nextMilestone.label}{' '}
                        <span className="figure font-normal text-content-muted">
                          in {hoursToNext >= 24 ? `${Math.floor(hoursToNext / 24)}d ${hoursToNext % 24}h` : `${hoursToNext}h`}
                        </span>
                      </p>
                    ) : (
                      <p className="item-name text-sm mt-0.5">All milestones reached</p>
                    )}
                  </div>
                </div>

                {/* Milestones Celebrations */}
                <div className="space-y-3">
                  <CapMeter
                    variant="bar"
                    label="Recovery points this season"
                    earned={heldSeasonPoints}
                    cap={RECOVERY_POINTS.seasonCap}
                    note={recoverySeasonCapNote()}
                  />

                  <div className="section-title mb-3 flex items-center gap-2">
                    <Award size={16} className="text-warning-text" />
                    Milestones and badges
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {milestones.map((m) => {
                      const isUnlocked = tracker.milestonesUnlocked.includes(m.key);
                      const isAwarded = (tracker.awardedMilestones || []).some(
                        (a) => !revokedSet.has(getAwardKey(a)) && a.milestone === m.key && a.seasonNumber === activeSeasonNum
                      );
                      const isCapped = !isAwarded && wouldExceedRecoverySeasonCap(heldSeasonPoints, m.points);

                      return (
                        <button
                          key={m.key}
                          onClick={() => {
                            if (isUnlocked) setCelebrationMilestone(m.label);
                          }}
                          className={`rounded-xl p-3 flex items-center gap-3 text-left transition-colors ${
                            isUnlocked
                              ? 'bg-amber-500/10 border border-amber-500/40 text-content-secondary cursor-pointer hover:bg-amber-500/20'
                              : isCapped
                              ? 'text-content-disabled opacity-50'
                              : 'text-content-disabled opacity-60'
                          }`}
                        >
                          <span className="text-2xl">{m.icon}</span>
                          <div>
                            <div className="item-name text-xs !text-current">{m.label}</div>
                            <div className="text-2xs text-content-muted">
                              {isUnlocked
                                ? `Unlocked (+${m.points} pts)`
                                : isCapped
                                ? 'Season cap reached'
                                : `Requires ${m.requiredHours}h`}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        }
        aside={
          <>
            {/* Craving Log Section */}
            <div className="card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="section-title">Craving log and triggers</h2>
                  <p className="text-xs text-content-disabled">Log intensity (1-10), triggers and what helped.</p>
                </div>
                <button onClick={() => setCravingModalOpen(true)} className="btn-primary text-xs flex items-center gap-1.5 shrink-0">
                  <Activity size={14} />
                  <span>Log Craving</span>
                </button>
              </div>

              {cravingLogs.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No cravings logged yet"
                  description="Logging cravings shows you what triggers them and what helps."
                />
              ) : (
                <div className="space-y-3">
                  {/* Craving History */}
                  <div className="divide-y divide-overlay-subtle">
                    {cravingLogs.slice(0, 10).map((log) => (
                      <div key={log.id} className="enter-item py-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-content-secondary flex items-center gap-2">
                            Intensity: <span className={`figure ${log.intensity >= 7 ? 'text-rose-theme' : log.intensity >= 4 ? 'text-warning-text' : 'text-brand-text'}`}>{log.intensity}/10</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-content-disabled text-2xs tabular-nums">{formatDateLong(log.date)}</span>
                            <button
                              onClick={() => setDeleteCravingModalLog(log)}
                              className={`text-content-subtle hover:text-rose-theme p-0.5 transition-colors ${TAP_TARGET}`}
                              title="Delete craving log"
                              aria-label="Delete craving log"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                        {log.trigger && <p className="text-content-muted"><span className="text-content-disabled font-medium">Trigger:</span> {log.trigger}</p>}
                        {log.copingStrategy && <p className="text-success-text"><span className="text-content-disabled font-medium">Coping strategy:</span> {log.copingStrategy}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        }
      />

      {/* Emergency Support Modal (Breathing + Distraction) */}
      <Dialog open={emergencyModalOpen} onClose={() => setEmergencyModalOpen(false)} title="Emergency support" maxWidth="max-w-lg">
        <div className="space-y-6">
          {/* Guided Breathing Box */}
          <div className="card p-5 text-center border border-purple-500/30 space-y-4">
            <h3 className="text-purple-hierarchy section-title flex items-center justify-center gap-2">
              4-4-4-4 box breathing
            </h3>
            <BreathingCircle />
          </div>

          {/* Quick Distraction Activity Suggestion */}
          <div className="pt-4 space-y-3 border-t border-overlay-subtle">
            <div className="flex items-center justify-between">
              <h4 className="item-name text-sm">Quick distraction</h4>
              <button
                onClick={() => setDistractionIdx((prev) => (prev + 1) % DISTRACTION_ACTIVITIES.length)}
                className="btn-ghost text-micro text-brand-text flex items-center gap-1"
              >
                <RefreshCw size={12} /> Next Suggestion
              </button>
            </div>
            <div className="p-3 bg-primary-500/10 rounded-xl border border-primary-500/20 text-base font-medium leading-snug text-brand-text text-center">
              {DISTRACTION_ACTIVITIES[distractionIdx]}
            </div>
          </div>

          <div className="text-center pt-2">
            <button onClick={() => setEmergencyModalOpen(false)} className="btn-secondary w-full">
              Close Emergency Support
            </button>
          </div>
        </div>
      </Dialog>

      {/* Log Craving Modal */}
      <Dialog open={cravingModalOpen} onClose={() => setCravingModalOpen(false)} title="Log a craving">
        <form onSubmit={handleLogCravingSubmit} className="space-y-4">
          <div>
            <div className="flex justify-between text-xs text-content-muted mb-1">
              <span>Intensity</span>
              <span className="figure text-warning-text">{intensity} / 10</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="w-full accent-rose-500"
              id="craving-intensity"
              aria-label="Craving Intensity"
            />
          </div>

          <div>
            <label htmlFor="craving-trigger" className="block text-xs font-medium text-content-muted mb-1">What triggered this craving?</label>
            <input
              type="text"
              id="craving-trigger"
              value={triggerText}
              onChange={(e) => setTriggerText(e.target.value)}
              placeholder="e.g. Stress after work, seeing an ad, feeling lonely"
              className="input"
              required
            />
          </div>

          <div>
            <label htmlFor="craving-coping" className="block text-xs font-medium text-content-muted mb-1">Coping strategy (used or planned)</label>
            <input
              type="text"
              id="craving-coping"
              value={copingText}
              onChange={(e) => setCopingText(e.target.value)}
              placeholder="e.g. Practiced 4-4-4 breathing, drank water, went for a walk"
              className="input"
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setCravingModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Save Craving Log
            </button>
          </div>
        </form>
      </Dialog>

      {/* Setup Tracker Modal */}
      <Dialog open={setupTrackerModalOpen} onClose={() => setSetupTrackerModalOpen(false)} title="Set up sobriety tracker">
        <form onSubmit={handleStartTracker} className="space-y-4">
          <div>
            <label htmlFor="setup-tracker-title" className="block text-xs font-medium text-content-muted mb-1">What are you abstaining from?</label>
            <input
              type="text"
              id="setup-tracker-title"
              value={trackerTitle}
              onChange={(e) => setTrackerTitle(e.target.value)}
              placeholder="e.g. Alcohol, Smoking, Junk Food, Gambling"
              className="input"
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setSetupTrackerModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Start Timer Now
            </button>
          </div>
        </form>
      </Dialog>

      {/* Reset Confirmation Modal */}
      <Dialog open={resetConfirmOpen} onClose={() => setResetConfirmOpen(false)} title="Reset Sobriety Streak?">
        <div className="space-y-4 text-xs text-content-tertiary">
          <p>
            This restarts your sobriety clock from 00:00:00. A slip is a setback, not the end.
          </p>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setResetConfirmOpen(false)} className="btn-secondary flex-1">
              Keep Current Streak
            </button>
            <button
              onClick={() => {
                store.resetAddictionStreak();
                setResetConfirmOpen(false);
              }}
              className="btn-danger flex-1"
            >
              Reset Timer
            </button>
          </div>
        </div>
      </Dialog>

      {/* Milestone Unlocked Modal */}
      <Dialog open={!!celebrationMilestone} onClose={() => setCelebrationMilestone(null)} title="Milestone unlocked">
        <div className="text-center space-y-4 py-2">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary-500/15 flex items-center justify-center animate-celebrate">
            <Award size={28} className="text-brand-text" />
          </div>
          <h3 className="text-2xl font-semibold leading-tight text-content-primary">{celebrationMilestone}</h3>
          <p className="text-xs text-content-muted max-w-sm mx-auto">
            Well done. Keep going one day at a time.
          </p>
          <button onClick={() => setCelebrationMilestone(null)} className="btn-primary mx-auto">
            Done
          </button>
        </div>
      </Dialog>

      {/* Delete Tracker Modal */}
      <ConfirmDeleteModal
        open={deleteTrackerConfirmOpen}
        onClose={() => setDeleteTrackerConfirmOpen(false)}
        onConfirm={async () => {
          await executeWithKey('delete_addiction_tracker', async () => {
            await store.deleteAddictionTracker();
            setDeleteTrackerConfirmOpen(false);
            showSuccessToast('Tracker deleted', 'Sobriety tracker and history removed.', `tracker_${tracker?.id || 'main'}`);
          });
        }}
        isDeleting={isKeyLoading('delete_addiction_tracker')}
        title="Delete Sobriety Tracker?"
        itemName={tracker?.title}
        description={`Delete your "${tracker?.title}" sobriety counter? This clears the current streak and all logged cravings. Any milestone points earned will be deducted.`}
        confirmText="Delete Tracker"
      />

      {/* Delete Craving Log Modal */}
      <ConfirmDeleteModal
        open={Boolean(deleteCravingModalLog)}
        onClose={() => setDeleteCravingModalLog(null)}
        onConfirm={async () => {
          if (deleteCravingModalLog) {
            const logId = deleteCravingModalLog.id;
            await executeWithKey(`delete_craving_log_${logId}`, async () => {
              await store.deleteCravingLog(logId);
              setDeleteCravingModalLog(null);
              showSuccessToast('Log deleted', 'Craving log removed.', `craving_log_${logId}`);
            });
          }
        }}
        isDeleting={deleteCravingModalLog ? isKeyLoading(`delete_craving_log_${deleteCravingModalLog.id}`) : false}
        title="Delete Craving Log?"
        description="Delete this craving log entry?"
      />
    </div>
  );
}

// Guided Box Breathing Animated Circle
function BreathingCircle() {
  const [phase, setPhase] = useState<'Inhale' | 'Hold' | 'Exhale' | 'Rest'>('Inhale');
  const [seconds, setSeconds] = useState(4);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setSeconds((prev) => {
        if (prev > 1) return prev - 1;
        // Phase transition
        setPhase((currentPhase) => {
          switch (currentPhase) {
            case 'Inhale':
              return 'Hold';
            case 'Hold':
              return 'Exhale';
            case 'Exhale':
              return 'Rest';
            case 'Rest':
              return 'Inhale';
          }
        });
        return 4;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive]);

  const getCircleScale = () => {
    switch (phase) {
      case 'Inhale':
        return 'scale-125 bg-purple-500/30 border-purple-400';
      case 'Hold':
        return 'scale-125 bg-purple-500/40 border-purple-300';
      case 'Exhale':
        return 'scale-90 bg-purple-500/10 border-purple-500/30';
      case 'Rest':
        return 'scale-90 bg-purple-500/10 border-purple-500/20';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-4">
      <div className="relative w-36 h-36 flex items-center justify-center">
        <div
          className={`w-28 h-28 rounded-full border-2 transition-all duration-1000 flex flex-col items-center justify-center ${getCircleScale()}`}
        >
          <span className="text-xs font-medium text-purple-hierarchy">{phase}</span>
          <span className="figure text-2xl text-content-primary mt-0.5">{seconds}s</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsActive(!isActive)}
          className="btn-ghost text-xs text-purple-hierarchy flex items-center gap-1"
        >
          {isActive ? <Pause size={14} /> : <Play size={14} />}
          <span>{isActive ? 'Pause' : 'Start'}</span>
        </button>
        <button
          onClick={() => {
            setPhase('Inhale');
            setSeconds(4);
          }}
          className="btn-ghost text-xs text-content-muted flex items-center gap-1"
        >
          <RotateCcw size={14} /> Reset
        </button>
      </div>
    </div>
  );
}
