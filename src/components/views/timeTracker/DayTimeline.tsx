import { Fragment, useState } from 'react';
import { Check, Pencil, Play, Plus, RotateCcw, SkipForward, Trash2 } from 'lucide-react';
import type { TimeTrackerActivity, TimeTrackerBlock } from '@/types';
import {
  calculateBlockDurationMinutes,
  formatDurationHuman,
  formatTime12h,
  getActivityDisplayColor,
  timeStringToMinutes,
} from '@/lib/timeTracker';
import { cx, TAP_TARGET } from '@/components/ui/primitives/shared';
import { blockName, launchModules, MODULE_LABELS } from './dayMeta';

/** Free time this long or longer shows as a row you can tap to plan it. */
const MIN_GAP_MINUTES = 15;

export interface TimelineBlock {
  block: TimeTrackerBlock;
  /** 'before' = continues from the day before, 'after' = continues the next day. */
  continues?: 'before' | 'after';
}

interface DayTimelineProps {
  items: TimelineBlock[];
  activityMap: Map<string, TimeTrackerActivity>;
  theme: 'dark' | 'light';
  /** 'today' can tick blocks; 'future' can edit; 'past' is read-only. */
  mode: 'today' | 'future' | 'past';
  /** Yesterday's last block until 02:00: it can still be ticked although the day is past. */
  graceBlockId?: string;
  /** Minutes since midnight now (today only), for the now line and passed blocks. */
  nowMinutes?: number;
  onToggleDone: (block: TimeTrackerBlock) => void;
  onSkip: (block: TimeTrackerBlock) => void;
  onUndoSkip: (block: TimeTrackerBlock) => void;
  onEdit: (block: TimeTrackerBlock) => void;
  onDelete: (block: TimeTrackerBlock) => void;
  onOpenModule: (block: TimeTrackerBlock, moduleId: string) => void;
  onAddInGap: (start: string, end: string) => void;
}

type Row =
  | { kind: 'block'; item: TimelineBlock; start: number; end: number }
  | { kind: 'gap'; start: number; end: number };

const endOf = (b: TimeTrackerBlock) => {
  const start = timeStringToMinutes(b.startTime);
  const end = timeStringToMinutes(b.endTime);
  return end === 0 && start > 0 ? 1440 : end;
};

const asTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * The day as one vertical timeline: blocks in order with free gaps between them (tap a gap to
 * plan it), a "now" line on today. Tap a block to see what you can do with it.
 */
