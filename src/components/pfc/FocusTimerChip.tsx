import { Coffee, Pause, Timer } from 'lucide-react';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';
import { formatClock } from './focusSession';
import { useFocusCountdown, useFocusSession } from './FocusSessionProvider';

/**
 * Small running-timer chip on every page except PFC (bottom right, above the phone nav bar).
 * Tapping it opens PFC. Shows the finished state until the reflection is seen there.
 */
export function FocusTimerChip({ hidden, onOpen }: { hidden: boolean; onOpen: () => void }) {
  const { session, finished } = useFocusSession();
  const left = useFocusCountdown(hidden ? null : session);
  if (hidden || (!session && !finished)) return null;

  const isBreak = session?.mode === 'break';
  const paused = Boolean(session?.isPaused);
  const Icon = isBreak ? Coffee : paused ? Pause : Timer;
  const label = session ? (isBreak ? 'Break' : paused ? 'Paused' : 'Focus') : 'Focus done';

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={session ? `${label}, ${formatClock(left)} left. Open focus timer` : 'Focus session done. Open focus timer'}
      className={cx(
        'fixed z-30 right-[calc(1rem_+_env(safe-area-inset-right))] bottom-[calc(5.25rem_+_env(safe-area-inset-bottom))] lg:bottom-6 lg:right-6',
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
