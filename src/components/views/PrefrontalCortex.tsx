import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Timer,
  BrainCircuit,
  Scale,
  HeartHandshake,
  Play,
  Pause,
  RotateCcw,
  Plus,
  CheckCircle2,
  Award,
  Calendar,
  Sparkles,
  Trash2,
  HelpCircle,
  Info,
  Bell,
  BellOff,
  Clock,
  Sliders,
  AlertTriangle,
  BookOpen,
  Zap,
  X,
  Check,
  Edit3,
  Flame,
  Radio,
  Layers,
  CalendarDays,
  ArrowRight,
  PowerOff,
  SkipForward,
} from 'lucide-react';
import { AppStore } from '@/lib/store';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import {
  todayKey,
  formatDateLong,
  parseDate,
  startOfWeek as getStartOfWeek,
} from '@/lib/dates';
import {
  timeStringToMinutes,
  formatTime12h,
  formatDurationHuman,
  computeLiveSchedule,
  ensureDefaultActivities,
  getAscendViewForModule,
} from '@/lib/timeTracker';
import { ActivityIcon } from './timeTracker/ActivityIcon';
import { useToast } from '@/components/ui/Toast';

type PFCTab = 'focus' | 'decision' | 'emotion';

export function PrefrontalCortex({
  store,
  onNavigate,
}: {
  store: AppStore;
  onNavigate?: (view: any) => void;
}) {
  const [activeTab, setActiveTab] = useState<PFCTab>('focus');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-100 flex items-center gap-2">
          <BrainCircuit className="text-cyan-400" size={26} />
          Prefrontal Cortex Module
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Train executive functions: deep focus sessions, decision journaling, and emotion labeling
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setActiveTab('focus')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs transition-all shrink-0 ${
            activeTab === 'focus'
              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
              : 'text-slate-400 hover:bg-white/5'
          }`}
        >
          <Timer size={16} />
          <span>Deep Focus Timer</span>
        </button>

        <button
          onClick={() => setActiveTab('decision')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs transition-all shrink-0 ${
            activeTab === 'decision'
              ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
              : 'text-slate-400 hover:bg-white/5'
          }`}
        >
          <Scale size={16} />
          <span>Decision Journal</span>
        </button>

        <button
          onClick={() => setActiveTab('emotion')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs transition-all shrink-0 ${
            activeTab === 'emotion'
              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
              : 'text-slate-400 hover:bg-white/5'
          }`}
        >
          <HeartHandshake size={16} />
          <span>Emotion Labeler</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div className={activeTab === 'focus' ? 'block' : 'hidden'}>
        <FocusTimerSubmodule store={store} onNavigate={onNavigate} />
      </div>
      <div className={activeTab === 'decision' ? 'block' : 'hidden'}>
        <DecisionJournalSubmodule store={store} />
      </div>
      <div className={activeTab === 'emotion' ? 'block' : 'hidden'}>
        <EmotionLabelerSubmodule store={store} />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------
// 1. DEEP FOCUS POMODORO TIMER SUBMODULE
// ----------------------------------------------------------------------
const FOCUS_STORAGE_KEY = 'ascend_active_focus_session';
const FOCUS_SENTINEL_KEY = 'ascend_focus_tab_alive';
const FOCUS_NOTIFS_PREF_KEY = 'ascend_focus_notifs_enabled';

interface PersistedFocusSession {
  startTime: number; // ms timestamp
  plannedDurationSeconds: number;
  totalSessionMinutes: number;
  taskName: string;
  skillId?: string;
  mode: 'focus' | 'break';
  breakMinutes: number;
  isPaused: boolean;
  pausedRemainingSeconds: number;
  isCustom: boolean;
  focusMinutes: number;
  startedAtIso: string;
}

function calculateRemainingSeconds(session: PersistedFocusSession): number {
  if (session.isPaused) {
    return session.pausedRemainingSeconds;
  }
  const elapsedSeconds = (Date.now() - session.startTime) / 1000;
  const remaining = session.plannedDurationSeconds - elapsedSeconds;
  return Math.max(0, Math.ceil(remaining));
}

async function sendCompletionNotification(mode: 'focus' | 'break', taskName: string, durationMins: number) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  try {
    const pref = localStorage.getItem(FOCUS_NOTIFS_PREF_KEY);
    if (pref === 'false') return;
  } catch (e) {
    /* ignore */
  }

  const title = mode === 'focus' ? '🎯 Deep Focus Complete!' : '☕ Rest Break Ended!';
  const body = mode === 'focus'
    ? `Outstanding focus! You completed ${durationMins} minutes on "${taskName}".`
    : 'Rest break is over. Ready for your next deep focus session?';

  const options: NotificationOptions & { renotify?: boolean } = {
    body,
    icon: '/favicon.ico',
    tag: 'ascend-focus-completion',
    renotify: true,
  };

  // 1. Service Worker registration showNotification (for Mobile / PWA / Background tabs)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options);
        return;
      }
    } catch (e) {
      console.warn('Service worker showNotification failed, falling back to Notification constructor:', e);
    }
  }

  // 2. Fallback to standard Notification constructor
  try {
    new Notification(title, options);
  } catch (err) {
    console.warn('Notification constructor failed:', err);
  }
}

function FocusTimerSubmodule({
  store,
  onNavigate,
}: {
  store: AppStore;
  onNavigate?: (view: any) => void;
}) {
  const [deleteModalLog, setDeleteModalLog] = useState<any | null>(null);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [showNotifHint, setShowNotifHint] = useState(false);
  const [pendingPresetSwitch, setPendingPresetSwitch] = useState<{ focus: number; breakMins: number; custom: boolean } | null>(null);

  const [reflectionModalOpen, setReflectionModalOpen] = useState(false);
  const [completedSessionData, setCompletedSessionData] = useState<{ taskName: string; durationMinutes: number; skillId?: string } | null>(null);
  const [reflectionText, setReflectionText] = useState('');

  // Duration settings
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [isCustom, setIsCustom] = useState(false);
  const [customFocusMins, setCustomFocusMins] = useState(25);
  const [customBreakMins, setCustomBreakMins] = useState(5);
  const [customError, setCustomError] = useState<string | null>(null);

  // Task & Tagging
  const { showSuccessToast, showErrorToast } = useToast();
  const [taskName, setTaskName] = useState('Deep Work');
  const [selectedSkillId, setSelectedSkillId] = useState<string>('');

  // Dual Mode Timer & Live Schedule Sync State
  const [timerMode, setTimerMode] = useState<'manual' | 'sync'>(() => {
    try {
      const pendingMode = sessionStorage.getItem('ascend_pending_pfc_timer_mode');
      if (pendingMode === 'sync') {
        return 'sync';
      }
      if (typeof window !== 'undefined') {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('tab') === 'live' || urlParams.get('mode') === 'sync') {
          return 'sync';
        }
      }
    } catch {}
    return 'manual';
  });
  const [currentTime, setCurrentTime] = useState<Date>(() => new Date());

  // Clock ticker for live second-by-second countdown
  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const todayDateKey = todayKey(currentTime);
  const IGNITION_KEY = `ascend_pfc_schedule_ignited_${todayDateKey}`;
  const [isScheduleIgnited, setIsScheduleIgnited] = useState<boolean>(() => {
    try {
      // Proactively clear legacy unscoped key if left over from previous version
      localStorage.removeItem('ascend_pfc_ignition_active');
      return localStorage.getItem(`ascend_pfc_schedule_ignited_${todayKey(new Date())}`) === 'true';
    } catch {
      return false;
    }
  });

  const [showStopConfirm, setShowStopConfirm] = useState(false);

  // Sync ignition state strictly to the active date key (resets to false on midnight rollover)
  useEffect(() => {
    try {
      const isIgnitedForDate = localStorage.getItem(IGNITION_KEY) === 'true';
      setIsScheduleIgnited(isIgnitedForDate);
    } catch {}
  }, [todayDateKey, IGNITION_KEY]);

  const handleIgniteSchedule = () => {
    try {
      store.hydrateTimeTrackerForDate(todayDateKey);
    } catch {
      /* best-effort hydration */
    }
    setIsScheduleIgnited(true);
    try {
      localStorage.setItem(IGNITION_KEY, 'true');
    } catch {}
  };

  // This actually stops the sync
  const executeStopSync = () => {
    setIsScheduleIgnited(false);
    setTimerMode('manual');
    setShowStopConfirm(false);
    try {
      localStorage.removeItem(IGNITION_KEY);
      localStorage.removeItem('ascend_pfc_ignition_active');
    } catch {}
  };

  // This simply triggers the custom UI
  const handleStopSync = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setShowStopConfirm(true);
  };

  // Time Tracker state & live evaluation
  const timeTracker = store.state.timeTracker;
  const activities = useMemo(() => {
    return ensureDefaultActivities(timeTracker?.activities || []);
  }, [timeTracker?.activities]);

  const activityMap = useMemo(() => {
    return new Map(activities.map((a) => [a.id, a]));
  }, [activities]);

  const todayBlocks = useMemo(() => {
    const blocks = timeTracker?.dailyLogs?.[todayDateKey] || [];
    return [...blocks].sort(
      (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
    );
  }, [timeTracker?.dailyLogs, todayDateKey]);

  const liveSchedule = useMemo(() => {
    return computeLiveSchedule(todayBlocks, activities, currentTime);
  }, [todayBlocks, activities, currentTime]);

  // Overdue Block Interceptor (The Accountability Lock)
  const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const overdueBlock = useMemo(() => {
    return todayBlocks.find(
      (b) => !b.completed && !b.skipped && nowMinutes > timeStringToMinutes(b.endTime)
    );
  }, [todayBlocks, nowMinutes]);
  const overdueBlockActivity = overdueBlock ? activityMap.get(overdueBlock.activityId) : null;

  const currentResolvedBlock = useMemo(() => {
    const validBlocks = todayBlocks.filter((b) => {
      const start = timeStringToMinutes(b.startTime);
      const end = timeStringToMinutes(b.trimmedOriginalEndTime || b.originalEndTime || b.endTime);
      return nowMinutes >= start && nowMinutes < end && (b.completed || b.skipped);
    });

    if (validBlocks.length === 0) return undefined;

    // Sort by most recently resolved (completed or skipped) to prioritize the block the user JUST interacted with
    return validBlocks.sort((a, b) => {
      const timestampA = a.completedAt || a.skippedAt;
      const timestampB = b.completedAt || b.skippedAt;
      const timeA = timestampA ? new Date(timestampA).getTime() : 0;
      const timeB = timestampB ? new Date(timestampB).getTime() : 0;
      return timeB - timeA; // Descending order (Newest first)
    })[0];
  }, [todayBlocks, nowMinutes]);
  const currentResolvedBlockActivity = currentResolvedBlock
    ? activityMap.get(currentResolvedBlock.activityId)
    : null;

  // Active Block calculations
  const activeBlock = liveSchedule.activeBlock;
  const activeBlockActivity = liveSchedule.activeBlockActivity;

  let activeBlockRemainingSeconds = 0;
  let activeBlockElapsedSeconds = 0;
  let activeBlockTotalSeconds = 1;
  let activeBlockProgress = 0;

  if (activeBlock) {
    const startMins = timeStringToMinutes(activeBlock.startTime);
    const endMins = timeStringToMinutes(activeBlock.endTime);
    const nowSecs = currentTime.getHours() * 3600 + currentTime.getMinutes() * 60 + currentTime.getSeconds();
    const startSecs = startMins * 60;
    const endSecs = endMins * 60;

    activeBlockRemainingSeconds = Math.max(0, endSecs - nowSecs);
    activeBlockElapsedSeconds = Math.max(0, nowSecs - startSecs);
    activeBlockTotalSeconds = Math.max(1, endSecs - startSecs);
    activeBlockProgress = Math.min(100, Math.max(0, (activeBlockElapsedSeconds / activeBlockTotalSeconds) * 100));
  }

  // Next Block calculation for gap states
  const nextBlock = liveSchedule.nextBlock;
  const nextBlockActivity = nextBlock ? activityMap.get(nextBlock.activityId) : null;
  let gapRemainingSeconds = 0;
  let gapMinsUntilNext = 0;

  if (nextBlock) {
    const nextStartMins = timeStringToMinutes(nextBlock.startTime);
    const nowSecs = currentTime.getHours() * 3600 + currentTime.getMinutes() * 60 + currentTime.getSeconds();
    const nextStartSecs = nextStartMins * 60;
    gapRemainingSeconds = Math.max(0, nextStartSecs - nowSecs);
    gapMinsUntilNext = Math.max(1, Math.ceil(gapRemainingSeconds / 60));
  }

  const formatSeconds = (totalSecs: number) => {
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Active Session State
  const [activeSession, setActiveSession] = useState<PersistedFocusSession | null>(null);
  const [mode, setMode] = useState<'focus' | 'break'>('focus');
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [notificationPerm, setNotificationPerm] = useState<NotificationPermission>('default');

  const focusLogs = store.state.focusLogs;
  const skills = store.state.skills;

  // Weekly stats calculation
  const now = new Date();
  const weekStart = getStartOfWeek(now);
  const weeklyFocusLogs = focusLogs.filter((l) => (parseDate(l.date) || new Date(0)) >= weekStart);
  const weeklyFocusMinutes = weeklyFocusLogs.reduce((sum, l) => sum + l.durationMinutes, 0);

  // Initialize notification state & resume active session from localStorage on mount (BUG 1 FIX)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPerm(Notification.permission);
    }

    try {
      const pendingTimerMode = sessionStorage.getItem('ascend_pending_pfc_timer_mode');
      const isSyncRequested = pendingTimerMode === 'sync' || (typeof window !== 'undefined' && (new URLSearchParams(window.location.search).get('tab') === 'live' || new URLSearchParams(window.location.search).get('mode') === 'sync'));

      if (isSyncRequested) {
        setTimerMode('sync');
        sessionStorage.removeItem('ascend_pending_pfc_timer_mode');
        sessionStorage.removeItem('ascend_pending_focus_task');
        sessionStorage.removeItem('ascend_pending_focus_duration');
        sessionStorage.removeItem('ascend_pending_focus_timestamp');
      } else {
        const pendingTask = sessionStorage.getItem('ascend_pending_focus_task');
        if (pendingTask) {
          setTaskName(pendingTask);
          sessionStorage.removeItem('ascend_pending_focus_task');
        }

        const pendingDurationStr = sessionStorage.getItem('ascend_pending_focus_duration');
        if (pendingDurationStr) {
          const parsedMins = parseInt(pendingDurationStr, 10);
          if (!isNaN(parsedMins) && parsedMins > 0) {
            setFocusMinutes(parsedMins);
            setCustomFocusMins(parsedMins);
            setIsCustom(true);
            setTimeLeft(parsedMins * 60);
          }
          sessionStorage.removeItem('ascend_pending_focus_duration');
        }
      }

      const saved = localStorage.getItem(FOCUS_STORAGE_KEY);
      const sentinel = sessionStorage.getItem(FOCUS_SENTINEL_KEY);

      if (saved) {
        if (sentinel !== '1') {
          // Tab was genuinely closed and reopened in a new tab context -> discard session immediately
          console.log('[FocusTimer] Tab sentinel missing — session originated from a closed tab. Discarding session.');
          localStorage.removeItem(FOCUS_STORAGE_KEY);
          sessionStorage.removeItem(FOCUS_SENTINEL_KEY);
        } else {
          // Same tab reload (F5) or active tab -> calculate remaining time
          const parsed: PersistedFocusSession = JSON.parse(saved);
          const remainingSecs = calculateRemainingSeconds(parsed);

          if (remainingSecs <= 0) {
            localStorage.removeItem(FOCUS_STORAGE_KEY);
            sessionStorage.removeItem(FOCUS_SENTINEL_KEY);
          } else {
            // Seamlessly resume active session
            setActiveSession(parsed);
            setTimeLeft(remainingSecs);
            setIsRunning(!parsed.isPaused);
            setMode(parsed.mode);
            setFocusMinutes(parsed.focusMinutes);
            setBreakMinutes(parsed.breakMinutes);
            setTaskName(parsed.taskName);
            setSelectedSkillId(parsed.skillId || '');
            setIsCustom(parsed.isCustom);
            if (parsed.isCustom) {
              setCustomFocusMins(parsed.focusMinutes);
              setCustomBreakMins(parsed.breakMinutes);
            }
            // Re-arm sentinel
            sessionStorage.setItem(FOCUS_SENTINEL_KEY, '1');
          }
        }
      }
    } catch (e) {
      console.error('Error restoring focus session from localStorage:', e);
      localStorage.removeItem(FOCUS_STORAGE_KEY);
      sessionStorage.removeItem(FOCUS_SENTINEL_KEY);
    }
  }, []);

  // Completion trigger handler
  const handleSessionComplete = (session: PersistedFocusSession) => {
    void sendCompletionNotification(session.mode, session.taskName, session.totalSessionMinutes);

    localStorage.removeItem(FOCUS_STORAGE_KEY);
    sessionStorage.removeItem(FOCUS_SENTINEL_KEY);
    setActiveSession(null);
    setIsRunning(false);

    if (session.mode === 'focus') {
      store.logFocusSession(session.taskName, session.totalSessionMinutes, session.skillId || undefined);

      setCompletedSessionData({
        taskName: session.taskName,
        durationMinutes: session.totalSessionMinutes,
        skillId: session.skillId,
      });
      setReflectionText('');
      setReflectionModalOpen(true);

      setMode('break');
      setTimeLeft(session.breakMinutes * 60);
    } else {
      setMode('focus');
      setTimeLeft((session.isCustom ? session.focusMinutes : focusMinutes) * 60);
    }
  };

  // Timer Interval Tick
  useEffect(() => {
    let interval: number | null = null;
    if (isRunning && activeSession) {
      interval = window.setInterval(() => {
        const rem = calculateRemainingSeconds(activeSession);
        setTimeLeft(rem);
        if (rem <= 0) {
          handleSessionComplete(activeSession);
        }
      }, 500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRunning, activeSession]);

  // Page Visibility Listener (visibilitychange recomputes timestamp immediately)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeSession && !activeSession.isPaused) {
        const rem = calculateRemainingSeconds(activeSession);
        setTimeLeft(rem);
        if (rem <= 0) {
          handleSessionComplete(activeSession);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeSession]);

  // beforeunload Listener (Native browser confirmation prompt on tab close/reload)
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeSession && isRunning) {
        e.preventDefault();
        e.returnValue = 'You have an active focus session. Closing the tab will discard your session.';
        // NOTE: Do NOT call localStorage.removeItem here!
        // Calling removeItem inside beforeunload executes BEFORE the user responds to the
        // "Leave site?" prompt. If the user clicks "Cancel" to stay, wiping storage here
        // would falsely destroy an active session.
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [activeSession, isRunning]);

  // Start Session
  const handleStartSession = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPerm(perm);
      } catch (e) {
        console.warn('Notification permission request error:', e);
      }
    }

    const targetFocusMins = isCustom ? Number(customFocusMins) : focusMinutes;
    const targetBreakMins = isCustom ? Number(customBreakMins) : breakMinutes;

    if (isCustom && (isNaN(targetFocusMins) || targetFocusMins < 1)) {
      setCustomError('Custom focus duration must be at least 1 minute.');
      return;
    }
    setCustomError(null);

    const plannedSecs = targetFocusMins * 60;
    const newSession: PersistedFocusSession = {
      startTime: Date.now(),
      plannedDurationSeconds: plannedSecs,
      totalSessionMinutes: targetFocusMins,
      taskName: taskName.trim() || 'Deep Focus',
      skillId: selectedSkillId || undefined,
      mode: 'focus',
      breakMinutes: targetBreakMins,
      isPaused: false,
      pausedRemainingSeconds: plannedSecs,
      isCustom,
      focusMinutes: targetFocusMins,
      startedAtIso: new Date().toISOString(),
    };

    try {
      localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(newSession));
      sessionStorage.setItem(FOCUS_SENTINEL_KEY, '1');
    } catch (e) {
      console.error('Failed to persist focus session:', e);
    }

    setActiveSession(newSession);
    setMode('focus');
    setTimeLeft(plannedSecs);
    setIsRunning(true);
  };

  // Pause Session
  const handlePauseSession = () => {
    if (!activeSession) return;
    const rem = calculateRemainingSeconds(activeSession);
    const updated: PersistedFocusSession = {
      ...activeSession,
      isPaused: true,
      pausedRemainingSeconds: rem,
    };
    try {
      localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(updated));
      sessionStorage.setItem(FOCUS_SENTINEL_KEY, '1');
    } catch (e) {}
    setActiveSession(updated);
    setTimeLeft(rem);
    setIsRunning(false);
  };

  // Resume Session
  const handleResumeSession = () => {
    if (!activeSession) return;
    const updated: PersistedFocusSession = {
      ...activeSession,
      startTime: Date.now(),
      plannedDurationSeconds: activeSession.pausedRemainingSeconds,
      isPaused: false,
    };
    try {
      localStorage.setItem(FOCUS_STORAGE_KEY, JSON.stringify(updated));
      sessionStorage.setItem(FOCUS_SENTINEL_KEY, '1');
    } catch (e) {}
    setActiveSession(updated);
    setIsRunning(true);
  };

  // Header Notification Button Click Handler
  const handleHeaderNotifButtonClick = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('Web Notifications are not supported by your current browser.');
      return;
    }

    if (Notification.permission === 'default') {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPerm(perm);
        setShowNotifHint(false);
      } catch (e) {
        console.warn('Error requesting notification permission:', e);
      }
      return;
    }

    // If permission is already granted or denied, toggle non-intrusive tooltip hint
    setShowNotifHint((prev) => !prev);
  };

  // Discard / Reset Session Handlers
  const handleRequestReset = () => {
    if (activeSession) {
      setConfirmResetOpen(true);
    } else {
      const resetMins = isCustom ? customFocusMins : focusMinutes;
      setTimeLeft(resetMins * 60);
      setMode('focus');
    }
  };

  const handleConfirmDiscardSession = () => {
    localStorage.removeItem(FOCUS_STORAGE_KEY);
    sessionStorage.removeItem(FOCUS_SENTINEL_KEY);
    setActiveSession(null);
    setIsRunning(false);
    setConfirmResetOpen(false);
    setPendingPresetSwitch(null);

    const targetFocusMins = pendingPresetSwitch
      ? pendingPresetSwitch.focus
      : isCustom
      ? customFocusMins
      : focusMinutes;

    if (pendingPresetSwitch) {
      setFocusMinutes(pendingPresetSwitch.focus);
      setBreakMinutes(pendingPresetSwitch.breakMins);
      setIsCustom(pendingPresetSwitch.custom);
    }

    setMode('focus');
    setTimeLeft((isNaN(targetFocusMins) || targetFocusMins < 1 ? 25 : targetFocusMins) * 60);
  };

  // Preset switch handler
  const handlePresetSelect = (focusMins: number, breakMins: number, customFlag: boolean = false) => {
    if (activeSession) {
      setPendingPresetSwitch({ focus: focusMins, breakMins, custom: customFlag });
      setConfirmResetOpen(true);
      return;
    }

    setFocusMinutes(focusMins);
    setBreakMinutes(breakMins);
    setIsCustom(customFlag);

    if (customFlag) {
      if (customFocusMins < 1) setCustomFocusMins(1);
    } else {
      setTimeLeft(focusMins * 60);
    }

    setMode('focus');
    setIsRunning(false);
  };

  // Custom Focus Input Change
  const handleCustomFocusChange = (val: number) => {
    setCustomFocusMins(val);
    if (val < 1) {
      setCustomError('Custom focus duration must be at least 1 minute.');
    } else {
      setCustomError(null);
      if (!activeSession && isCustom) {
        setTimeLeft(val * 60);
      }
    }
  };

  const handleCustomBreakChange = (val: number) => {
    const valid = Math.max(1, val);
    setCustomBreakMins(valid);
  };

  // Save Reflection Handler
  const handleSaveReflection = () => {
    if (completedSessionData && reflectionText.trim()) {
      const latestLog = focusLogs[0];
      if (latestLog && latestLog.taskName === completedSessionData.taskName) {
        store.updateFocusLogReflection(latestLog.id, reflectionText);
      }
    }
    setReflectionModalOpen(false);
    setCompletedSessionData(null);
    setReflectionText('');
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Stats & Info Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center text-cyan-400 shrink-0">
              <Timer size={22} />
            </div>
            <div>
              <div className="text-xs text-slate-500">Weekly Focus Minutes</div>
              <div className="text-xl font-display font-bold text-slate-100">
                {weeklyFocusMinutes} <span className="text-xs font-normal text-slate-400">mins</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setAboutModalOpen(true)}
            className="btn-ghost text-xs text-cyan-400 hover:bg-cyan-500/10 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/20"
          >
            <HelpCircle size={15} />
            <span className="hidden sm:inline">About Deep Focus</span>
          </button>
        </div>

        <div className="card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-400 shrink-0">
              <Award size={22} />
            </div>
            <div>
              <div className="text-xs text-slate-500">Completed Sessions</div>
              <div className="text-xl font-display font-bold text-purple-400">
                {weeklyFocusLogs.length} <span className="text-xs font-normal text-slate-400">sessions</span>
              </div>
            </div>
          </div>

          <div className="text-right relative">
            <button
              type="button"
              onClick={handleHeaderNotifButtonClick}
              className="transition-all hover:scale-105 active:scale-95"
              title={
                notificationPerm === 'default'
                  ? 'Click to request browser notification permission'
                  : 'Click for browser permission settings info'
              }
            >
              {notificationPerm === 'denied' ? (
                <span className="text-rose-400 flex items-center gap-1.5 bg-rose-500/10 px-2.5 py-1 rounded-md border border-rose-500/20 font-medium text-[11px]">
                  <BellOff size={12} /> Notifs Blocked
                </span>
              ) : notificationPerm === 'granted' ? (
                <span className="text-emerald-400 flex items-center gap-1.5 bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20 font-medium text-[11px]">
                  <Bell size={12} /> Notifs Allowed
                </span>
              ) : (
                <span className="text-cyan-400 flex items-center gap-1.5 bg-cyan-500/10 px-2.5 py-1 rounded-md border border-cyan-500/20 font-medium text-[11px]">
                  <Bell size={12} /> Enable Notifs
                </span>
              )}
            </button>

            {showNotifHint && notificationPerm !== 'default' && (
              <div className="absolute right-0 top-full mt-2 w-64 p-3 bg-bg-800 border border-white/10 rounded-xl shadow-xl z-30 text-left text-xs space-y-1.5 text-slate-300 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between text-slate-100 font-semibold text-[11px]">
                  <span>Browser Settings Required</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowNotifHint(false);
                    }}
                    className="text-slate-400 hover:text-white text-xs px-1"
                  >
                    ✕
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Browsers restrict websites from changing permissions directly. To change notification access, tap the lock/info icon near your address bar → <strong className="text-slate-200">Site settings</strong> → <strong className="text-slate-200">Notifications</strong>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Timer Mode Switcher (Manual Focus Timer vs Live Schedule Sync) */}
      <div className="flex justify-center pt-1">
        <div className="inline-flex w-full max-w-sm sm:w-auto p-1 rounded-2xl bg-slate-900/90 border border-white/10 shadow-lg gap-1">
          <button
            type="button"
            onClick={() => setTimerMode('manual')}
            className={`flex-1 sm:flex-none justify-center flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              timerMode === 'manual'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Timer size={14} className={timerMode === 'manual' ? 'text-cyan-400' : 'text-slate-400'} />
            <span className="whitespace-nowrap">Manual Timer</span>
          </button>

          <button
            type="button"
            onClick={() => setTimerMode('sync')}
            className={`flex-1 sm:flex-none justify-center flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              timerMode === 'sync'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Radio size={14} className={timerMode === 'sync' ? 'text-emerald-400 animate-pulse' : 'text-slate-400'} />
            <span className="whitespace-nowrap">Live Schedule Sync</span>
            {isScheduleIgnited && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            )}
          </button>
        </div>
      </div>

      {timerMode === 'manual' ? (
        /* Main Focus Timer Card (Manual Mode) */
        <div className="card p-6 text-center space-y-6 bg-bg-800 border border-cyan-500/30 relative overflow-hidden">
          {/* Header Preset Selectors */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-400 border-b border-white/5 pb-4">
            <div className="flex items-center justify-between w-full sm:w-auto gap-2">
              <span className="font-bold text-slate-200 uppercase tracking-widest text-[11px] flex items-center gap-1.5">
                {mode === 'focus' ? '🎯 Focus Session' : '☕ Rest Break'}
                {activeSession && (
                  <span className="badge bg-cyan-500/20 text-cyan-300 text-[10px] lowercase normal-case tracking-normal">
                    {activeSession.isPaused ? 'paused' : 'live timer'}
                  </span>
                )}
              </span>
            </div>

            <div className="grid grid-cols-2 min-[440px]:grid-cols-4 sm:flex sm:flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
              <button
                disabled={!!activeSession}
                onClick={() => handlePresetSelect(25, 5, false)}
                className={`badge px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs transition-all justify-center cursor-pointer ${
                  !isCustom && focusMinutes === 25
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                    : 'bg-bg-700 text-slate-400 hover:bg-bg-600'
                } ${activeSession ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                25 / 5 min
              </button>
              <button
                disabled={!!activeSession}
                onClick={() => handlePresetSelect(50, 10, false)}
                className={`badge px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs transition-all justify-center cursor-pointer ${
                  !isCustom && focusMinutes === 50
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                    : 'bg-bg-700 text-slate-400 hover:bg-bg-600'
                } ${activeSession ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                50 / 10 min
              </button>
              <button
                disabled={!!activeSession}
                onClick={() => handlePresetSelect(90, 15, false)}
                className={`badge px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs transition-all justify-center cursor-pointer ${
                  !isCustom && focusMinutes === 90
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                    : 'bg-bg-700 text-slate-400 hover:bg-bg-600'
                } ${activeSession ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                90 / 15 min
              </button>
              <button
                disabled={!!activeSession}
                onClick={() => handlePresetSelect(customFocusMins, customBreakMins, true)}
                className={`badge px-2.5 sm:px-3 py-2 sm:py-1.5 text-xs transition-all flex items-center justify-center gap-1 cursor-pointer ${
                  isCustom
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold'
                    : 'bg-bg-700 text-slate-400 hover:bg-bg-600'
                } ${activeSession ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <Sliders size={12} className="shrink-0" />
                <span>Custom</span>
              </button>
            </div>
          </div>

          {/* Custom Duration Configurator */}
          {isCustom && !activeSession && (
            <div className="p-4 bg-bg-900/60 rounded-xl border border-cyan-500/20 max-w-md mx-auto text-left space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-cyan-300 flex items-center gap-1.5">
                  <Sliders size={14} /> Custom Duration Settings
                </span>
                <span className="text-[10px] text-slate-500">Min 1m • No Upper Limit</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Focus Duration (mins)</label>
                  <input
                    type="number"
                    min="1"
                    step="5"
                    value={customFocusMins}
                    onChange={(e) => handleCustomFocusChange(parseInt(e.target.value) || 0)}
                    className="input text-xs font-bold text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-400 mb-1">Break Duration (mins)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={customBreakMins}
                    onChange={(e) => handleCustomBreakChange(parseInt(e.target.value) || 1)}
                    className="input text-xs text-slate-100"
                  />
                </div>
              </div>

              {customError && (
                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-2">
                  <AlertTriangle size={14} className="shrink-0" />
                  <span>{customError}</span>
                </div>
              )}
            </div>
          )}

          {/* Big Timer Display */}
          <div className="py-2">
            <div className="text-6xl sm:text-7xl font-display font-bold text-slate-100 tracking-tight">
              {formatTime(timeLeft)}
            </div>
            {activeSession && (
              <p className="text-xs text-slate-400 mt-2 flex items-center justify-center gap-1.5">
                <Clock size={13} className="text-cyan-400" />
                <span>
                  Timestamp-persisted session ({activeSession.totalSessionMinutes} mins) • Survives backgrounding & reloads
                </span>
              </p>
            )}
          </div>

          {/* Task Tagging Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto text-left">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Task Name</label>
              <input
                type="text"
                disabled={!!activeSession}
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                placeholder="What are you working on?"
                className="input text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Tag Skill (Optional)</label>
              <select
                disabled={!!activeSession}
                value={selectedSkillId}
                onChange={(e) => setSelectedSkillId(e.target.value)}
                className="input text-xs"
              >
                <option value="">-- Select Skill --</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col min-[420px]:flex-row items-center justify-center gap-2.5 sm:gap-3 pt-2 w-full">
            {!activeSession ? (
              <button
                onClick={handleStartSession}
                disabled={isCustom && customFocusMins < 1}
                className={`w-full min-[420px]:w-auto px-6 py-3 rounded-xl font-bold text-sm shadow-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isCustom && customFocusMins < 1
                    ? 'bg-slate-700 text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-cyan-500/20 hover:from-cyan-600 hover:to-blue-700'
                }`}
              >
                <Play size={18} />
                <span>Start Focus Session</span>
              </button>
            ) : isRunning ? (
              <button
                onClick={handlePauseSession}
                className="w-full min-[420px]:w-auto px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Pause size={18} />
                <span>Pause Timer</span>
              </button>
            ) : (
              <button
                onClick={handleResumeSession}
                className="w-full min-[420px]:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold text-sm shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 hover:from-cyan-600 hover:to-blue-700 cursor-pointer"
              >
                <Play size={18} />
                <span>Resume Session</span>
              </button>
            )}

            <button
              onClick={handleRequestReset}
              className="w-full min-[420px]:w-auto btn-ghost text-xs text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 py-2.5 sm:py-3 cursor-pointer"
            >
              <RotateCcw size={16} />
              <span>{activeSession ? 'Discard Session' : 'Reset'}</span>
            </button>
          </div>
        </div>
      ) : (
        /* Live Schedule HUD View (Sync Mode) */
        !isScheduleIgnited ? (
          /* State A: Not Ignited */
          <div className="card p-8 text-center space-y-6 bg-gradient-to-b from-slate-900/90 via-slate-900/60 to-slate-950 border border-emerald-500/30 rounded-2xl relative overflow-hidden shadow-2xl">
            <div className="max-w-md mx-auto space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
                <Flame size={32} className="animate-pulse" />
              </div>

              <div>
                <h2 className="text-xl font-display font-bold text-slate-100 mb-1">
                  Autonomous Schedule HUD
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Ignite today&apos;s blueprint schedule to dynamically sync your focus environment with your real-time time blocks.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 text-xs text-slate-300 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-400">
                  <CalendarDays size={15} className="text-emerald-400" />
                  <span>Today&apos;s Blocks ({todayBlocks.length})</span>
                </div>
                <span className="font-semibold text-emerald-300">
                  {formatDurationHuman(liveSchedule.totalScheduledMinutesToday)} total
                </span>
              </div>

              <button
                type="button"
                onClick={handleIgniteSchedule}
                className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2.5 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <Flame size={18} className="fill-current text-amber-300" />
                <span>Ignite Today&apos;s Schedule</span>
              </button>
            </div>
          </div>
        ) : showStopConfirm ? (
          /* State: Custom Stop Confirmation UI */
          <div className="card p-8 text-center space-y-6 bg-gradient-to-b from-rose-950/90 to-slate-950 border border-rose-500/50 rounded-2xl relative overflow-hidden shadow-2xl">
            <div className="max-w-md mx-auto space-y-5 py-4">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto shadow-inner">
                <PowerOff className="animate-pulse" size={32} />
              </div>

              <div className="space-y-2">
                <h2 className="text-2xl font-display font-bold text-rose-100">Disengage Live Sync?</h2>
                <p className="text-sm text-slate-300">
                  This will immediately stop autonomous tracking and return you to the manual timer mode. Are you sure?
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowStopConfirm(false)}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold border border-white/10 transition-all cursor-pointer"
                >
                  Cancel, Keep Tracking
                </button>
                <button
                  type="button"
                  onClick={executeStopSync}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold shadow-lg shadow-rose-900/40 transition-all cursor-pointer"
                >
                  Yes, Disengage Sync
                </button>
              </div>
            </div>
          </div>
        ) : overdueBlock ? (
          /* State D: The Accountability Lock (Overdue Block) */
          <div className="card p-6 sm:p-8 text-center space-y-6 bg-gradient-to-b from-rose-950/60 via-slate-900/95 to-slate-950 border-2 border-rose-500/60 relative overflow-hidden rounded-2xl shadow-2xl shadow-rose-950/50">
            {/* Warning Indicator Banner */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-rose-300/80 border-b border-rose-500/20 pb-4">
              <div className="flex items-center gap-2">
                <span className="badge bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1">
                  <AlertTriangle size={13} className="text-rose-400 animate-bounce" />
                  LIVE TRACKER BLOCK • OVERDUE
                </span>
                <span className="text-[11px] font-mono text-rose-300/70">
                  {formatTime12h(overdueBlock.startTime)} – {formatTime12h(overdueBlock.endTime)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => handleStopSync(e)}
                  title="Stop Schedule Sync"
                  className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium text-rose-300/80 hover:text-rose-200 hover:bg-rose-500/20 border border-rose-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <PowerOff size={13} />
                  <span className="hidden sm:inline">Stop Sync</span>
                </button>
              </div>
            </div>

            {/* Warning Icon & Heading */}
            <div className="space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto shadow-inner">
                <AlertTriangle size={32} className="animate-pulse text-rose-400" />
              </div>

              <div className="space-y-1">
                <h2 className="text-2xl sm:text-3xl font-display font-bold text-rose-100 tracking-tight">
                  Action Required: Block Overdue
                </h2>
                <p className="text-sm text-slate-300 max-w-lg mx-auto">
                  Did you complete <strong className="text-rose-300 font-semibold">{overdueBlock.customTitle || overdueBlockActivity?.name || 'this scheduled block'}</strong>?
                </p>
              </div>

              {/* Block Details Pill */}
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-950/40 border border-rose-500/30 text-xs">
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${overdueBlockActivity?.color || '#f43f5e'}25`,
                    color: overdueBlockActivity?.color || '#f43f5e',
                  }}
                >
                  <ActivityIcon iconName={overdueBlockActivity?.icon || 'Clock'} size={12} />
                </div>
                <span className="font-semibold text-rose-200">{overdueBlock.customTitle || overdueBlockActivity?.name || 'Scheduled Block'}</span>
                <span className="text-[10px] text-rose-400 font-mono">
                  (Ended at {formatTime12h(overdueBlock.endTime)})
                </span>
              </div>
            </div>

            {/* Locked Timer Display */}
            <div className="py-2 space-y-2">
              <div className="text-6xl sm:text-8xl font-display font-black text-rose-400 tracking-tight drop-shadow-sm font-mono animate-pulse">
                00:00
              </div>
              <p className="text-xs text-rose-300/80 flex items-center justify-center gap-1.5 font-mono">
                <Clock size={13} className="text-rose-400" />
                <span>HUD locked. Awaiting completion confirmation to resume schedule.</span>
              </p>
            </div>

            {/* Prominent Action Button & Skip */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3 max-w-lg mx-auto">
              <button
                type="button"
                onClick={() => {
                  try {
                    store.toggleDailyTimeBlockCompleted(todayDateKey, overdueBlock.id);
                    showSuccessToast('Block Completed', 'Marked overdue block as completed.');
                  } catch (err: any) {
                    showErrorToast('Failed to Complete Block', err?.message);
                  }
                }}
                className="w-full sm:flex-1 py-3.5 px-6 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-sm shadow-xl shadow-rose-950/80 flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer border border-rose-400/40"
              >
                <CheckCircle2 size={18} className="text-white shrink-0" />
                <span>Mark Completed</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  try {
                    store.markDailyTimeBlockSkipped(todayDateKey, overdueBlock.id);
                    showSuccessToast('Block Skipped', 'Marked overdue block as skipped.');
                  } catch (err: any) {
                    showErrorToast('Failed to Skip Block', err?.message);
                  }
                }}
                className="w-full sm:w-auto py-3.5 px-5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 border border-white/10 text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer"
              >
                <SkipForward size={16} className="text-slate-400" />
                <span>Skip Block</span>
              </button>
            </div>
          </div>
        ) : activeBlock ? (
          /* State B: Ignited & Active Block */
          <div className="card p-6 sm:p-8 text-center space-y-6 bg-gradient-to-b from-slate-900/95 to-slate-950 border border-emerald-500/40 relative overflow-hidden rounded-2xl shadow-2xl">
            {/* Live HUD Indicator Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-400 border-b border-white/5 pb-4">
              <div className="flex items-center gap-2">
                <span className="badge bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1">
                  <Radio size={12} className="text-emerald-400 animate-pulse" />
                  LIVE TRACKER BLOCK
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  {formatTime12h(activeBlock.startTime)} – {formatTime12h(activeBlock.endTime)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                {activeBlock.originalStartTime && (
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        store.undoEarlyStartTimeBlock(todayDateKey, activeBlock.id);
                        showSuccessToast('Reverted Start Time', `Start time reverted back to ${formatTime12h(activeBlock.originalStartTime!)}`);
                      } catch (err: any) {
                        showErrorToast('Failed to Revert', err?.message);
                      }
                    }}
                    title={`Revert start time back to ${formatTime12h(activeBlock.originalStartTime)}`}
                    className="flex-1 min-w-[100px] sm:flex-none justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                  >
                    <RotateCcw size={13} />
                    <span>Undo Early Start</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    try {
                      const nowStr = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
                      store.markDailyTimeBlockSkipped(todayDateKey, activeBlock.id, nowStr);
                      showSuccessToast('Block Skipped', 'Live block marked as skipped.');
                    } catch (err: any) {
                      showErrorToast('Failed to Skip Block', err?.message);
                    }
                  }}
                  className="flex-1 min-w-[100px] sm:flex-none justify-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-slate-400 hover:text-slate-200 hover:bg-white/10 border border-white/10 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <SkipForward size={13} className="text-slate-400" />
                  <span>Skip Block</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    try {
                      const nowStr = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
                      store.toggleDailyTimeBlockCompleted(todayDateKey, activeBlock.id, nowStr);
                      if (!activeBlock.completed) {
                        showSuccessToast('Block Completed', `Ended at ${formatTime12h(nowStr)}`);
                      }
                    } catch (err: any) {
                      showErrorToast('Failed to Complete Block', err?.message);
                    }
                  }}
                  className={`flex-1 min-w-[100px] sm:flex-none justify-center px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                    activeBlock.completed
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  <CheckCircle2 size={13} className={activeBlock.completed ? 'text-emerald-400' : 'text-slate-400'} />
                  <span>{activeBlock.completed ? 'Completed' : 'Mark Completed'}</span>
                </button>

                <button
                  type="button"
                  onClick={(e) => handleStopSync(e)}
                  title="Stop Schedule Sync"
                  className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-white/5 hover:border-rose-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <PowerOff size={13} />
                  <span className="hidden sm:inline">Stop Sync</span>
                </button>
              </div>
            </div>

            {/* Active Block Title & Secondary Activity Badges */}
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/10 text-xs">
                <div
                  className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${activeBlockActivity?.color || '#10b981'}25`,
                    color: activeBlockActivity?.color || '#10b981',
                  }}
                >
                  <ActivityIcon iconName={activeBlockActivity?.icon || 'Clock'} size={12} />
                </div>
                <span className="font-semibold text-slate-200">{activeBlockActivity?.name || 'Active Task'}</span>
                {activeBlockActivity?.ascendModule && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!onNavigate) return;
                      const targetView = getAscendViewForModule(activeBlockActivity.ascendModule, activeBlockActivity.name);
                      if (targetView) onNavigate(targetView);
                    }}
                    className={`text-[10px] text-emerald-400 font-mono flex items-center gap-0.5 ${
                      onNavigate ? 'hover:text-emerald-300 hover:underline cursor-pointer' : ''
                    }`}
                    title={onNavigate ? `Open ${activeBlockActivity.ascendModule} module` : undefined}
                  >
                    <span>[{activeBlockActivity.ascendModule}]</span>
                  </button>
                )}
              </div>

              <h2 className="text-2xl sm:text-4xl font-display font-bold text-slate-100 tracking-tight max-w-2xl mx-auto">
                {activeBlock.customTitle || activeBlockActivity?.name || 'Scheduled Block'}
              </h2>

              {activeBlock.originalStartTime && (
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium mx-auto">
                  <Clock size={12} className="text-amber-400" />
                  <span>Started early (originally scheduled for {formatTime12h(activeBlock.originalStartTime)})</span>
                </div>
              )}

              {/* Secondary Activities Badges in Emerald */}
              {activeBlock.secondaryActivityIds && activeBlock.secondaryActivityIds.length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 max-w-full">
                  {activeBlock.secondaryActivityIds.map((secId) => {
                    const secAct = activityMap.get(secId);
                    if (!secAct) return null;
                    const hasMod = Boolean(secAct.ascendModule && onNavigate);
                    return (
                      <button
                        type="button"
                        key={secId}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (secAct.ascendModule && onNavigate) {
                            const targetView = getAscendViewForModule(secAct.ascendModule, secAct.name);
                            if (targetView) onNavigate(targetView);
                          }
                        }}
                        className={`text-xs font-medium text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg flex items-center gap-1 shadow-sm truncate max-w-full ${
                          hasMod ? 'hover:bg-emerald-500/25 cursor-pointer hover:underline' : ''
                        }`}
                        title={secAct.ascendModule && onNavigate ? `Open ${secAct.ascendModule} module` : secAct.name}
                      >
                        <Zap size={11} className="text-emerald-400 shrink-0" />
                        <span className="truncate">+{secAct.name}</span>
                        {secAct.ascendModule && (
                          <span className="text-[10px] text-emerald-400/80 font-mono">[{secAct.ascendModule}]</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Massive Live Countdown */}
            <div className="py-2 space-y-2">
              <div className="text-6xl sm:text-8xl font-display font-black text-emerald-300 tracking-tight drop-shadow-sm font-mono">
                {formatSeconds(activeBlockRemainingSeconds)}
              </div>
              <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5 font-mono">
                <Clock size={13} className="text-emerald-400" />
                <span>
                  Time remaining until {formatTime12h(activeBlock.endTime)} ({Math.ceil(activeBlockRemainingSeconds / 60)} mins left)
                </span>
              </p>
            </div>

            {/* Live Progress Bar */}
            <div className="max-w-md mx-auto space-y-1.5">
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span>{formatTime12h(activeBlock.startTime)}</span>
                <span>{Math.round(activeBlockProgress)}% elapsed</span>
                <span>{formatTime12h(activeBlock.endTime)}</span>
              </div>
              <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-white/5">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-1000"
                  style={{ width: `${activeBlockProgress}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          /* State C: Ignited & Gap/Empty */
          <div className="card p-6 sm:p-8 text-center space-y-6 bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-700/50 rounded-2xl relative overflow-hidden shadow-2xl">
            {/* Top Bar with Status Badge & Stop Sync in normal flow */}
            <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-4 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                {currentResolvedBlock?.skipped ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500/10 border border-slate-500/30 text-slate-300 text-xs font-semibold shadow-sm">
                    <SkipForward className="text-slate-400" size={12} />
                    <span>Block Skipped</span>
                  </div>
                ) : currentResolvedBlock?.completed ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold shadow-sm">
                    <CheckCircle2 className="text-cyan-400" size={12} />
                    <span>Completed Early</span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold shadow-sm">
                    <Clock className="text-amber-400 animate-pulse" size={12} />
                    <span>Unscheduled Time</span>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={(e) => handleStopSync(e)}
                title="Stop Schedule Sync"
                className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-white/5 hover:border-rose-500/20 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <PowerOff size={13} />
                <span className="hidden sm:inline">Stop Sync</span>
              </button>
            </div>

            {nextBlock ? (
              <div className="max-w-lg mx-auto space-y-5">
                <div className="space-y-1">
                  <h2 className="text-xl sm:text-2xl font-display font-bold text-slate-100">
                    {currentResolvedBlock?.skipped
                      ? 'Block Skipped'
                      : currentResolvedBlock?.completed
                      ? 'Time Recovered'
                      : 'Unscheduled Time'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    Next block starts in <strong className="text-emerald-300 font-semibold">{gapMinsUntilNext} minutes</strong>
                  </p>
                </div>

                {/* Countdown to Next Block */}
                <div className="text-5xl sm:text-6xl font-display font-bold text-amber-300 font-mono tracking-tight drop-shadow-sm">
                  {formatSeconds(gapRemainingSeconds)}
                </div>

                {/* Undo Block Banner if user is still inside resolved block time window */}
                {currentResolvedBlock && (
                  <div className="p-3 px-4 rounded-xl bg-white/[0.03] border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left shadow-sm">
                    <div className="flex items-center gap-3 w-full min-w-0">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${currentResolvedBlockActivity?.color || '#06b6d4'}25`,
                          color: currentResolvedBlockActivity?.color || '#06b6d4',
                        }}
                      >
                        <ActivityIcon iconName={currentResolvedBlockActivity?.icon || 'Clock'} size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-200 truncate">
                          {currentResolvedBlock.customTitle || currentResolvedBlockActivity?.name || 'Scheduled Block'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {currentResolvedBlock.skipped ? 'Skipped' : 'Completed'} ({formatTime12h(currentResolvedBlock.startTime)} – {formatTime12h(currentResolvedBlock.endTime)})
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        try {
                          store.undoDailyTimeBlockResolution(todayDateKey, currentResolvedBlock.id);
                          showSuccessToast('Status Reverted', `Reverted ${currentResolvedBlock.skipped ? 'skipped' : 'completed'} status.`);
                        } catch (err: any) {
                          showErrorToast('Failed to Undo', err?.message);
                        }
                      }}
                      className="w-full sm:w-auto mt-3 sm:mt-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm shrink-0"
                    >
                      <RotateCcw size={12} />
                      <span>Undo {currentResolvedBlock.skipped ? 'Skip' : 'Completion'}</span>
                    </button>
                  </div>
                )}

                {/* Next Block Preview Card */}
                <div className="p-4 rounded-xl bg-white/[0.04] border border-white/10 text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-md hover:border-emerald-500/30 transition-all">
                  <div className="flex items-start sm:items-center gap-3 w-full min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                      style={{
                        backgroundColor: `${nextBlockActivity?.color || '#10b981'}25`,
                        color: nextBlockActivity?.color || '#10b981',
                      }}
                    >
                      <ActivityIcon iconName={nextBlockActivity?.icon || 'Clock'} size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-100 truncate">
                        {nextBlock.customTitle || nextBlockActivity?.name || 'Upcoming Block'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        Starts at {formatTime12h(nextBlock.startTime)} – {formatTime12h(nextBlock.endTime)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:items-end w-full sm:w-auto gap-2 shrink-0">
                    <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                      Scheduled: {formatTime12h(nextBlock.startTime)} – {formatTime12h(nextBlock.endTime)}
                    </span>
                    <div className="flex flex-col min-[400px]:flex-row sm:flex-row w-full sm:w-auto gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const nowStr = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
                          try {
                            store.pullForwardDailyTimeBlock(todayDateKey, nextBlock.id, nowStr, 'shift');
                            showSuccessToast('Block moved to now', `Started early at ${formatTime12h(nowStr)}`);
                          } catch (err: any) {
                            showErrorToast('Could Not Move Block', err?.message || 'Cannot move block due to a schedule collision.');
                          }
                        }}
                        className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg text-[11px] font-semibold bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                        title="Starts early, ends early (Maintains exact duration)"
                      >
                        <ArrowRight size={12} />
                        <span>Move (Keep Length)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const nowStr = `${currentTime.getHours().toString().padStart(2, '0')}:${currentTime.getMinutes().toString().padStart(2, '0')}`;
                          try {
                            store.pullForwardDailyTimeBlock(todayDateKey, nextBlock.id, nowStr, 'stretch');
                            showSuccessToast('Block extended to now', `Started early at ${formatTime12h(nowStr)}`);
                          } catch (err: any) {
                            showErrorToast('Could Not Extend Block', err?.message || 'Cannot extend block due to a schedule collision.');
                          }
                        }}
                        className="w-full sm:w-auto px-3 py-2 sm:py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                        title="Starts early, keeps original end time (Extends duration)"
                      >
                        <Play className="fill-current" size={12} />
                        <span>Extend (Extra Time)</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : todayBlocks.length > 0 ? (
              <div className="max-w-md mx-auto space-y-4 py-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle2 size={24} />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-slate-100">All Scheduled Blocks Resolved</h2>
                  <p className="text-xs text-slate-400">
                    All scheduled blueprint blocks for today have been completed or resolved. Great work!
                  </p>
                </div>

                {currentResolvedBlock && (
                  <div className="p-3 px-4 rounded-xl bg-white/[0.03] border border-cyan-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-left shadow-sm mt-2">
                    <div className="flex items-center gap-3 w-full min-w-0">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: `${currentResolvedBlockActivity?.color || '#06b6d4'}25`,
                          color: currentResolvedBlockActivity?.color || '#06b6d4',
                        }}
                      >
                        <ActivityIcon iconName={currentResolvedBlockActivity?.icon || 'Clock'} size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-slate-200 truncate">
                          {currentResolvedBlock.customTitle || currentResolvedBlockActivity?.name || 'Scheduled Block'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {currentResolvedBlock.skipped ? 'Skipped' : 'Completed'} ({formatTime12h(currentResolvedBlock.startTime)} – {formatTime12h(currentResolvedBlock.endTime)})
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        try {
                          store.undoDailyTimeBlockResolution(todayDateKey, currentResolvedBlock.id);
                          showSuccessToast('Status Reverted', `Reverted ${currentResolvedBlock.skipped ? 'skipped' : 'completed'} status.`);
                        } catch (err: any) {
                          showErrorToast('Failed to Undo', err?.message);
                        }
                      }}
                      className="w-full sm:w-auto mt-3 sm:mt-0 px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm shrink-0"
                    >
                      <RotateCcw size={12} />
                      <span>Undo {currentResolvedBlock.skipped ? 'Skip' : 'Completion'}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-md mx-auto space-y-3 py-4">
                <div className="w-12 h-12 rounded-xl bg-slate-800 border border-white/10 text-slate-400 flex items-center justify-center mx-auto">
                  <CalendarDays size={24} />
                </div>
                <h2 className="text-lg font-bold text-slate-100">No Blocks Scheduled Today</h2>
                <p className="text-xs text-slate-400">
                  Open the Time Tracker module to apply a recurring blueprint or schedule custom blocks for today.
                </p>
              </div>
            )}
          </div>
        )
      )}

      {/* Focus History */}
      {focusLogs.length > 0 && (
        <div className="w-full max-w-full min-w-0 overflow-x-hidden">
          <h2 className="section-title mb-3">Recent Focus Sessions</h2>
          <div className="space-y-2 w-full max-w-full min-w-0">
            {focusLogs.slice(0, 10).map((log) => {
              const skill = skills.find((s) => s.id === log.skillId);
              return (
                <div key={log.id} className="card p-3 space-y-1.5 card-hover text-xs w-full max-w-full min-w-0 overflow-hidden">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-200 truncate">{log.taskName}</div>
                      <div className="text-[10px] text-slate-500 truncate">
                        {formatDateLong(log.date)} • {log.durationMinutes} mins {skill ? `• ${skill.name}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-full border border-cyan-500/20 whitespace-nowrap">
                        +{log.pointsAwarded} pts
                      </span>
                      <button
                        onClick={() => setDeleteModalLog(log)}
                        className="text-slate-600 hover:text-rose-400 p-1 transition-colors shrink-0"
                        title="Delete Focus Session Log"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {log.reflection && (
                    <div className="p-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/15 text-cyan-200 text-[11px] italic break-words [overflow-wrap:anywhere] whitespace-pre-wrap max-w-full min-w-0">
                      "<span className="not-italic font-medium text-slate-300">Reflection:</span> {log.reflection}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* "About Deep Work" Info Modal */}
      <Modal open={aboutModalOpen} onClose={() => setAboutModalOpen(false)} title="About Deep Focus & Executive Training">
        <div className="space-y-5 text-slate-300 text-xs leading-relaxed max-h-[75vh] overflow-y-auto pr-1">
          {/* Section 1 */}
          <div className="p-3.5 bg-cyan-500/10 rounded-xl border border-cyan-500/20 space-y-1.5">
            <h3 className="font-bold text-cyan-300 text-sm flex items-center gap-2">
              <Zap size={16} /> What is Deep Work?
            </h3>
            <p className="text-slate-300">
              Coined by Georgetown computer scientist Cal Newport, <strong>Deep Work</strong> refers to professional activities performed in a state of distraction-free concentration that push your cognitive capabilities to their limits.
            </p>
          </div>

          {/* Section 2 */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-100 flex items-center gap-1.5">
              <BrainCircuit size={15} className="text-purple-400" /> Prefrontal Cortex & Neural Plasticity
            </h4>
            <p className="text-slate-400">
              Deep focus activates the <em>dorsolateral prefrontal cortex (dlPFC)</em>, which manages impulse control, working memory, and strategic problem-solving. By single-tasking for extended periods:
            </p>
            <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1">
              <li><strong>Myelin Insulation:</strong> Repeated neural firing wraps axons in myelin, making focus faster and less tiring.</li>
              <li><strong>Dopamine Baseline Restoration:</strong> Quitting social media switching lowers baseline overstimulation, restoring drive and satisfaction.</li>
              <li><strong>Default Mode Network Suppression:</strong> Reduces anxious rumination and impulsive task-switching.</li>
            </ul>
          </div>

          {/* Section 3 */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-100 flex items-center gap-1.5">
              <CheckCircle2 size={15} className="text-emerald-400" /> Best Practices for Max Impact
            </h4>
            <div className="grid grid-cols-1 gap-2 text-slate-400">
              <div className="p-2.5 bg-bg-800 rounded-lg border border-white/5">
                <span className="font-bold text-slate-200 block mb-0.5">1. Strict Zero Distractions</span>
                Put your phone out of sight, close unrelated browser tabs, and disable notifications during focus blocks.
              </div>
              <div className="p-2.5 bg-bg-800 rounded-lg border border-white/5">
                <span className="font-bold text-slate-200 block mb-0.5">2. Right-Sized Session Durations</span>
                25 mins for beginners (Pomodoro), 50 mins for core tasks, and up to 90–120+ mins for complex multi-hour deep focus.
              </div>
              <div className="p-2.5 bg-bg-800 rounded-lg border border-white/5">
                <span className="font-bold text-slate-200 block mb-0.5">3. Genuine Rest Breaks</span>
                Step away from screens during breaks—stretch, walk, hydrate. Do not swap focus for social media scrolling.
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button onClick={() => setAboutModalOpen(false)} className="btn-primary text-xs px-6 py-2">
              Got It
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Dialog for Discarding Active Session */}
      <Modal open={confirmResetOpen} onClose={() => setConfirmResetOpen(false)} title="Discard Active Focus Session?">
        <div className="space-y-4 text-xs text-slate-300">
          <p>
            You currently have an active focus session in progress. Discarding will stop the timer and no points or logs will be saved.
          </p>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200 flex items-center gap-2">
            <AlertTriangle size={18} className="shrink-0 text-amber-400" />
            <span>Are you sure you want to discard your current progress?</span>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setConfirmResetOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button onClick={handleConfirmDiscardSession} className="btn-primary bg-rose-500 hover:bg-rose-600 text-white flex-1">
              Discard Session
            </button>
          </div>
        </div>
      </Modal>

      {/* Post-Session Reflection Modal */}
      <Modal open={reflectionModalOpen} onClose={() => setReflectionModalOpen(false)} title="Focus Session Completed! 🎉">
        <div className="space-y-4">
          <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-xs text-cyan-200">
            Great job! You logged <strong>{completedSessionData?.durationMinutes} minutes</strong> of focus on <strong>"{completedSessionData?.taskName}"</strong>.
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Post-Session Reflection (Optional)
            </label>
            <textarea
              value={reflectionText}
              onChange={(e) => setReflectionText(e.target.value)}
              placeholder="What did you accomplish during this focus session? What went well?"
              className="input min-h-[90px] text-xs"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={() => setReflectionModalOpen(false)} className="btn-secondary flex-1 text-xs">
              Skip
            </button>
            <button onClick={handleSaveReflection} className="btn-primary flex-1 text-xs flex items-center justify-center gap-1.5">
              <Sparkles size={14} />
              <span>Save Reflection</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        open={!!deleteModalLog}
        onClose={() => setDeleteModalLog(null)}
        onConfirm={() => {
          if (deleteModalLog) {
            store.deleteFocusLog(deleteModalLog.id);
            setDeleteModalLog(null);
          }
        }}
        title="Delete Focus Session?"
        itemName={deleteModalLog?.taskName}
        description={`Are you sure you want to delete focus log "${deleteModalLog?.taskName}"? Any points awarded (+${deleteModalLog?.pointsAwarded || 0} pts) will be reversed.`}
      />
    </div>
  );
}

// ----------------------------------------------------------------------
// 2. DECISION JOURNAL SUBMODULE
// ----------------------------------------------------------------------
function DecisionJournalSubmodule({ store }: { store: AppStore }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [reflectModalDecision, setReflectModalDecision] = useState<any | null>(null);
  const [deleteModalDecision, setDeleteModalDecision] = useState<any | null>(null);

  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');
  const [expectedOutcome, setExpectedOutcome] = useState('');
  const [revisitDate, setRevisitDate] = useState(todayKey());

  const [reflectionText, setReflectionText] = useState('');

  const decisionLogs = store.state.decisionLogs;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !rationale.trim()) return;
    store.addDecision(title, rationale, expectedOutcome, revisitDate);
    setModalOpen(false);
    setTitle('');
    setRationale('');
    setExpectedOutcome('');
  };

  const handleReflectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reflectModalDecision || !reflectionText.trim()) return;
    store.reflectDecision(reflectModalDecision.id, reflectionText);
    setReflectModalDecision(null);
    setReflectionText('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">Decision Journal</h2>
          <p className="text-xs text-slate-500">Log major decisions and revisit them to eliminate cognitive bias (+15 pts per reflection)</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary text-xs flex items-center gap-1.5">
          <Plus size={16} />
          <span>Log Decision</span>
        </button>
      </div>

      {decisionLogs.length === 0 ? (
        <div className="card p-8 text-center">
          <Scale size={32} className="mx-auto text-slate-600 mb-2" />
          <p className="text-sm font-medium text-slate-400">No decisions logged yet</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">Log key choices, your rationale, and set a future date to review how it played out.</p>
          <button onClick={() => setModalOpen(true)} className="btn-primary mx-auto">
            Log Your First Decision
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {decisionLogs.map((d) => (
            <div key={d.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                    {d.title}
                    {d.isReflected ? (
                      <span className="badge bg-purple-500/15 text-purple-400 text-[10px]">Reflected (+15 pts)</span>
                    ) : (
                      <span className="badge bg-amber-500/15 text-amber-300 text-[10px]">Revisit: {d.revisitDate}</span>
                    )}
                  </h3>
                </div>
                <button
                  onClick={() => setDeleteModalDecision(d)}
                  className="text-slate-600 hover:text-rose-400 p-1 transition-colors"
                  title="Delete Decision Journal Entry"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300 bg-bg-800/80 p-3 rounded-xl border border-white/5">
                <div>
                  <span className="text-slate-500 font-medium block">Why / Rationale:</span>
                  <p>{d.rationale}</p>
                </div>
                <div>
                  <span className="text-slate-500 font-medium block">Expected Outcome:</span>
                  <p>{d.expectedOutcome || 'None specified'}</p>
                </div>
              </div>

              {d.reflection ? (
                <div className="p-3 bg-purple-500/10 rounded-xl text-xs text-purple-200 border border-purple-500/20 break-words [overflow-wrap:anywhere] whitespace-pre-wrap max-w-full min-w-0">
                  <span className="font-bold text-purple-300 block mb-1">Reflection & Learnings:</span>
                  "{d.reflection}"
                </div>
              ) : (
                <button
                  onClick={() => setReflectModalDecision(d)}
                  className="btn-secondary text-xs w-full py-1.5 flex items-center justify-center gap-1.5"
                >
                  <Sparkles size={14} className="text-purple-400" />
                  <span>Revisit & Add Reflection (+15 pts)</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Log Decision Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Log New Decision">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Decision Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Switch to a new project framework"
              className="input"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Rationale / Why are you deciding this?</label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="What context, data, or assumptions led to this decision?"
              className="input min-h-[80px]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Expected Outcome</label>
            <input
              type="text"
              value={expectedOutcome}
              onChange={(e) => setExpectedOutcome(e.target.value)}
              placeholder="What do you expect will happen?"
              className="input"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Date to Revisit</label>
            <input
              type="date"
              value={revisitDate}
              onChange={(e) => setRevisitDate(e.target.value)}
              className="input"
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Save Decision
            </button>
          </div>
        </form>
      </Modal>

      {/* Reflect Modal */}
      <Modal open={!!reflectModalDecision} onClose={() => setReflectModalDecision(null)} title={`Reflect: ${reflectModalDecision?.title}`}>
        <form onSubmit={handleReflectionSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">What actually happened? What did you learn?</label>
            <textarea
              value={reflectionText}
              onChange={(e) => setReflectionText(e.target.value)}
              placeholder="Compare the actual outcome to your expected outcome..."
              className="input min-h-[100px]"
              required
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setReflectModalDecision(null)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Save Reflection (+15 pts)
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        open={!!deleteModalDecision}
        onClose={() => setDeleteModalDecision(null)}
        onConfirm={() => {
          if (deleteModalDecision) {
            store.deleteDecisionLog(deleteModalDecision.id);
            setDeleteModalDecision(null);
          }
        }}
        title="Delete Decision Journal Entry?"
        itemName={deleteModalDecision?.title}
        description={`Are you sure you want to delete decision entry "${deleteModalDecision?.title}"?`}
      />
    </div>
  );
}

// ----------------------------------------------------------------------
// 3. EMOTION LABELING TOOL SUBMODULE
// ----------------------------------------------------------------------
function EmotionLabelerSubmodule({ store }: { store: AppStore }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalEmotion, setDeleteModalEmotion] = useState<any | null>(null);
  const [emotion, setEmotion] = useState('Anxiety');
  const [customEmotion, setCustomEmotion] = useState('');
  const [intensity, setIntensity] = useState(5);
  const [context, setContext] = useState('');

  const emotionLogs = store.state.emotionLogs;

  const COMMON_EMOTIONS = ['Anxiety', 'Frustration', 'Joy', 'Overwhelm', 'Anger', 'Pride', 'Sadness', 'Calm'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalEmotion = emotion === 'Other' ? customEmotion : emotion;
    if (!finalEmotion.trim()) return;
    store.logEmotion(finalEmotion, Number(intensity), context);
    setModalOpen(false);
    setContext('');
  };

  // Compute emotion frequency breakdown
  const emotionCounts: Record<string, number> = {};
  emotionLogs.forEach((l) => {
    emotionCounts[l.emotion] = (emotionCounts[l.emotion] || 0) + 1;
  });

  const sortedEmotions = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">Affect & Emotion Labeling Tool</h2>
          <p className="text-xs text-slate-500">Name feelings explicitly ("Name it to tame it") to reduce amygdala reactivity (+5 pts per entry)</p>
        </div>
        <button onClick={() => setModalOpen(true)} className="btn-primary text-xs flex items-center gap-1.5">
          <Plus size={16} />
          <span>Label Emotion</span>
        </button>
      </div>

      {/* Emotion Frequency Summary */}
      {sortedEmotions.length > 0 && (
        <div className="card p-4">
          <h3 className="text-xs font-bold text-slate-300 mb-3">Most Frequently Labeled Emotions</h3>
          <div className="flex flex-wrap gap-2">
            {sortedEmotions.map(([name, count]) => (
              <div key={name} className="badge bg-rose-500/15 text-rose-300 border border-rose-500/30 px-3 py-1.5 text-xs font-medium flex items-center gap-2">
                <span>{name}</span>
                <span className="bg-rose-500/30 px-1.5 py-0.5 rounded-full font-bold text-[10px]">{count}x</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emotion Logs List */}
      {emotionLogs.length === 0 ? (
        <div className="card p-8 text-center">
          <HeartHandshake size={32} className="mx-auto text-slate-600 mb-2" />
          <p className="text-sm font-medium text-slate-400">No emotions labeled yet</p>
          <p className="text-xs text-slate-500 mt-1 mb-4">When experiencing a strong feeling, label it explicitly to calm prefrontal reactivity.</p>
          <button onClick={() => setModalOpen(true)} className="btn-primary mx-auto">
            Label Your First Emotion
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {emotionLogs.slice(0, 15).map((l) => (
            <div key={l.id} className="card p-3.5 flex items-center justify-between card-hover text-xs">
              <div>
                <div className="font-bold text-slate-200 flex items-center gap-2">
                  {l.emotion}
                  <span className="text-rose-400 font-mono">({l.intensity}/10)</span>
                </div>
                {l.context && <p className="text-slate-400 mt-0.5">{l.context}</p>}
                <p className="text-[10px] text-slate-500 mt-1">{formatDateLong(l.date)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-rose-400 bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
                  +5 pts
                </span>
                <button
                  onClick={() => setDeleteModalEmotion(l)}
                  className="text-slate-600 hover:text-rose-400 p-1 transition-colors"
                  title="Delete Emotion Log"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Label Strong Emotion">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Select Emotion</label>
            <select value={emotion} onChange={(e) => setEmotion(e.target.value)} className="input mb-2">
              {COMMON_EMOTIONS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
              <option value="Other">Custom...</option>
            </select>
            {emotion === 'Other' && (
              <input
                type="text"
                value={customEmotion}
                onChange={(e) => setCustomEmotion(e.target.value)}
                placeholder="Enter emotion name..."
                className="input"
                required
              />
            )}
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Intensity</span>
              <span className="font-bold text-rose-400">{intensity} / 10</span>
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
            <label className="block text-xs font-medium text-slate-400 mb-1">Context / What triggered it?</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. Work deadline pressure, argument with a peer"
              className="input min-h-[70px]"
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" className="btn-primary flex-1">
              Save & Label (+5 pts)
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Delete Modal */}
      <ConfirmDeleteModal
        open={!!deleteModalEmotion}
        onClose={() => setDeleteModalEmotion(null)}
        onConfirm={() => {
          if (deleteModalEmotion) {
            store.deleteEmotionLog(deleteModalEmotion.id);
            setDeleteModalEmotion(null);
          }
        }}
        title="Delete Emotion Log?"
        itemName={deleteModalEmotion?.emotion}
        description={`Are you sure you want to delete the emotion log for "${deleteModalEmotion?.emotion}"? Any points awarded (+5 pts) will be reversed.`}
      />
    </div>
  );
}