export function DayTimeline({
  items,
  activityMap,
  theme,
  mode,
  graceBlockId,
  nowMinutes,
  onToggleDone,
  onSkip,
  onUndoSkip,
  onEdit,
  onDelete,
  onOpenModule,
  onAddInGap,
}: DayTimelineProps) {
  const [openId, setOpenId] = useState<string | null>(null);

  const rows: Row[] = [];
  let cursor = 0;
  const sorted = [...items].sort((a, b) => timeStringToMinutes(a.block.startTime) - timeStringToMinutes(b.block.startTime));
  for (const item of sorted) {
    const start = timeStringToMinutes(item.block.startTime);
    const end = endOf(item.block);
    if (mode !== 'past' && start - cursor >= MIN_GAP_MINUTES) rows.push({ kind: 'gap', start: cursor, end: start });
    rows.push({ kind: 'block', item, start, end });
    cursor = Math.max(cursor, end);
  }
  if (mode !== 'past' && sorted.length > 0 && 1440 - cursor >= MIN_GAP_MINUTES) rows.push({ kind: 'gap', start: cursor, end: 1440 });

  // A gap that is already over today can't be planned any more.
  const visible = rows.filter((r) => !(r.kind === 'gap' && mode === 'today' && nowMinutes !== undefined && r.end <= nowMinutes));
  const inBlockNow = mode === 'today' && nowMinutes !== undefined && visible.some((r) => r.kind === 'block' && r.start <= nowMinutes && nowMinutes < r.end);
  const nowLineBefore =
    mode === 'today' && nowMinutes !== undefined && !inBlockNow
      ? visible.findIndex((r) => r.start > nowMinutes || (r.kind === 'gap' && r.start <= nowMinutes && nowMinutes < r.end))
      : -2;

  return (
    <ol className="relative">
      {visible.map((row, index) => (
        <Fragment key={row.kind === 'block' ? row.item.block.id : `gap-${row.start}`}>
          {index === nowLineBefore && <NowLine minutes={nowMinutes!} />}
          {row.kind === 'gap' ? (
            <li>
              <button
                type="button"
                onClick={() => onAddInGap(asTime(Math.max(row.start, mode === 'today' && nowMinutes !== undefined ? Math.ceil(nowMinutes / 5) * 5 : row.start)), asTime(row.end))}
                className="group flex min-h-11 w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-xs text-content-muted transition-colors hover:bg-overlay-subtle hover:text-content-secondary"
              >
                <span className="figure w-14 shrink-0 text-right text-2xs">{formatTime12h(asTime(row.start))}</span>
                <span className="flex flex-1 items-center gap-2 border-l border-dashed border-overlay-default pl-3">
                  Free · {formatDurationHuman(row.end - row.start)}
                  <span className="ml-auto flex items-center gap-1 text-brand-text opacity-80 group-hover:opacity-100">
                    <Plus size={14} aria-hidden="true" /> Add block
                  </span>
                </span>
              </button>
            </li>
          ) : (
            <BlockRow
              item={row.item}
              activity={activityMap.get(row.item.block.activityId)}
              activityMap={activityMap}
              theme={theme}
              mode={mode}
              canTick={mode === 'today' || row.item.block.id === graceBlockId}
              isNow={mode === 'today' && nowMinutes !== undefined && row.start <= nowMinutes && nowMinutes < row.end}
              isPassed={mode === 'past' || (mode === 'today' && nowMinutes !== undefined && nowMinutes >= row.end)}
              open={openId === row.item.block.id}
              onToggleOpen={() => setOpenId((cur) => (cur === row.item.block.id ? null : row.item.block.id))}
              onToggleDone={onToggleDone}
              onSkip={onSkip}
              onUndoSkip={onUndoSkip}
              onEdit={onEdit}
              onDelete={onDelete}
              onOpenModule={onOpenModule}
            />
          )}
        </Fragment>
      ))}
      {nowLineBefore === -1 && <NowLine minutes={nowMinutes!} />}
    </ol>
  );
}

function NowLine({ minutes }: { minutes: number }) {
  return (
    <li className="flex items-center gap-3 px-2 py-1" aria-label={`Now, ${formatTime12h(asTime(Math.floor(minutes)))}`}>
      <span className="figure w-14 shrink-0 text-right text-2xs font-medium text-brand-text">{formatTime12h(asTime(Math.floor(minutes)))}</span>
      <span className="h-px flex-1 bg-primary-500/60" aria-hidden="true" />
    </li>
  );
}

interface BlockRowProps {
  item: TimelineBlock;
  activity: TimeTrackerActivity | undefined;
  activityMap: Map<string, TimeTrackerActivity>;
  theme: 'dark' | 'light';
  mode: 'today' | 'future' | 'past';
  /** The done box is a button (today's blocks, and the grace block). */
  canTick: boolean;
  isNow: boolean;
  isPassed: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onToggleDone: (block: TimeTrackerBlock) => void;
  onSkip: (block: TimeTrackerBlock) => void;
  onUndoSkip: (block: TimeTrackerBlock) => void;
  onEdit: (block: TimeTrackerBlock) => void;
  onDelete: (block: TimeTrackerBlock) => void;
  onOpenModule: (block: TimeTrackerBlock, moduleId: string) => void;
}

