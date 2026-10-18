import { useMemo, useState } from 'react';
import { CalendarClock, Layers, Plus } from 'lucide-react';
import type { TimeTrackerActivity, TimeTrackerBlock, TimeTrackerTemplate } from '@/types';
import { AppStore } from '@/lib/store';
import {
  calculateBlockDurationMinutes,
  computeLiveSchedule,
  findSplitPartner,
  formatDurationHuman,
  formatTime12h,
  getAscendViewForModule,
  minutesToTimeString,
  timeStringToMinutes,
} from '@/lib/timeTracker';
import { calculateTimeTrackerDailyPoints, TIME_TRACKER_POINTS } from '@/lib/pointsConfig';
import { timeTrackerCapNote } from '@/lib/capCopy';
import { formatDateKeyHuman, formatWeekdayDate } from '@/lib/dates';
import { PageHero } from '@/components/ui/PageHero';
import { CapMeter } from '@/components/ui/CapMeter';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { Dialog, EmptyState } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { toUserMessage } from '@/lib/userMessage';
import { View } from '@/components/AppShell';
import { WeekStrip } from './WeekStrip';
import { NowCard } from './NowCard';
import { DayTimeline, type TimelineBlock } from './DayTimeline';
import { blockName, blockRange, ledgerDayPoints, nextTierHint, useNowTick } from './dayMeta';

interface DayTabProps {
  store: AppStore;
  activities: TimeTrackerActivity[];
  templates: TimeTrackerTemplate[];
  today: string;
  selectedDateKey: string;
  planned: { blocks: TimeTrackerBlock[]; source: 'saved' | 'template' | 'none'; template?: TimeTrackerTemplate };
  onSelectDateKey: (dateKey: string) => void;
  onAddBlock: (start: string, end: string) => void;
  onEditBlock: (block: TimeTrackerBlock) => void;
  onApplyTemplate: () => void;
  onNavigate?: (view: View) => void;
}

/** Default times for a new block: the first free hour at or after `fromMinutes`, else 9:00. */
function firstFreeSlot(blocks: TimeTrackerBlock[], fromMinutes: number): { start: string; end: string } {
  const sorted = [...blocks].sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));
  let cursor = Math.min(1425, Math.ceil(fromMinutes / 15) * 15);
  for (const b of sorted) {
    const start = timeStringToMinutes(b.startTime);
    const rawEnd = timeStringToMinutes(b.endTime);
    const end = rawEnd === 0 && start > 0 ? 1440 : rawEnd;
    if (end <= cursor) continue;
    if (start - cursor >= 15) break;
    cursor = Math.max(cursor, end);
  }
  if (cursor >= 1440) return { start: '09:00', end: '10:00' };
  const next = sorted.find((b) => timeStringToMinutes(b.startTime) > cursor);
  const end = Math.min(cursor + 60, next ? timeStringToMinutes(next.startTime) : 1440);
  return { start: minutesToTimeString(cursor), end: minutesToTimeString(end) };
}

