import { Check, Play, Plus, SkipForward } from 'lucide-react';
import type { TimeTrackerActivity, TimeTrackerBlock } from '@/types';
import { formatDurationHuman, formatTime12h, getActivityDisplayColor, minutesToTimeString, timeStringToMinutes } from '@/lib/timeTracker';
import { ProgressBar } from '@/components/ui/primitives';
import { ActivityIcon } from './ActivityIcon';
import { LiveCountdown } from './LiveCountdown';
import { blockName, blockRange, launchModules, MODULE_LABELS } from './dayMeta';

interface NowCardProps {
  activeBlock: TimeTrackerBlock | null;
  /** Real end instant of the active block (computeLiveSchedule). */
  activeBlockEndMs: number;
  nextBlock: TimeTrackerBlock | null;
  progressPercent: number;
  currentMinutes: number;
  activityMap: Map<string, TimeTrackerActivity>;
  theme: 'dark' | 'light';
  onDone: (block: TimeTrackerBlock) => void;
  onSkip: (block: TimeTrackerBlock) => void;
  onOpenModule: (block: TimeTrackerBlock, moduleId: string) => void;
  onAddBlock: (start: string, end: string) => void;
}

/** Today only: the block happening now with its time left, or the free time until the next one. */
export function NowCard({
  activeBlock,
  activeBlockEndMs,
  nextBlock,
  progressPercent,
  currentMinutes,
  activityMap,
  theme,
  onDone,
  onSkip,
  onOpenModule,
  onAddBlock,
}: NowCardProps) {
  if (activeBlock) {
    const activity = activityMap.get(activeBlock.activityId);
    const color = getActivityDisplayColor(activity, theme);
    const modules = launchModules(activeBlock, activityMap);
    return (
      <section className="card space-y-4 p-4 sm:p-5" aria-label="Now">
        <div className="flex items-start gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${color}22`, color }}
            aria-hidden="true"
          >
            <ActivityIcon iconName={activity?.icon || 'Clock'} size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="stat-label">Now</div>
            <h2 className="section-title truncate">{blockName(activeBlock, activity)}</h2>
            <p className="text-xs text-content-muted">
              <span className="figure">{blockRange(activeBlock)}</span> ·{' '}
              <LiveCountdown endMs={activeBlockEndMs} className="font-mono text-content-secondary" />
            </p>
          </div>
        </div>
        <ProgressBar value={progressPercent} label="Time gone in this block" size="sm" fillStyle={{ backgroundColor: color }} />
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onDone(activeBlock)} className="btn-primary">
            <Check size={16} /> Done
          </button>
          <button type="button" onClick={() => onSkip(activeBlock)} className="btn-secondary">
            <SkipForward size={16} /> Skip
          </button>
          {modules.map((m) => (
            <button key={m.moduleId} type="button" onClick={() => onOpenModule(activeBlock, m.moduleId)} className="btn-secondary">
              <Play size={14} /> Open {MODULE_LABELS[m.moduleId] || m.moduleId}
            </button>
          ))}
        </div>
      </section>
    );
  }

  const nowString = minutesToTimeString(Math.ceil(currentMinutes));
  const freeUntil = nextBlock ? nextBlock.startTime : '24:00';
  const freeMinutes = Math.max(0, Math.floor(timeStringToMinutes(freeUntil) - currentMinutes));
  return (
    <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5" aria-label="Now">
      <div className="min-w-0">
        <div className="stat-label">Now</div>
        <h2 className="section-title">{nextBlock ? `Free until ${formatTime12h(nextBlock.startTime)}` : 'Nothing else planned today'}</h2>
        {nextBlock && (
          <p className="text-xs text-content-muted">
            Next: {blockName(nextBlock, activityMap.get(nextBlock.activityId))} · {formatDurationHuman(freeMinutes)} from now
          </p>
        )}
      </div>
      {freeMinutes >= 15 && (
        <button type="button" onClick={() => onAddBlock(nowString, freeUntil)} className="btn-secondary self-start sm:self-auto">
          <Plus size={16} /> Plan this time
        </button>
      )}
    </section>
  );
}