function BlockRow({
  item,
  activity,
  activityMap,
  theme,
  mode,
  canTick,
  isNow,
  isPassed,
  open,
  onToggleOpen,
  onToggleDone,
  onSkip,
  onUndoSkip,
  onEdit,
  onDelete,
  onOpenModule,
}: BlockRowProps) {
  const { block, continues } = item;
  const color = getActivityDisplayColor(activity, theme);
  const name = blockName(block, activity);
  const duration = calculateBlockDurationMinutes(block.startTime, block.endTime);
  const status = block.completed ? 'Done' : block.skipped ? 'Skipped' : isPassed ? 'Not done' : isNow ? 'Now' : null;
  const canSkip = mode === 'today';
  const canEdit = mode !== 'past';
  const modules = launchModules(block, activityMap);
  const extra = (block.secondaryActivityIds || []).map((id) => activityMap.get(id)?.name).filter(Boolean);

  const checkLabel = block.completed ? `Mark ${name} not done` : block.skipped ? `Undo skip for ${name}` : `Mark ${name} done`;

  return (
    <li className={cx('rounded-xl', isNow && 'bg-overlay-subtle')}>
      <div className="flex items-stretch gap-3 px-2 py-1.5">
        <span className="figure w-14 shrink-0 pt-2.5 text-right text-2xs text-content-muted">{formatTime12h(block.startTime)}</span>
        <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: color, opacity: block.completed || block.skipped ? 0.45 : 1 }} aria-hidden="true" />
        {canTick ? (
          <button
            type="button"
            onClick={() => (block.skipped ? onUndoSkip(block) : onToggleDone(block))}
            aria-label={checkLabel}
            aria-pressed={Boolean(block.completed)}
            className={cx(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors',
              block.completed
                ? 'border-primary-500/50 bg-primary-500/15 text-brand-text'
                : block.skipped
                  ? 'border-overlay-default text-content-muted hover:bg-overlay-subtle'
                  : 'border-overlay-default text-transparent hover:border-primary-500/50 hover:text-content-muted'
            )}
          >
            {block.skipped ? <RotateCcw size={16} /> : <Check size={18} />}
          </button>
        ) : (
          <span
            className={cx(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border',
              block.completed ? 'border-primary-500/40 text-brand-text' : 'border-overlay-subtle text-content-subtle'
            )}
            aria-hidden="true"
          >
            {block.completed ? <Check size={18} /> : block.skipped ? <SkipForward size={14} /> : null}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleOpen}
          aria-expanded={open}
          className="min-w-0 flex-1 rounded-lg py-1 text-left"
        >
          <span className={cx('item-name block truncate text-sm', (block.completed || block.skipped) && '!text-content-muted')}>{name}</span>
          <span className="block text-xs text-content-muted">
            <span className="figure">
              {formatTime12h(block.startTime)}–{formatTime12h(block.endTime)}
            </span>{' '}
            · {formatDurationHuman(duration)}
            {block.customTitle && activity ? ` · ${activity.name}` : ''}
            {extra.length > 0 ? ` + ${extra.join(', ')}` : ''}
          </span>
          {(status || continues) && (
            <span className="mt-0.5 block text-2xs text-content-muted">
              {status && <span className={status === 'Now' || status === 'Done' ? 'font-medium text-brand-text' : undefined}>{status}</span>}
              {status && continues ? ' · ' : ''}
              {continues === 'after' ? 'continues the next day' : continues === 'before' ? 'continues from the day before' : ''}
            </span>
          )}
        </button>
      </div>

      {open && (
        <div className="flex flex-wrap gap-2 pb-2.5 pl-[5.25rem] pr-2 sm:pl-[8.25rem]">
          {canSkip && !block.completed && !block.skipped && (
            <button type="button" onClick={() => onSkip(block)} className="btn-secondary text-xs">
              <SkipForward size={14} /> Skip
            </button>
          )}
          {canEdit && (
            <button type="button" onClick={() => onEdit(block)} className="btn-secondary text-xs">
              <Pencil size={14} /> Edit
            </button>
          )}
          {modules.map((m) => (
            <button key={m.moduleId} type="button" onClick={() => onOpenModule(block, m.moduleId)} className="btn-secondary text-xs">
              <Play size={13} /> Open {MODULE_LABELS[m.moduleId] || m.moduleId}
            </button>
          ))}
          {canEdit && (
            <button type="button" onClick={() => onDelete(block)} className={cx('btn-danger text-xs', TAP_TARGET)}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          {block.notes && <p className="w-full text-xs text-content-tertiary">{block.notes}</p>}
          {!canEdit && !block.notes && modules.length === 0 && <p className="text-xs text-content-muted">Past days can’t change.</p>}
        </div>
      )}
    </li>
  );
}
