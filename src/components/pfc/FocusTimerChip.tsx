import { Coffee, Hourglass, Pause, Timer } from 'lucide-react';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';
import { formatClock, onBreak } from './focusSession';
import { useFocusCountdown, useFocusSession } from './FocusSessionProvider';

/**
 * Small running-timer chip on every page except PFC, in the floating dock (nav/FloatingDock) above
 * the current block pill. Tapping it opens PFC. Shows the finished state until the reflection is seen there.
 */
export function FocusTimerChip({ hidden, onOpen }: { hidden: boolean; onOpen: () => void }) {
  const { session, finished } = useFocusSession();
  const left = useFocusCountdown(hidden ? null : session);
  if (hidden || (!session && !finished)) return null;

  const isBreak = session?.mode === 'break';
  const resting = onBreak(session);
  const paused = Boolean(session?.isPaused);
  const Icon = isBreak ? Coffee : resting ? Hourglass : paused ? Pause : Timer;
  const label = session ? (isBreak ? 'Break' : resting ? 'On break' : paused ? 'Paused' : 'Focus') : 'Focus done';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={session ? `${label}, ${formatClock(left)} left. Open focus timer` : 'Focus session done. Open focus timer'}
      className={cx(
        'inline-flex min-h-10 items-center gap-2 rounded-full border border-cyan-500/30 bg-bg-800 px-3.5 py-2 text-xs font-medium text-content-secondary shadow-sm',
        'hover:bg-bg-700 transition-colors',
        FOCUS_RING
      )}
    >
      <Icon size={14} aria-hidden="true" className="text-cyan-hierarchy" />
      <span>{label}</span>
      {session && <span className="font-mono tabular-nums text-content-primary">{formatClock(left)}</span>}
    </button>
  );
}
