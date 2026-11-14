import { AppState } from '@/types';
import { CapId, getCapStatus } from '@/lib/points/capStatus';
import { capLabels, capReachedText } from '@/lib/points/capCopy';
import { CapMeter } from '@/components/ui/CapMeter';
import { trustedNow } from '@/lib/time/clock';
import { useLocalDayKey } from '@/lib/time/useLocalDayKey';
import { LATE_POINTS_TEXT, pointsResumeText, useTimezoneWait } from '@/lib/time/useTimezoneWait';

/** Caps whose logs the server still credits during a timezone wait (see LATE_POINTS_TEXT). */
const LATE_POINTS_CAPS: ReadonlySet<CapId> = new Set<CapId>(['reading', 'skills', 'pfc']);

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
  /** Opens the page's How it works dialog at Points. */
  onExplain?: () => void;
}

export function CapMeterConnected({ state, capId, bare = false, onExplain }: CapMeterConnectedProps) {
  // Re-render when the local day changes, so the cap resets at midnight.
  useLocalDayKey();
  // While a timezone change waits on the server, say when today's logs earn instead of announcing
  // a cap. Reading, skills and focus still earn on that day, the points just show up later.
  const timezoneWait = useTimezoneWait();
  const waitText = timezoneWait && (LATE_POINTS_CAPS.has(capId) ? LATE_POINTS_TEXT : pointsResumeText(timezoneWait));

  const status = getCapStatus(state, capId, trustedNow());
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
        onExplain={onExplain}
      />
      {timezoneWait ? (
        <div className="mt-1.5 text-micro text-content-muted">{waitText}</div>
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
