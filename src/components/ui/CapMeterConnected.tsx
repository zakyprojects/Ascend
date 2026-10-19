import { AppState } from '@/types';
import { CapId, getCapStatus } from '@/lib/capStatus';
import { capLabels, capNote, capReachedText } from '@/lib/capCopy';
import { CapMeter } from '@/components/ui/CapMeter';
import { getNow } from '@/lib/dates';
import { useLocalDayKey } from '@/lib/useLocalDayKey';
import { pointsResumeText, useTimezoneWait } from '@/lib/useTimezoneWait';

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
  /** Render without its own card, for use inside another surface (PageHero's side slot). */
  bare?: boolean;
}

export function CapMeterConnected({ state, capId, bare = false }: CapMeterConnectedProps) {
  // Re-render when the local day changes, so the cap resets at midnight.
  useLocalDayKey();
  // While a timezone change waits on the server, today's logs earn nothing: say when they will
  // instead of announcing a cap.
  const timezoneWait = useTimezoneWait();

  const status = getCapStatus(state, capId, getNow());
  const variant = capId === 'journal' ? 'slots' : 'bar';

  return (
    <div className={bare ? undefined : 'card p-4'}>
      <CapMeter
        variant={variant}
        label={capLabels[capId]}
        earned={status.earned}
        cap={status.cap}
        slotsUsed={status.slotsUsed}
        slotsTotal={status.slotsTotal}
        note={capNote(capId)}
      />
      {timezoneWait ? (
        <div className="mt-1.5 text-micro text-content-muted">{pointsResumeText(timezoneWait)}</div>
      ) : (
        status.isCapped && (
          <div className="mt-1.5 text-micro text-warning-text">
            {capReachedText(status.earned, status.cap)}
          </div>
        )
      )}
    </div>
  );
}