export function DayTab({
  store,
  activities,
  templates,
  today,
  selectedDateKey,
  planned,
  onSelectDateKey,
  onAddBlock,
  onEditBlock,
  onApplyTemplate,
  onNavigate,
}: DayTabProps) {
  const { showSuccessToast, showErrorToast } = useToast();
  const now = useNowTick();
  const theme = store.state.themePreference || 'dark';
  const timeTracker = store.state.timeTracker;
  const mode: 'today' | 'future' | 'past' = selectedDateKey === today ? 'today' : selectedDateKey > today ? 'future' : 'past';
  const blocks = planned.blocks;
  // Today is filled from its template as soon as the page opens; only later days show a preview.
  const isPreview = planned.source === 'template' && mode === 'future';

  const activityMap = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  // Same now/next rule as PFC Follow schedule (liveBlocksAt), judged on the shown day.
  const live = useMemo(
    () => computeLiveSchedule(blocks, activities, now, selectedDateKey),
    [blocks, activities, now, selectedDateKey]
  );
  const score = calculateTimeTrackerDailyPoints(blocks);
  const points = ledgerDayPoints(store.state, selectedDateKey);
  const doneCount = blocks.filter((b) => b.completed).length;
  const skippedCount = blocks.filter((b) => !b.completed && b.skipped).length;

  const items: TimelineBlock[] = useMemo(
    () =>
      blocks.map((block) => {
        if (!block.splitPairId || !timeTracker) return { block };
        const partner = findSplitPartner(timeTracker, selectedDateKey, block);
        if (!partner) return { block };
        return { block, continues: partner.dateKey > selectedDateKey ? 'after' : 'before' };
      }),
    [blocks, timeTracker, selectedDateKey]
  );

  const [deleting, setDeleting] = useState<TimeTrackerBlock | null>(null);
  const [clearing, setClearing] = useState(false);
  const deletingPartner = deleting && timeTracker ? findSplitPartner(timeTracker, selectedDateKey, deleting) : null;
  const partnerCanChange = Boolean(deletingPartner && deletingPartner.dateKey >= today);

  const run = (action: () => void, failTitle: string) => {
    try {
      action();
    } catch (err) {
      showErrorToast(failTitle, toUserMessage(err, 'Try again.'));
    }
  };

  const toggleDone = (block: TimeTrackerBlock) =>
    run(() => {
      store.toggleDailyTimeBlockCompleted(selectedDateKey, block.id);
      if (!block.completed) showSuccessToast('Done', blockName(block, activityMap.get(block.activityId)));
    }, "Couldn't update block");

  const skip = (block: TimeTrackerBlock) =>
    run(() => {
      store.markDailyTimeBlockSkipped(selectedDateKey, block.id);
      showSuccessToast('Skipped', blockName(block, activityMap.get(block.activityId)));
    }, "Couldn't skip block");

  // Undo skip puts the block back to not done (never marks it done).
  const undoSkip = (block: TimeTrackerBlock) =>
    run(() => {
      store.undoDailyTimeBlockResolution(selectedDateKey, block.id);
      showSuccessToast('Skip undone');
    }, "Couldn't undo skip");

  const openModule = (block: TimeTrackerBlock, moduleId: string) => {
    const target = getAscendViewForModule(moduleId, activityMap.get(block.activityId)?.name);
    if (!target || !onNavigate) return;
    if (target === 'prefrontal') {
      try {
        sessionStorage.removeItem('ascend_pending_focus_task');
        sessionStorage.removeItem('ascend_pending_focus_duration');
        sessionStorage.removeItem('ascend_pending_focus_timestamp');
        sessionStorage.setItem('ascend_pending_pfc_timer_mode', 'sync');
      } catch {
        /* Deep Focus still opens, in its own default mode */
      }
    }
    onNavigate(target);
  };

  const addBlock = (start?: string, end?: string) => {
    if (start && end) return onAddBlock(start, end);
    const from = mode === 'today' ? now.getHours() * 60 + now.getMinutes() : 0;
    const slot = blocks.length === 0 && mode !== 'today' ? { start: '09:00', end: '10:00' } : firstFreeSlot(blocks, from);
    onAddBlock(slot.start, slot.end);
  };

  const confirmDelete = (withPartner: boolean) => {
    if (!deleting) return;
    store.deleteDailyTimeBlock(selectedDateKey, deleting.id, { withPartner });
    showSuccessToast(withPartner ? 'Both parts deleted' : 'Block deleted', undefined, `time_block_${deleting.id}`);
    setDeleting(null);
  };

  const confirmClear = () => {
    store.clearDailyTimeBlocks(selectedDateKey);
    showSuccessToast('Day cleared', undefined, `clear_day_${selectedDateKey}`);
    setClearing(false);
  };

  const dayText = mode === 'today' ? 'today' : formatWeekdayDate(selectedDateKey);
  const plannedMinutes = live.totalScheduledMinutesToday;
  const doneMinutes = live.completedScheduledMinutesToday;
  const deletingName = deleting ? `${blockName(deleting, activityMap.get(deleting.activityId))}, ${blockRange(deleting)}` : '';
  const deletingDoneToday = Boolean(deleting?.completed && mode === 'today');

  return (
    <div className="space-y-6">
      {timeTracker && (
        <WeekStrip timeTracker={timeTracker} today={today} selectedDateKey={selectedDateKey} onSelect={onSelectDateKey} />
      )}

      <Reveal index={0}>
        <PageHero
          ariaLabel={`${formatDateKeyHuman(selectedDateKey)}: blocks and points`}
          ring={{
            value: score.completedCount,
            max: score.effectiveDenominator,
            label: `Blocks done: ${score.completedCount} of ${score.effectiveDenominator}`,
            center: (
              <>
                {score.completedCount}
                <span className="text-sm font-medium text-content-muted">/{score.effectiveDenominator}</span>
              </>
            ),
            caption: 'done',
          }}
          lead={
            mode === 'future'
              ? { label: 'Planned', value: formatDurationHuman(plannedMinutes), hint: `${blocks.length} block${blocks.length === 1 ? '' : 's'}` }
              : {
                  label: mode === 'today' ? 'Points today' : 'Points that day',
                  value: <CountUp value={points} />,
                  hint: mode === 'today' ? nextTierHint(blocks) : `of ${TIME_TRACKER_POINTS.dailyCap} possible`,
                  valueClassName: 'text-success-text',
                }
          }
          stats={[
            { label: 'Planned', value: formatDurationHuman(plannedMinutes) },
            { label: 'Done', value: formatDurationHuman(doneMinutes), hint: skippedCount > 0 ? `${skippedCount} skipped` : undefined },
            mode === 'today'
              ? {
                  label: 'Next',
                  value: live.nextBlock ? formatTime12h(live.nextBlock.startTime) : '–',
                  hint: live.nextBlock ? blockName(live.nextBlock, activityMap.get(live.nextBlock.activityId)) : 'Nothing else today',
                }
              : { label: 'Blocks', value: `${doneCount}/${blocks.length}`, hint: 'done' },
          ]}
          side={
            mode === 'today' ? (
              <CapMeter variant="bar" label="Points today" earned={points} cap={TIME_TRACKER_POINTS.dailyCap} note={timeTrackerCapNote()} />
            ) : undefined
          }
        />
      </Reveal>

      {mode === 'today' && (
        <NowCard
          activeBlock={live.activeBlock}
          activeBlockEndMs={live.activeBlockEndMs}
          nextBlock={live.nextBlock}
          progressPercent={live.activeBlockProgressPercent}
          currentMinutes={live.currentMinutes}
          activityMap={activityMap}
          theme={theme}
          onDone={toggleDone}
          onSkip={skip}
          onOpenModule={openModule}
          onAddBlock={(start, end) => addBlock(start, end)}
        />
      )}

      <section className="card space-y-4 p-4 sm:p-5" aria-label={`Blocks, ${formatDateKeyHuman(selectedDateKey)}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="section-title">{formatDateKeyHuman(selectedDateKey)}</h2>
            {blocks.length > 0 && (
              <p className="figure text-xs text-content-muted">
                {doneCount} of {blocks.length} done · {formatDurationHuman(blocks.reduce((sum, b) => sum + calculateBlockDurationMinutes(b.startTime, b.endTime), 0))} planned
              </p>
            )}
          </div>
          {mode !== 'past' && (
            <div className="flex flex-wrap items-center gap-2">
              {templates.length > 0 && (
                <button type="button" onClick={onApplyTemplate} className="btn-secondary text-xs">
                  <Layers size={14} /> Apply template
                </button>
              )}
              <button type="button" onClick={() => addBlock()} className="btn-primary text-xs">
                <Plus size={14} /> Add block
              </button>
            </div>
          )}
        </div>

        {mode === 'past' && <p className="text-xs text-content-muted">Past days can’t change.</p>}

        {isPreview && planned.template && (
          <div className="flex flex-col gap-3 rounded-xl border border-overlay-default bg-overlay-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-content-tertiary">
              From your <span className="font-medium text-content-secondary">{planned.template.title}</span> template. Not saved yet: it’s kept once you use it or change a block.
            </p>
            <button
              type="button"
              onClick={() => {
                store.keepTemplatePreview(selectedDateKey);
                showSuccessToast('Plan saved', formatDateKeyHuman(selectedDateKey));
              }}
              className="btn-secondary shrink-0 text-xs"
            >
              Use it
            </button>
          </div>
        )}

        {blocks.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title={mode === 'past' ? 'Nothing was planned for this day' : `Nothing planned for ${dayText} yet`}
            description={mode === 'past' ? undefined : 'Add a block, or apply a template to fill the day.'}
            size="sm"
            surface={false}
          />
        ) : (
          <DayTimeline
            items={items}
            activityMap={activityMap}
            theme={theme}
            mode={mode}
            nowMinutes={mode === 'today' ? live.currentMinutes : undefined}
            onToggleDone={toggleDone}
            onSkip={skip}
            onUndoSkip={undoSkip}
            onEdit={onEditBlock}
            onDelete={setDeleting}
            onOpenModule={openModule}
            onAddInGap={(start, end) => addBlock(start, end)}
          />
        )}

        {mode !== 'past' && planned.source === 'saved' && blocks.length > 0 && (
          <div className="flex justify-end border-t border-overlay-subtle pt-3">
            <button type="button" onClick={() => setClearing(true)} className="btn-danger text-xs">
              Clear day
            </button>
          </div>
        )}
      </section>

      {/* One block, or a midnight block whose other half can still change: ask which. */}
      <ConfirmDeleteModal
        open={Boolean(deleting) && !partnerCanChange}
        onClose={() => setDeleting(null)}
        onConfirm={() => confirmDelete(false)}
        title="Delete block?"
        itemName={deletingName}
        description={deletingDoneToday ? "It's done, so today's points are worked out again." : undefined}
        confirmText="Delete block"
      />
      <Dialog
        open={Boolean(deleting) && partnerCanChange}
        onClose={() => setDeleting(null)}
        title="Delete both parts?"
        description={
          deleting && deletingPartner
            ? `${deletingName} runs past midnight. Its other part is ${blockRange(deletingPartner.block)} on ${formatWeekdayDate(deletingPartner.dateKey)}.`
            : undefined
        }
        footer={
          <>
            <button type="button" onClick={() => setDeleting(null)} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={() => confirmDelete(false)} className="btn-danger">
              Only this part
            </button>
            <button type="button" onClick={() => confirmDelete(true)} className="btn-danger-solid">
              Delete both
            </button>
          </>
        }
      >
        {null}
      </Dialog>

      <ConfirmDeleteModal
        open={clearing}
        onClose={() => setClearing(false)}
        onConfirm={confirmClear}
        title="Clear this day?"
        description={`Removes all ${blocks.length} block${blocks.length === 1 ? '' : 's'}${doneCount > 0 ? `, ${doneCount} of them done` : ''}.${mode === 'today' && doneCount > 0 ? " Today's points are worked out again." : ''} Its template won't fill it again.`}
        confirmText="Clear day"
      />
    </div>
  );
}
