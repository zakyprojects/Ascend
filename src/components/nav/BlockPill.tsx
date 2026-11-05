import { memo, useEffect, useReducer, type ReactNode } from 'react';
import { CalendarClock, Plus, X } from 'lucide-react';
import type { TimeTrackerState } from '@/types';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';
import { useToast } from '@/components/ui/Toast';
import { clockSettled, trustedNowMs } from '@/lib/clock';
import { useLocalDayKey } from '@/lib/useLocalDayKey';
import { blockName, formatTime12h, formatTimeLeft, getActivityDisplayColor } from '@/lib/timeTracker';
import {
  blockPillState,
  hideHint,
  hideState,
  secondsLeft,
  setBlockPillHidden,
  spokenTimeLeft,
  useBlockPillHidden,
  useBlockPillPrefs,
  wakeAfterMs,
} from '@/lib/blockPill';

interface BlockPillProps {
  timeTracker: TimeTrackerState;
  theme: 'dark' | 'light';
  /** Whose hides apply: the signed-in user's id, `local` without one. */
  account: string;
  onTimeTrackerPage: boolean;
  onOpen: () => void;
}

/**
 * The Time Tracker block happening now, at the bottom of every page (inside FloatingDock, below a
 * running focus timer). Tapping it opens Time Tracker; X hides it until the next block. Re-renders
 * only itself: about once a minute, every second in a block's last minute (lib/blockPill nextWakeMs).
 */
export const BlockPill = memo(function BlockPill({ timeTracker, theme, account, onTimeTrackerPage, onOpen }: BlockPillProps) {
  const today = useLocalDayKey();
  const { enabled } = useBlockPillPrefs();
  const hidden = useBlockPillHidden(account);
  const { showToast } = useToast();
  const [, tick] = useReducer((n: number) => n + 1, 0);
  const nowMs = trustedNowMs();
  const input = { timeTracker, today, nowMs, hidden, enabled, onTimeTrackerPage };
  const state = blockPillState(input);
  const asleep = !enabled || onTimeTrackerPage;
  const wake = asleep ? 0 : wakeAfterMs(input);

  useEffect(() => {
    if (asleep) return;
    const timer = window.setTimeout(tick, wake + 20);
    return () => window.clearTimeout(timer);
  });

  useEffect(() => {
    if (asleep) return;
    let active = true;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      tick();
      // After a device sleep the clock re-reads the server time: read again with the corrected time.
      void clockSettled().then(() => active && tick());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [asleep]);

  if (state.kind === 'none') return null;

  const hide = () => {
    setBlockPillHidden(account, hideState(hidden, state, today));
    const hint = hideHint(state, timeTracker.activities);
    if (hint) showToast({ type: 'info', ...hint, duration: 6000, dedupKey: 'block-pill-hide' });
  };

  let content: ReactNode;
  let openLabel: string;
  let hideLabel: string;
  if (state.kind === 'block') {
    const name = blockName(state.block, state.activity);
    const seconds = secondsLeft(state.endMs, nowMs);
    openLabel = `${name}, ${spokenTimeLeft(seconds)}. Open Time Tracker`;
    hideLabel = 'Hide until the next block';
    content = (
      <>
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: getActivityDisplayColor(state.activity, theme) }} />
        <span className="max-w-[11rem] truncate text-content-secondary">{name}</span>
        <span className="font-mono tabular-nums text-content-primary">{formatTimeLeft(seconds)}</span>
      </>
    );
  } else if (state.kind === 'free') {
    const until = state.next ? formatTime12h(state.next.startTime) : null;
    const nextName = state.next ? blockName(state.next, timeTracker.activities?.find((a) => a.id === state.next?.activityId)) : '';
    openLabel = until ? `Free until ${until}, next ${nextName}. Open Time Tracker` : 'Free time, nothing else planned today. Open Time Tracker';
    hideLabel = until ? `Hide until ${until}` : 'Hide for today';
    content = (
      <>
        <CalendarClock size={14} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{until ? `Free until ${until}` : 'Free time'}</span>
      </>
    );
  } else {
    openLabel = 'No blocks planned. Open Time Tracker to plan your day';
    hideLabel = 'Hide for today';
    content = (
      <>
        <Plus size={14} aria-hidden="true" className="shrink-0" />
        <span className="truncate">Plan your day</span>
      </>
    );
  }

  return (
    <div
      role="group"
      aria-label="Current block"
      className={cx(
        'inline-flex min-h-10 max-w-[calc(100vw_-_2rem)] items-center rounded-full border border-overlay-default bg-bg-800 text-xs font-medium shadow-sm motion-safe:animate-enter-up',
        state.kind === 'block' ? 'text-content-secondary' : 'text-content-muted'
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={openLabel}
        className={cx('inline-flex min-h-10 min-w-0 items-center gap-2 rounded-full py-2 pl-3.5 pr-1 transition-colors hover:text-content-primary', FOCUS_RING)}
      >
        {content}
      </button>
      <button
        type="button"
        data-dock-nodrag=""
        onClick={hide}
        aria-label={hideLabel}
        className={cx('group grid size-10 shrink-0 place-items-center rounded-full', FOCUS_RING)}
      >
        <span className="grid size-7 place-items-center rounded-full text-content-muted transition-colors group-hover:bg-bg-700 group-hover:text-content-primary">
          <X size={14} aria-hidden="true" />
        </span>
      </button>
    </div>
  );
});
