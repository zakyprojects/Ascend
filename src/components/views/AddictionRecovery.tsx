import { useState, useEffect } from 'react';
import { HeartPulse, AlertTriangle, RefreshCw, Activity, PhoneCall, Play, Pause, RotateCcw, Trash2, Medal, Trophy, Crown, Check, Plus } from 'lucide-react';
import { AppStore, CLEAR_CRAVING_LOGS_MAX } from '@/lib/store';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { useAsyncActionKey } from '@/lib/useAsyncAction';
import { CravingLog } from '@/types';
import { recoveryAwardsThisSeason, RecoveryMilestoneKey, RECOVERY_MILESTONES } from '@/lib/recoveryAwards';
import { formatDateLong, todayKey, startOfWeek } from '@/lib/dates';
import { wouldExceedRecoverySeasonCap, RECOVERY_POINTS, SOBRIETY_MILESTONE_POINTS } from '@/lib/pointsConfig';
import { CapMeter } from '@/components/ui/CapMeter';
import { PageHero } from '@/components/ui/PageHero';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { Dialog, Disclosure, EmptyState, Form, Input, PageColumns } from '@/components/ui/primitives';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { TAP_TARGET, cx } from '@/components/ui/primitives/shared';
import { trustedNow } from '@/lib/clock';

const CRAVINGS_PAGE = 10;

const DISTRACTION_ACTIVITIES = [
  'Drink a cold glass of water slowly',
  'Do 10 deep jumping jacks or air squats',
  'Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell',
  'Step outside or look out a window for 2 minutes',
  'Listen to your favorite energetic or calming song',
  'Wash your hands or face with cold water',
  'Call or message a trusted friend or family member',
];

const MILESTONE_ICON: Record<RecoveryMilestoneKey, typeof Medal> = { '1w': Medal, '1m': Trophy, '90d': Crown };

const formatSpan = (hours: number): string => {
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return d > 0 ? `${d}d ${h}h` : `${h}h`;
};

/** The craving's local day, or null when its timestamp does not parse. */
const cravingDay = (log: CravingLog): string | null => {
  const at = new Date(log.date);
  return Number.isNaN(at.getTime()) ? null : todayKey(at);
};

