import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppStore } from '@/lib/store';
import type { View } from '@/lib/views';
import { todayKey } from '@/lib/dates';
import { trustedNow } from '@/lib/clock';
import { ensureDefaultActivities, timeStringToMinutes } from '@/lib/timeTracker';
import { currentScheduleBlock } from '../scheduleBlocks';
import { ScheduleStart, ScheduleStopConfirm } from './ScheduleIdle';
import { ScheduleOverdue } from './ScheduleOverdue';
import { ScheduleActiveBlock } from './ScheduleActiveBlock';
import { ScheduleGap } from './ScheduleGap';

const IGNITION_PREFIX = 'ascend_pfc_schedule_ignited_';
const ignitionKey = (day: string) => `${IGNITION_PREFIX}${day}`;

/** Drops the "following schedule" flags of earlier days (one key per day, never needed again). */
function pruneOldIgnitionKeys(today: string): void {
  try {
    localStorage.removeItem('ascend_pfc_ignition_active');
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(IGNITION_PREFIX) && key !== ignitionKey(today)) localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable */
  }
}

const readIgnited = (day: string): boolean => {
  try {
    return localStorage.getItem(ignitionKey(day)) === 'true';
  } catch {
    return false;
  }
};

/**
 * Follow schedule: the timer follows today's Time Tracker blocks. Ticks once a second only while
 * this view is on screen. Following is per device and per day.
 */
export function FollowSchedule({
  store,
  onNavigate,
  onStopped,
}: {
  store: AppStore;
  onNavigate?: (view: View) => void;
  /** Called after "Stop": the card goes back to the plain timer. */
  onStopped: () => void;
}) {
  const [now, setNow] = useState<Date>(() => trustedNow());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(trustedNow()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const day = todayKey(now);
  const [ignited, setIgnited] = useState(() => readIgnited(day));
  const [confirmStop, setConfirmStop] = useState(false);

  // A new day starts unfollowed.
  useEffect(() => {
    setIgnited(readIgnited(day));
    pruneOldIgnitionKeys(day);
  }, [day]);

  const theme = store.state.themePreference || 'dark';
  const timeTracker = store.state.timeTracker;
  const activities = useMemo(() => ensureDefaultActivities(timeTracker?.activities || []), [timeTracker?.activities]);
  const activityMap = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const todayBlocks = useMemo(
    () =>
      [...(timeTracker?.dailyLogs?.[day] || [])].sort(
        (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
      ),
    [timeTracker?.dailyLogs, day]
  );
  const current = useMemo(() => currentScheduleBlock(todayBlocks, activities, now), [todayBlocks, activities, now]);

  // A block break that ran out is closed once (the store records how long it really was).
  const { activeBlock } = current;
  const finalizedBreakRef = useRef<string | null>(null);
  const breakRanOut = Boolean(
    activeBlock?.breakStartedAt &&
      !activeBlock.breakEndedAt &&
      activeBlock.breakDurationMinutes &&
      now.getTime() >= new Date(activeBlock.breakStartedAt).getTime() + activeBlock.breakDurationMinutes * 60_000
  );
  useEffect(() => {
    if (activeBlock && breakRanOut && finalizedBreakRef.current !== activeBlock.id) {
      finalizedBreakRef.current = activeBlock.id;
      store.finalizeDailyBlockBreakNatural(day, activeBlock.id);
    }
  }, [activeBlock, breakRanOut, store, day]);

  const start = () => {
    try {
      store.hydrateTimeTrackerForDate(day);
    } catch {
      /* best effort: the blocks may already be there */
    }
    setIgnited(true);
    try {
      localStorage.setItem(ignitionKey(day), 'true');
    } catch {
      /* following still works for this visit */
    }
  };

  const stop = () => {
    setIgnited(false);
    setConfirmStop(false);
    try {
      localStorage.removeItem(ignitionKey(day));
    } catch {
      /* nothing stored */
    }
    onStopped();
  };

  const askStop = () => setConfirmStop(true);
  const shared = { store, day, now, theme, activityMap, onStop: askStop };

  if (!ignited) {
    return <ScheduleStart blockCount={todayBlocks.length} totalMinutes={current.totalScheduledMinutesToday} onStart={start} />;
  }
  if (confirmStop) return <ScheduleStopConfirm onKeep={() => setConfirmStop(false)} onStop={stop} />;
  if (current.overdueBlock) {
    return <ScheduleOverdue {...shared} block={current.overdueBlock} activity={activityMap.get(current.overdueBlock.activityId)} />;
  }
  if (current.activeBlock) {
    return (
      <ScheduleActiveBlock
        {...shared}
        block={current.activeBlock}
        activity={current.activeBlockActivity}
        onNavigate={onNavigate}
      />
    );
  }
  return <ScheduleGap {...shared} current={current} hasBlocks={todayBlocks.length > 0} />;
}
