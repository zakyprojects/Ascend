import { useState, useEffect, useRef } from 'react';
import { HeartPulse, ShieldCheck, Flame, AlertCircle, Sparkles, RefreshCw, Activity, PhoneCall, Play, Pause, RotateCcw, Award, Trash2 } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { CravingLog } from '@/types';
import { formatDateLong } from '@/lib/dates';

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
      const now = new Date().getTime();
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
    { key: '24h', label: '24 Hours Clean', requiredHours: 24, points: 20, icon: '🎉' },
    { key: '1w', label: '1 Week Clean', requiredHours: 168, points: 50, icon: '🏅' },
    { key: '1m', label: '1 Month Clean', requiredHours: 720, points: 150, icon: '🏆' },
  ];

  const handleStartTracker = (e: React.FormEvent) => {
    e.preventDefault();
    store.setAddictionTracker(trackerTitle, new Date().toISOString());
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
            <HeartPulse className="text-rose-400" size={26} />
            Addiction Recovery Module
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Sobriety streak counter, craving logs, and immediate emergency support
          </p>
        </div>

        <button
          onClick={() => setEmergencyModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 text-white font-bold text-xs shadow-lg shadow-rose-500/20 hover:from-rose-600 hover:to-red-700 flex items-center gap-2 animate-pulse"
        >
          <PhoneCall size={16} />
          <span>Emergency Support</span>
        </button>
      </div>

      {/* Persistent Disclaimer Banner */}
      <div className="card p-4 border-l-4 border-amber-500 bg-amber-500/10 flex items-start gap-3">
        <AlertCircle size={22} className="text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <span className="font-bold text-amber-300">Important Medical Disclaimer:</span> This module is a self-management support tool designed to complement — but <span className="underline">not replace</span> — professional medical treatment or therapy. If you are experiencing severe addiction, physical withdrawal, or crisis, please seek immediate assistance from a licensed healthcare professional or hotline (e.g. SAMHSA Helpline: 1-800-662-4357).
        </div>
      </div>

      {/* Main Sobriety Streak Card */}
      {!tracker ? (
        <div className="card p-8 text-center space-y-3">
          <ShieldCheck size={36} className="mx-auto text-rose-400" />
          <h2 className="text-lg font-bold text-slate-100">Set Up Your Sobriety Tracker</h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Choose what you are recovering from (e.g., Alcohol, Smoking, Sugar, Social Media) and start tracking your milestone achievements today.
          </p>
          <button onClick={() => setSetupTrackerModalOpen(true)} className="btn-primary mx-auto">
            Start Sobriety Tracker
          </button>
        </div>
      ) : (
        <div className="card p-6 relative overflow-hidden space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-white/5 pb-4">
            <div>
              <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">Sobriety Counter</span>
              <h2 className="text-xl font-bold text-slate-100">{tracker.title}</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setResetConfirmOpen(true)}
                className="btn-ghost text-xs text-slate-400 hover:text-amber-400 flex items-center gap-1.5"
              >
                <RefreshCw size={14} />
                <span>Reset Timer</span>
              </button>
              <button
                onClick={() => setDeleteTrackerConfirmOpen(true)}
                className="btn-ghost text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1.5"
                title="Delete Sobriety Tracker Entirely"
              >
                <Trash2 size={14} />
                <span>Delete Tracker</span>
              </button>
            </div>
          </div>

          {/* Live Counter Display */}
          <div className="grid grid-cols-4 gap-2 text-center">
            <div className="bg-bg-800/80 p-3 rounded-2xl border border-white/5">
              <div className="text-3xl sm:text-4xl font-display font-bold text-rose-400">{timeElapsed.days}</div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold mt-1">Days</div>
            </div>
            <div className="bg-bg-800/80 p-3 rounded-2xl border border-white/5">
              <div className="text-3xl sm:text-4xl font-display font-bold text-slate-100">{timeElapsed.hours}</div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold mt-1">Hours</div>
            </div>
            <div className="bg-bg-800/80 p-3 rounded-2xl border border-white/5">
              <div className="text-3xl sm:text-4xl font-display font-bold text-slate-100">{timeElapsed.minutes}</div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold mt-1">Mins</div>
            </div>
            <div className="bg-bg-800/80 p-3 rounded-2xl border border-white/5">
              <div className="text-3xl sm:text-4xl font-display font-bold text-slate-100">{timeElapsed.seconds}</div>
              <div className="text-[10px] text-slate-500 uppercase font-semibold mt-1">Secs</div>
            </div>
          </div>

          {/* Milestones Celebrations */}
          <div>
            <div className="text-xs font-bold text-slate-300 mb-3 flex items-center gap-2">
              <Award size={16} className="text-amber-400" />
              Milestone Celebrations & Badges
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {milestones.map((m) => {
                const isUnlocked = tracker.milestonesUnlocked.includes(m.key);
                return (
                  <button
                    key={m.key}
                    onClick={() => {
                      if (isUnlocked) setCelebrationMilestone(m.label);
                    }}
                    className={`card p-3 flex items-center gap-3 text-left transition-all ${
                      isUnlocked
                        ? 'bg-amber-500/10 border-amber-500/40 text-slate-200 cursor-pointer hover:bg-amber-500/20'
                        : 'bg-bg-800/40 border-white/5 text-slate-500 opacity-60'
                    }`}
                  >
                    <span className="text-2xl">{m.icon}</span>
                    <div>
                      <div className="text-xs font-bold">{m.label}</div>
                      <div className="text-[10px] text-slate-400">
                        {isUnlocked ? `Unlocked! (+${m.points} pts)` : `Requires ${m.requiredHours}h`}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Craving Log Section */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="section-title">Craving Log & Trigger Analysis</h2>
            <p className="text-xs text-slate-500">Record craving intensity (1-10), triggers, and successful coping strategies</p>
          </div>
          <button onClick={() => setCravingModalOpen(true)} className="btn-primary text-xs flex items-center gap-1.5">
            <Activity size={14} />
            <span>Log Craving</span>
          </button>
        </div>

        {cravingLogs.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 bg-bg-800/40 rounded-xl border border-white/5">
            No cravings logged yet. Logging cravings helps identify environmental triggers and effective coping mechanisms.
          </div>
        ) : (
          <div className="space-y-3">
            {/* Craving History */}
            <div className="space-y-2">
              {cravingLogs.slice(0, 10).map((log) => (
                <div key={log.id} className="card p-3 bg-bg-800/60 border border-white/5 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 flex items-center gap-2">
                      Intensity: <span className={`px-2 py-0.5 rounded font-mono ${log.intensity >= 7 ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-300'}`}>{log.intensity}/10</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 text-[10px]">{formatDateLong(log.date)}</span>
                      <button
                        onClick={() => setDeleteCravingModalLog(log)}
                        className="text-slate-600 hover:text-rose-400 p-0.5 transition-colors"
                        title="Delete Craving Log"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {log.trigger && <p className="text-slate-400"><span className="text-slate-500 font-medium">Trigger:</span> {log.trigger}</p>}
                  {log.copingStrategy && <p className="text-emerald-400"><span className="text-slate-500 font-medium">Coping strategy:</span> {log.copingStrategy}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Emergency Support Modal (Breathing + Distraction) */}
      <Modal open={emergencyModalOpen} onClose={() => setEmergencyModalOpen(false)} title="Emergency Support & Urge Surfing" maxWidth="max-w-lg">
        <div className="space-y-6">
          {/* Guided Breathing Box */}
          <div className="card p-5 text-center bg-bg-800 border border-purple-500/30 space-y-4">
            <h3 className="text-sm font-bold text-purple-300 flex items-center justify-center gap-2">
              <Sparkles size={16} /> Guided 4-4-4-4 Box Breathing
            </h3>
            <BreathingCircle />
          </div>

          {/* Quick Distraction Activity Suggestion */}
          <div className="card p-4 space-y-3 bg-bg-800 border border-white/10">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-200">Quick Distraction Activity</h4>
              <button
                onClick={() => setDistractionIdx((prev) => (prev + 1) % DISTRACTION_ACTIVITIES.length)}
                className="btn-ghost text-[11px] text-primary-400 flex items-center gap-1"
              >
                <RefreshCw size={12} /> Next Suggestion
              </button>
            </div>
            <div className="p-3 bg-primary-500/10 rounded-xl text-sm font-semibold text-primary-300 text-center border border-primary-500/20">
              "{DISTRACTION_ACTIVITIES[distractionIdx]}"
            </div>
          </div>

          <div className="text-center pt-2">
            <button onClick={() => setEmergencyModalOpen(false)} className="btn-secondary w-full">
              Close Emergency Support
            </button>
          </div>
        </div>
      </Modal>

      {/* Log Craving Modal */}
      <Modal open={cravingModalOpen} onClose={() => setCravingModalOpen(false)} title="Log Craving Instance">
        <form onSubmit={handleLogCravingSubmit} className="space-y-4">
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Craving Intensity</span>
              <span className="font-bold text-amber-400">{intensity} / 10</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
              className="w-full accent-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">What triggered this craving?</label>
            <input
              type="text"
              value={triggerText}
              onChange={(e) => setTriggerText(e.target.value)}
              placeholder="e.g. Stress after work, seeing an ad, feeling lonely"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Coping strategy used / planned</label>
            <input
              type="text"
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
      </Modal>

      {/* Setup Tracker Modal */}
      <Modal open={setupTrackerModalOpen} onClose={() => setSetupTrackerModalOpen(false)} title="Set Up Sobriety Tracker">
        <form onSubmit={handleStartTracker} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">What are you abstaining from?</label>
            <input
              type="text"
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
      </Modal>

      {/* Reset Confirmation Modal */}
      <Modal open={resetConfirmOpen} onClose={() => setResetConfirmOpen(false)} title="Reset Sobriety Streak?">
        <div className="space-y-4 text-xs text-slate-300">
          <p>
            Resetting your timer will restart your sobriety clock from 00:00:00. Remember: slipping up is a bump in the road, not the end of your journey.
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
      </Modal>

      {/* Milestone Unlocked Modal */}
      <Modal open={!!celebrationMilestone} onClose={() => setCelebrationMilestone(null)} title="Milestone Unlocked! 🎉">
        <div className="text-center space-y-4 py-2">
          <div className="w-16 h-16 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/40 flex items-center justify-center text-3xl mx-auto animate-bounce">
            🏆
          </div>
          <h3 className="text-lg font-bold text-slate-100">{celebrationMilestone}</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Incredible determination and discipline! Keep holding fast and rewiring your neural circuits day by day.
          </p>
          <button onClick={() => setCelebrationMilestone(null)} className="btn-primary mx-auto">
            Awesome!
          </button>
        </div>
      </Modal>

      {/* Delete Tracker Modal */}
      <ConfirmDeleteModal
        open={deleteTrackerConfirmOpen}
        onClose={() => setDeleteTrackerConfirmOpen(false)}
        onConfirm={() => {
          store.deleteAddictionTracker();
          setDeleteTrackerConfirmOpen(false);
        }}
        title="Delete Sobriety Tracker?"
        itemName={tracker?.title}
        description={`Are you sure you want to delete your "${tracker?.title}" sobriety counter entirely? This will clear the active streak counter and remove all logged craving data. Any milestone points earned will be deducted.`}
        confirmText="Delete Tracker"
      />

      {/* Delete Craving Log Modal */}
      <ConfirmDeleteModal
        open={Boolean(deleteCravingModalLog)}
        onClose={() => setDeleteCravingModalLog(null)}
        onConfirm={() => {
          if (deleteCravingModalLog) {
            store.deleteCravingLog(deleteCravingModalLog.id);
            setDeleteCravingModalLog(null);
          }
        }}
        title="Delete Craving Log?"
        description="Are you sure you want to delete this craving log entry?"
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
          <span className="text-xs uppercase tracking-widest text-purple-300 font-bold">{phase}</span>
          <span className="text-2xl font-display font-bold text-white mt-0.5">{seconds}s</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setIsActive(!isActive)}
          className="btn-ghost text-xs text-purple-300 flex items-center gap-1"
        >
          {isActive ? <Pause size={14} /> : <Play size={14} />}
          <span>{isActive ? 'Pause' : 'Start'}</span>
        </button>
        <button
          onClick={() => {
            setPhase('Inhale');
            setSeconds(4);
          }}
          className="btn-ghost text-xs text-slate-400 flex items-center gap-1"
        >
          <RotateCcw size={14} /> Reset
        </button>
      </div>
    </div>
  );
}