export function AddictionRecovery({ store }: { store: AppStore }) {
  const { showSuccessToast } = useToast();
  const { isKeyLoading, executeWithKey } = useAsyncActionKey();
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [cravingModalOpen, setCravingModalOpen] = useState(false);
  const [setupTrackerModalOpen, setSetupTrackerModalOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [deleteTrackerConfirmOpen, setDeleteTrackerConfirmOpen] = useState(false);
  const [deleteCravingModalLog, setDeleteCravingModalLog] = useState<CravingLog | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [cravingsShown, setCravingsShown] = useState(CRAVINGS_PAGE);

  // Form states
  const [trackerTitle, setTrackerTitle] = useState('Sobriety');
  const [intensity, setIntensity] = useState(5);
  const [triggerText, setTriggerText] = useState('');
  const [copingText, setCopingText] = useState('');
  const [distractionIdx, setDistractionIdx] = useState(0);

  const tracker = store.state.addictionTracker;
  const cravingLogs = store.state.cravingLogs;

  // Milestone points come from the server's ledger rows, not from the tracker document.
  const seasonAwards = recoveryAwardsThisSeason(store.state.pointsHistory || [], tracker?.id, trustedNow().getTime());
  const heldSeasonPoints = Array.from(seasonAwards.values()).reduce((sum, p) => sum + p, 0);

  useEffect(() => {
    store.checkAddictionMilestones();
  }, [store]);

  // Live time clean, refreshed every 15 seconds (minutes are the smallest unit shown).
  const [nowMs, setNowMs] = useState(() => trustedNow().getTime());
  useEffect(() => {
    if (!tracker?.startDate) return;
    setNowMs(trustedNow().getTime());
    const timer = setInterval(() => setNowMs(trustedNow().getTime()), 15000);
    return () => clearInterval(timer);
  }, [tracker?.startDate]);

  const startMs = tracker ? new Date(tracker.startDate).getTime() : NaN;
  const elapsedMs = Number.isNaN(startMs) ? 0 : Math.max(0, nowMs - startMs);
  const elapsedHours = Math.floor(elapsedMs / 3600000);
  const days = Math.floor(elapsedHours / 24);
  const hours = elapsedHours % 24;
  const minutes = Math.floor((elapsedMs % 3600000) / 60000);

  const nextMilestone = RECOVERY_MILESTONES.find((m) => elapsedHours < m.hours);
  const prevHours = nextMilestone ? RECOVERY_MILESTONES[RECOVERY_MILESTONES.indexOf(nextMilestone) - 1]?.hours ?? 0 : 0;

  // Cravings: newest first; "Clear older cravings" removes those before this week's Monday.
  const sortedCravings = [...cravingLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const weekStartKey = todayKey(startOfWeek());
  const cravingsThisWeek = cravingLogs.filter((l) => (cravingDay(l) ?? '') >= weekStartKey).length;
  const olderCravingCount = cravingLogs.filter((l) => {
    const day = cravingDay(l);
    return day !== null && day < weekStartKey;
  }).length;

  const cravingForm = useUnsavedChanges(cravingModalOpen, [intensity, triggerText, copingText] as const, {
    key: 'recovery-craving',
    restore: ([i, t, c]) => {
      setIntensity(i);
      setTriggerText(t);
      setCopingText(c);
    },
  });
  const setupForm = useUnsavedChanges(setupTrackerModalOpen, trackerTitle);

  // Every open starts clean.
  const openCravingModal = () => {
    setIntensity(5);
    setTriggerText('');
    setCopingText('');
    setCravingModalOpen(true);
  };

  const handleStartTracker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackerTitle.trim()) return;
    store.setAddictionTracker(trackerTitle.trim(), trustedNow().toISOString());
    setSetupTrackerModalOpen(false);
  };

  const handleLogCravingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!triggerText.trim() || !copingText.trim()) return;
    store.logCraving(intensity, triggerText, copingText);
    setCravingModalOpen(false);
    showSuccessToast('Craving logged', 'Well done for noticing it.');
  };

  const pointsLine =
    heldSeasonPoints > 0
      ? `This streak's ${heldSeasonPoints} milestone points from this season come off. Earlier seasons keep theirs, and your new streak can earn the milestones again.`
      : 'No points change: this streak holds no milestone points this season.';

  return (
    <div className="space-y-6">
      <div className="page-header max-sm:flex-row max-sm:items-start max-sm:justify-between">
        <div>
          <h1 className="page-title">Recovery</h1>
          <p className="page-subtitle">Your clean streak, cravings and support when it gets hard.</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => setEmergencyModalOpen(true)}
            className="btn bg-rose-600 hover:bg-rose-500 text-white max-sm:px-3 max-sm:py-1.5 max-sm:text-xs"
          >
            <PhoneCall size={16} aria-hidden="true" />
            <span>
              Emergency<span className="max-sm:hidden"> support</span>
            </span>
          </button>
          {tracker && (
            <button onClick={openCravingModal} className="btn-primary max-sm:hidden">
              <Plus size={18} />
              <span>Log craving</span>
            </button>
          )}
        </div>
      </div>

      {!tracker ? (
        <EmptyState
          icon={HeartPulse}
          title="Start your clean streak"
          description="Pick what you're stepping away from, like smoking, alcohol, sugar or social media. Your clock starts now."
          action={
            <button
              onClick={() => {
                setTrackerTitle('Sobriety');
                setSetupTrackerModalOpen(true);
              }}
              className="btn-primary mx-auto"
            >
              <Plus size={18} /> Start tracker
            </button>
          }
        />
      ) : (
        <Reveal index={0}>
          <PageHero
            ariaLabel="Your clean streak"
            ring={{
              value: nextMilestone ? elapsedHours - prevHours : 1,
              max: nextMilestone ? nextMilestone.hours - prevHours : 1,
              label: nextMilestone ? `Progress to ${nextMilestone.label}` : 'All milestones reached',
              center: nextMilestone ? formatSpan(nextMilestone.hours - elapsedHours) : <Check size={28} />,
              caption: nextMilestone ? `to ${nextMilestone.label.replace(' Clean', '')}` : 'all reached',
            }}
            lead={{
              label: `${tracker.title} free`,
              value: <CountUp value={days} />,
              hint: `${days === 1 ? 'day' : 'days'}, ${hours}h ${minutes}m`,
              valueClassName: 'text-success-text',
            }}
            stats={[
              { label: 'Points this season', value: <>{heldSeasonPoints > 0 && '+'}<CountUp value={heldSeasonPoints} /></>, valueClassName: 'text-purple-hierarchy' },
              { label: 'Cravings this week', value: <CountUp value={cravingsThisWeek} />, valueClassName: 'text-brand-text' },
            ]}
            side={<CapMeter variant="bar" label="Recovery points this season" earned={heldSeasonPoints} cap={RECOVERY_POINTS.seasonCap} />}
          />
        </Reveal>
      )}

      <PageColumns
        stickyAside
        aside={
          <>
            <Disclosure title="How points work">
              <ul className="list-disc pl-4 space-y-0.5">
                <li>
                  7 days clean = <span className="figure text-success-text">+{SOBRIETY_MILESTONE_POINTS['1w']}</span>, 30 days ={' '}
                  <span className="figure text-success-text">+{SOBRIETY_MILESTONE_POINTS['1m']}</span>, 90 days ={' '}
                  <span className="figure text-success-text">+{SOBRIETY_MILESTONE_POINTS['90d']}</span>.
                </li>
                <li>Up to {RECOVERY_POINTS.seasonCap} pts a season. Points arrive within the hour, even with the app closed.</li>
                <li>Reset or delete: the streak's milestone points from this season come off. Earlier seasons keep theirs.</li>
                <li>A new streak can earn the milestones again. Cravings never change points.</li>
              </ul>
            </Disclosure>
            <div className="rounded-2xl border border-warning/30 bg-warning/5 p-4 flex gap-3">
              <AlertTriangle size={16} className="text-warning-text shrink-0 mt-0.5" />
              <p className="text-xs text-content-tertiary leading-relaxed">
                <span className="font-semibold text-warning-text">Medical disclaimer:</span> This is a self-help tool. It does not replace
                medical treatment or therapy. If you are in crisis, have severe withdrawal, or a serious addiction, contact a licensed
                professional or a helpline (e.g. SAMHSA Helpline: 1-800-662-4357).
              </p>
            </div>
          </>
        }
      >
        {tracker && (
          <div className="space-y-6">
            <div className="card p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="section-title">Milestones</h2>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setResetConfirmOpen(true)}
                    className="btn-ghost text-xs text-content-muted hover:text-warning-text max-sm:px-2 max-sm:py-1"
                  >
                    <RefreshCw size={14} /> Reset streak
                  </button>
                  <button
                    onClick={() => setDeleteTrackerConfirmOpen(true)}
                    className="btn-ghost text-xs text-content-muted hover:text-rose-theme max-sm:px-2 max-sm:py-1"
                  >
                    <Trash2 size={14} /> Delete tracker
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {RECOVERY_MILESTONES.map((m) => {
                  const Icon = MILESTONE_ICON[m.key];
                  const points = SOBRIETY_MILESTONE_POINTS[m.key];
                  const held = seasonAwards.has(m.key);
                  const reached = elapsedHours >= m.hours;
                  const capped = !held && !reached && wouldExceedRecoverySeasonCap(heldSeasonPoints, points);
                  return (
                    <div
                      key={m.key}
                      className={cx(
                        'rounded-xl border p-3 flex items-center gap-3',
                        held ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-overlay-subtle'
                      )}
                    >
                      <div
                        className={cx(
                          'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
                          held ? 'bg-emerald-500/20 text-success-text' : 'bg-overlay-subtle text-content-muted'
                        )}
                      >
                        <Icon size={18} />
                      </div>
                      <div className="min-w-0">
                        <p className="item-name text-sm text-content-secondary">{m.label}</p>
                        <p className="text-xs text-content-muted">
                          {held ? (
                            <span className="figure text-success-text">+{seasonAwards.get(m.key)} pts this season</span>
                          ) : reached ? (
                            'Reached'
                          ) : capped ? (
                            'Season cap reached'
                          ) : (
                            <>
                              +{points} pts in <span className="figure">{formatSpan(m.hours - elapsedHours)}</span>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-content-muted">Started {formatDateLong(todayKey(new Date(tracker.startDate)))}</p>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="section-title">Cravings</h2>
                <div className="flex items-center gap-1">
                  {olderCravingCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setClearOpen(true)}
                      className="btn-ghost text-xs text-content-muted hover:text-rose-theme max-sm:px-2 max-sm:py-1"
                    >
                      <Trash2 size={14} /> Clear older cravings
                    </button>
                  )}
                  <button onClick={openCravingModal} className="btn-secondary text-xs sm:hidden">
                    <Plus size={14} /> Log craving
                  </button>
                </div>
              </div>
              {sortedCravings.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No cravings logged yet"
                  description="Log a craving when it hits. Over time you'll see what triggers it and what helps."
                  action={
                    <button onClick={openCravingModal} className="btn-secondary mx-auto">
                      <Plus size={16} /> Log craving
                    </button>
                  }
                />
              ) : (
                <>
                  <div className="card overflow-hidden divide-y divide-overlay-subtle">
                    {sortedCravings.slice(0, cravingsShown).map((log) => (
                      <div key={log.id} className="enter-item p-3.5 flex items-start gap-3 transition-colors hover:bg-overlay-subtle">
                        <span
                          className={cx(
                            'figure w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm',
                            log.intensity >= 7
                              ? 'bg-rose-500/15 text-rose-theme'
                              : log.intensity >= 4
                                ? 'bg-overlay-subtle text-content-secondary'
                                : 'bg-emerald-500/15 text-success-text'
                          )}
                          title={`Intensity ${log.intensity} of 10`}
                          aria-label={`Intensity ${log.intensity} of 10`}
                        >
                          {log.intensity}
                        </span>
                        <div className="min-w-0 flex-1 text-xs space-y-0.5">
                          <p className="item-name text-sm text-content-secondary truncate">{log.trigger || 'Craving'}</p>
                          {log.copingStrategy && <p className="text-content-muted truncate">Helped: {log.copingStrategy}</p>}
                          <p className="text-content-muted">{cravingDay(log) ? formatDateLong(cravingDay(log)!) : ''}</p>
                        </div>
                        <button
                          onClick={() => setDeleteCravingModalLog(log)}
                          className={`p-1.5 rounded-lg text-content-muted hover:text-rose-theme hover:bg-rose-500/10 transition-colors shrink-0 ${TAP_TARGET}`}
                          title="Delete craving"
                          aria-label="Delete craving"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {sortedCravings.length > cravingsShown && (
                    <button type="button" onClick={() => setCravingsShown((n) => n + CRAVINGS_PAGE)} className="btn-secondary w-full">
                      Show older cravings
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </PageColumns>

      {/* Emergency support (breathing + distraction) */}
      <Dialog
        open={emergencyModalOpen}
        onClose={() => setEmergencyModalOpen(false)}
        title="Emergency support"
        maxWidth="max-w-lg"
        footer={
          <button type="button" onClick={() => setEmergencyModalOpen(false)} className="btn-secondary">
            Close
          </button>
        }
      >
        <div className="space-y-6">
          <div className="rounded-2xl border border-overlay-default p-5 text-center space-y-2">
            <h3 className="section-title">4-4-4-4 box breathing</h3>
            <BreathingCircle />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="item-name text-sm">Quick distraction</h4>
              <button
                onClick={() => setDistractionIdx((prev) => (prev + 1) % DISTRACTION_ACTIVITIES.length)}
                type="button"
                className="btn-ghost text-xs px-2.5 py-1.5 text-brand-text"
              >
                <RefreshCw size={14} /> Next idea
              </button>
            </div>
            <p className="p-3 rounded-xl border border-primary-500/20 bg-primary-500/10 text-base font-medium leading-snug text-brand-text text-center">
              {DISTRACTION_ACTIVITIES[distractionIdx]}
            </p>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={cravingModalOpen}
        onClose={() => setCravingModalOpen(false)}
        dirty={cravingForm.dirty}
        title="Log a craving"
        initialFocus="craving-trigger"
        footer={
          <>
            <button type="button" onClick={() => cravingForm.confirmDiscard(() => setCravingModalOpen(false))} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" form="craving-form" className="btn-primary">
              Save craving
            </button>
          </>
        }
      >
        <Form id="craving-form" onSubmit={handleLogCravingSubmit} className="space-y-4">
          <div>
            <div className="flex justify-between mb-1.5">
              <label htmlFor="craving-intensity" className="label">
                How strong is it?
              </label>
              <span className="figure text-xs text-content-secondary">{intensity} / 10</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="w-full h-11 sm:h-6 accent-rose-500"
              id="craving-intensity"
            />
          </div>
          <Input
            id="craving-trigger"
            label="What triggered it?"
            value={triggerText}
            onChange={(e) => setTriggerText(e.target.value)}
            placeholder="e.g. Stress after work, seeing an ad, feeling lonely"
            maxLength={200}
            autoComplete="off"
            required
          />
          <Input
            id="craving-coping"
            label="What helped, or what will you try?"
            value={copingText}
            onChange={(e) => setCopingText(e.target.value)}
            placeholder="e.g. Box breathing, drank water, went for a walk"
            maxLength={200}
            autoComplete="off"
            enterKeyHint="done"
            required
          />
        </Form>
      </Dialog>

      <Dialog
        open={setupTrackerModalOpen}
        onClose={() => setSetupTrackerModalOpen(false)}
        dirty={setupForm.dirty}
        title="Start tracker"
        footer={
          <>
            <button type="button" onClick={() => setupForm.confirmDiscard(() => setSetupTrackerModalOpen(false))} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" form="setup-tracker-form" className="btn-primary">
              Start clock now
            </button>
          </>
        }
      >
        <Form id="setup-tracker-form" onSubmit={handleStartTracker}>
          <Input
            id="setup-tracker-title"
            label="What are you stepping away from?"
            value={trackerTitle}
            onChange={(e) => setTrackerTitle(e.target.value)}
            placeholder="e.g. Alcohol, Smoking, Junk food, Gambling"
            maxLength={60}
            autoComplete="off"
            enterKeyHint="done"
            required
          />
        </Form>
      </Dialog>

      <Dialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        title="Reset your streak?"
        description={`Your clock starts again from now. ${pointsLine} A slip is a setback, not the end.`}
        footer={
          <>
            <button type="button" onClick={() => setResetConfirmOpen(false)} className="btn-secondary">
              Keep streak
            </button>
            <button
              type="button"
              onClick={() => {
                store.resetAddictionStreak();
                setResetConfirmOpen(false);
                showSuccessToast('Streak reset', 'Your clock starts again now. One day at a time.');
              }}
              className="btn-danger-solid"
            >
              Reset streak
            </button>
          </>
        }
      >
        {null}
      </Dialog>

      <ConfirmDeleteModal
        open={deleteTrackerConfirmOpen}
        onClose={() => setDeleteTrackerConfirmOpen(false)}
        onConfirm={async () => {
          await executeWithKey('delete_addiction_tracker', async () => {
            await store.deleteAddictionTracker();
            setDeleteTrackerConfirmOpen(false);
            showSuccessToast('Tracker deleted', 'Your tracker and cravings were removed.', `tracker_${tracker?.id || 'main'}`);
          });
        }}
        isDeleting={isKeyLoading('delete_addiction_tracker')}
        title="Delete tracker?"
        itemName={tracker?.title}
        description={`This ends your streak and deletes all ${cravingLogs.length} logged ${cravingLogs.length === 1 ? 'craving' : 'cravings'}. ${pointsLine.replace('your new streak', 'a new tracker')}`}
        confirmText="Delete tracker"
      />

      <ConfirmDeleteModal
        open={Boolean(deleteCravingModalLog)}
        onClose={() => setDeleteCravingModalLog(null)}
        onConfirm={async () => {
          if (!deleteCravingModalLog) return;
          const logId = deleteCravingModalLog.id;
          await executeWithKey(`delete_craving_log_${logId}`, async () => {
            await store.deleteCravingLog(logId);
            setDeleteCravingModalLog(null);
            showSuccessToast('Craving deleted', 'Removed from your list.', `craving_log_${logId}`);
          });
        }}
        isDeleting={deleteCravingModalLog ? isKeyLoading(`delete_craving_log_${deleteCravingModalLog.id}`) : false}
        title="Delete craving?"
        itemName={deleteCravingModalLog?.trigger || undefined}
        description="Your streak and points don't change. Cravings this week may go down."
      />

      <ConfirmDeleteModal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={async () => {
          await executeWithKey('clear_old_cravings', async () => {
            await store.clearCravingLogsBefore(weekStartKey);
            setClearOpen(false);
            showSuccessToast(
              'Older cravings cleared',
              olderCravingCount > CLEAR_CRAVING_LOGS_MAX
                ? `${CLEAR_CRAVING_LOGS_MAX} cleared. Tap Clear older cravings again for the rest.`
                : 'Your streak and points stay as they were.',
              'cravings_cleared'
            );
          });
        }}
        isDeleting={isKeyLoading('clear_old_cravings')}
        title="Clear older cravings?"
        itemName={
          olderCravingCount > CLEAR_CRAVING_LOGS_MAX
            ? `${CLEAR_CRAVING_LOGS_MAX} of the ${olderCravingCount} cravings before this week`
            : `${olderCravingCount} ${olderCravingCount === 1 ? 'craving' : 'cravings'} before this week`
        }
        description={`Your streak and points don't change. Their triggers and what helped are deleted for good. This week's cravings are kept.${
          olderCravingCount > CLEAR_CRAVING_LOGS_MAX ? ` Up to ${CLEAR_CRAVING_LOGS_MAX} go at a time: tap again for the rest.` : ''
        }`}
        confirmText="Clear cravings"
      />
    </div>
  );
}

// Guided box breathing
function BreathingCircle() {
  const [phase, setPhase] = useState<'Inhale' | 'Hold' | 'Exhale' | 'Rest'>('Inhale');
  const [seconds, setSeconds] = useState(4);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setSeconds((prev) => {
        if (prev > 1) return prev - 1;
        setPhase((current) => (current === 'Inhale' ? 'Hold' : current === 'Hold' ? 'Exhale' : current === 'Exhale' ? 'Rest' : 'Inhale'));
        return 4;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive]);

  const circleClass =
    phase === 'Inhale' || phase === 'Hold'
      ? 'scale-125 bg-purple-500/30 border-purple-400'
      : 'scale-90 bg-purple-500/10 border-purple-500/30';

  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-4">
      <div className="relative w-36 h-36 flex items-center justify-center">
        <div className={`w-28 h-28 rounded-full border-2 transition-all duration-1000 flex flex-col items-center justify-center ${circleClass}`}>
          <span className="text-xs font-medium text-purple-hierarchy">{phase}</span>
          <span className="figure text-2xl text-content-primary mt-0.5">{seconds}s</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setIsActive(!isActive)} className="btn-ghost text-xs text-purple-hierarchy flex items-center gap-1">
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
