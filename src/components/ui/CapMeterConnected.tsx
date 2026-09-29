import { useState, useEffect, useRef } from 'react';
import { AppState } from '@/types';
import { CapId, getCapStatus } from '@/lib/capStatus';
import { capLabels, capNote, capReachedText } from '@/lib/capCopy';
import { CapMeter } from '@/components/ui/CapMeter';
import { getNow, todayKey } from '@/lib/dates';

export interface CapMeterConnectedProps {
  state: Pick<
    AppState,
    | 'workouts'
    | 'readingLogs'
    | 'skillLogs'
    | 'focusLogs'
    | 'badHabitLogs'
    | 'habits'
    | 'journalEntries'
  >;
  capId: CapId;
}

export function CapMeterConnected({ state, capId }: CapMeterConnectedProps) {
  const [, setTick] = useState(0);
  const lastTodayKeyRef = useRef(todayKey(getNow()));

  useEffect(() => {
    const checkDateRollover = () => {
      const currentTodayKey = todayKey(getNow());
      if (currentTodayKey !== lastTodayKeyRef.current) {
        lastTodayKeyRef.current = currentTodayKey;
        setTick((t) => t + 1);
      }
    };

    const intervalId = setInterval(checkDateRollover, 30000);
    document.addEventListener('visibilitychange', checkDateRollover);

    return () => {
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', checkDateRollover);
    };
  }, []);

  const status = getCapStatus(state, capId, getNow());
  const variant = capId === 'badHabitsResisted' || capId === 'journal' ? 'slots' : 'bar';

  return (
    <div className="card p-4">
      <CapMeter
        variant={variant}
        label={capLabels[capId]}
        earned={status.earned}
        cap={status.cap}
        slotsUsed={status.slotsUsed}
        slotsTotal={status.slotsTotal}
        note={capNote(capId)}
      />
      {status.isCapped && (
        <div className="mt-1.5 text-[11px] text-warning-text">
          {capReachedText(status.earned, status.cap)}
        </div>
      )}
    </div>
  );
}
