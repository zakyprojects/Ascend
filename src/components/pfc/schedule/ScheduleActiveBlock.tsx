import { useState } from 'react';
import { CheckCircle2, ChevronRight, Coffee, RotateCcw, SkipForward } from 'lucide-react';
import type { AppStore } from '@/lib/store';
import type { View } from '@/lib/views';
import type { TimeTrackerActivity, TimeTrackerBlock } from '@/types';
import { formatTime12h, getAscendViewForModule, timeStringToMinutes } from '@/lib/timeTracker';
import { ProgressBar } from '@/components/ui/primitives';
import { cx } from '@/components/ui/primitives/shared';
import { useToast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/userMessage';
import { formatClock } from '../focusSession';
import { getBlockContextualMessage, getSkipToastMessage } from '../scheduleMessages';
import { ActivityTile, StopScheduleButton, blockRange, blockTitle, hhmm, type Theme } from './shared';
import { TakeBreakDialog } from './TakeBreakDialog';

const ACTION =
  'flex-1 min-w-[7rem] sm:flex-none justify-center min-h-10 px-3 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap';

/** The block happening now: countdown to its end, break, skip, complete. */
export function ScheduleActiveBlock({
  store,
  day,
  now,
  theme,
  activityMap,
  block,
  activity,
  onStop,
  onNavigate,
}: {
  store: AppStore;
  day: string;
  now: Date;
  theme: Theme;
  activityMap: Map<string, TimeTrackerActivity>;
  block: TimeTrackerBlock;
  activity: TimeTrackerActivity | null;
  onStop: () => void;
  onNavigate?: (view: View) => void;
}) {
  const { showSuccessToast, showErrorToast } = useToast();
  const [breakOpen, setBreakOpen] = useState(false);

  const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const startSecs = timeStringToMinutes(block.startTime) * 60;
  const endSecs = timeStringToMinutes(block.endTime) * 60;
  const remaining = Math.max(0, endSecs - nowSecs);
  const total = Math.max(1, endSecs - startSecs);
  const progress = Math.min(100, Math.max(0, ((nowSecs - startSecs) / total) * 100));

  // Break state, from the block's own timestamps.
  let onBreak = false;
  let breakLeft = 0;
  if (block.breakStartedAt && block.breakDurationMinutes && !block.breakEndedAt) {
    const elapsed = Math.max(0, Math.floor((now.getTime() - new Date(block.breakStartedAt).getTime()) / 1000));
    breakLeft = Math.min(Math.max(0, block.breakDurationMinutes * 60 - elapsed), remaining);
    onBreak = breakLeft > 0;
  }
  // Up to 15 min, keeping a 10 s margin before the block ends.
  const maxBreakMinutes = Math.min(15, Math.floor(Math.max(0, remaining - 10) / 60));
  const canOfferBreak = !onBreak && !block.breakDurationMinutes && Boolean(activity?.ascendModule);
  const breakBlockedReason = progress < 50 ? 'Finish at least half of this block first.' : maxBreakMinutes < 5 ? 'Not enough time left in this block.' : null;

  const title = blockTitle(block, activity, 'Scheduled block');
  const openModule = (module?: string, name?: string) => {
    if (!onNavigate || !module) return;
    const view = getAscendViewForModule(module, name);
    if (view) onNavigate(view as View);
  };

  const act = (fn: () => void, failTitle: string) => {
    try {
      fn();
    } catch (err) {
      showErrorToast(failTitle, toUserMessage(err, 'Try again.'));
    }
  };

  return (
    <div className="space-y-5 text-center">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs border-b border-overlay-subtle pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="badge badge-emerald text-2xs font-medium flex items-center gap-1.5 px-2.5 py-1">
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            Live block
          </span>
          <span className="text-micro text-content-muted tabular-nums">{blockRange(block)}</span>
        </div>
        <StopScheduleButton onClick={onStop} />
      </div>

      {onBreak ? (
        <div className="space-y-5 py-1">
          <div>
            <h3 className="text-xl sm:text-2xl font-semibold leading-tight text-content-primary">On a break</h3>
            <p className="text-xs sm:text-sm text-content-muted mt-1 break-words [overflow-wrap:anywhere]">
              Back to <span className="text-content-primary font-medium">{title}</span> after it.
            </p>
          </div>
          <div className="space-y-1">
            <div className="figure text-6xl sm:text-7xl text-success-text">{formatClock(breakLeft)}</div>
            <p className="text-xs text-content-muted tabular-nums">Block ends at {formatTime12h(block.endTime)}</p>
          </div>
          <button
            type="button"
            onClick={() =>
              act(() => {
                store.endDailyBlockBreakEarly(day, block.id);
                showSuccessToast('Break ended', 'Back to focus.');
              }, "Couldn't end break")
            }
            className="btn-secondary min-h-11 mx-auto"
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>End break</span>
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="inline-flex flex-wrap items-center justify-center gap-2 text-xs">
              <ActivityTile activity={activity} theme={theme} />
              <span className="item-name !text-content-secondary">{activity?.name || 'Active task'}</span>
              {activity?.ascendModule && onNavigate && (
                <button
                  type="button"
                  onClick={() => openModule(activity.ascendModule, activity.name)}
                  className="min-h-8 text-2xs text-success-text inline-flex items-center hover:underline"
                >
                  {activity.ascendModule}
                  <ChevronRight size={12} aria-hidden="true" />
                </button>
              )}
            </div>
            <h3 className="text-2xl sm:text-4xl font-semibold leading-tight text-content-primary max-w-2xl mx-auto break-words [overflow-wrap:anywhere]">
              {title}
            </h3>
            <p className="text-xs sm:text-sm text-content-muted max-w-lg mx-auto">{getBlockContextualMessage(activity)}</p>

            {(block.originalStartTime || block.breakDurationMinutes) && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
                {block.originalStartTime && (
                  <span className="badge badge-cyan text-2xs px-2.5 py-1">
                    Started early (planned {formatTime12h(block.originalStartTime)})
                  </span>
                )}
                {block.breakDurationMinutes && (
                  <span className="badge badge-emerald text-2xs px-2.5 py-1">{block.breakDurationMinutes} min break taken</span>
                )}
              </div>
            )}

            {block.secondaryActivityIds && block.secondaryActivityIds.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1 max-w-full">
                {block.secondaryActivityIds.map((id) => {
                  const sec = activityMap.get(id);
                  if (!sec) return null;
                  const linked = Boolean(sec.ascendModule && onNavigate);
                  return linked ? (
                    <button
                      type="button"
                      key={id}
                      onClick={() => openModule(sec.ascendModule, sec.name)}
                      className="min-h-8 text-xs font-medium text-success-text bg-emerald-500/15 hover:bg-emerald-500/25 px-2.5 rounded-lg inline-flex items-center gap-1 max-w-full"
                    >
                      <span className="truncate">+ {sec.name}</span>
                      <ChevronRight size={12} aria-hidden="true" className="shrink-0" />
                    </button>
                  ) : (
                    <span key={id} className="text-xs font-medium text-success-text bg-emerald-500/15 px-2.5 py-1 rounded-lg truncate max-w-full">
                      + {sec.name}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="figure text-6xl sm:text-7xl text-success-text">{formatClock(remaining)}</div>
            <p className="text-xs text-content-muted tabular-nums">
              Until {formatTime12h(block.endTime)} ({Math.ceil(remaining / 60)} min left)
            </p>
          </div>

          <div className="max-w-md mx-auto space-y-1.5">
            <div className="flex justify-between text-micro text-content-muted tabular-nums">
              <span>{formatTime12h(block.startTime)}</span>
              <span>{Math.round(progress)}% done</span>
              <span>{formatTime12h(block.endTime)}</span>
            </div>
            <ProgressBar value={progress} label="Block time passed" live />
          </div>
        </>
      )}

      {!onBreak && (
        <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
          {block.originalStartTime && (
            <button
              type="button"
              onClick={() =>
                act(() => {
                  store.undoEarlyStartTimeBlock(day, block.id);
                  showSuccessToast('Start time restored', `Back to ${formatTime12h(block.originalStartTime!)}.`);
                }, "Couldn't restore the start time")
              }
              className={cx(ACTION, 'bg-overlay-subtle text-content-tertiary hover:bg-overlay-default')}
            >
              <RotateCcw size={13} aria-hidden="true" />
              <span>Undo early start</span>
            </button>
          )}
          {canOfferBreak && (
            <button
              type="button"
              aria-disabled={Boolean(breakBlockedReason)}
              title={breakBlockedReason || undefined}
              onClick={() => {
                if (breakBlockedReason) {
                  showErrorToast('Break not available', breakBlockedReason);
                  return;
                }
                setBreakOpen(true);
              }}
              className={cx(
                ACTION,
                breakBlockedReason
                  ? 'bg-overlay-subtle text-content-disabled cursor-not-allowed'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-success-text'
              )}
            >
              <Coffee size={13} aria-hidden="true" />
              <span>Take a break</span>
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              act(() => {
                store.markDailyTimeBlockSkipped(day, block.id, hhmm(now));
                const toast = getSkipToastMessage(activity);
                showSuccessToast(toast.title, toast.subtitle);
              }, "Couldn't skip block")
            }
            className={cx(ACTION, 'bg-overlay-subtle text-content-muted hover:text-content-secondary hover:bg-overlay-default')}
          >
            <SkipForward size={13} aria-hidden="true" />
            <span>Skip block</span>
          </button>
          <button
            type="button"
            onClick={() =>
              act(() => {
                const at = hhmm(now);
                store.toggleDailyTimeBlockCompleted(day, block.id, at);
                if (!block.completed) showSuccessToast('Block completed', `Ended at ${formatTime12h(at)}.`);
              }, "Couldn't complete block")
            }
            className={cx(ACTION, 'bg-primary-600 hover:bg-primary-700 text-on-brand')}
          >
            <CheckCircle2 size={13} aria-hidden="true" />
            <span>Mark completed</span>
          </button>
        </div>
      )}

      <TakeBreakDialog
        open={breakOpen}
        onClose={() => setBreakOpen(false)}
        blockTitle={title}
        blockEnd={formatTime12h(block.endTime)}
        maxMinutes={maxBreakMinutes}
        onStart={(minutes) => {
          store.startDailyBlockBreak(day, block.id, minutes);
          showSuccessToast('Break started', `${minutes} min break.`);
        }}
      />
    </div>
  );
}
