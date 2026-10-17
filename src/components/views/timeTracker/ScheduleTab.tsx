import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TimeTrackerActivity,
  TimeTrackerBlock,
  TimeTrackerTemplate,
} from '@/types';
import { AppStore } from '@/lib/store';
import {
  formatTime12h,
  calculateBlockDurationMinutes,
  formatDurationHuman,
  computeLiveSchedule,
  getDayOfWeekName,
  timeStringToMinutes,
  minutesToTimeString,
  getAscendViewForModule,
  getActivityDisplayColor,
  categoryTintStyle,
} from '@/lib/timeTracker';
import { todayKey, formatDateKeyHuman, addDays } from '@/lib/dates';
import { PageHero } from '@/components/ui/PageHero';
import { CapMeter } from '@/components/ui/CapMeter';
import { capNote } from '@/lib/capCopy';
import { TIME_TRACKER_POINTS, calculateTimeTrackerDailyPoints } from '@/lib/pointsConfig';
import { ActivityIcon } from './ActivityIcon';
import { LiveCountdown } from './LiveCountdown';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { EmptyState, ProgressBar } from '@/components/ui/primitives';
import { AutoNum } from '@/components/ui/Motion';
import {
  Clock,
  Plus,
  Layers,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Calendar,
  CheckCircle2,
  Circle,
  Play,
  Trash2,
  Edit2,
  Flame,
  AlertCircle,
  Activity,
  BookOpen,
  X,
  SkipForward,
  Coffee,
} from 'lucide-react';
import { View } from '@/components/AppShell';
import { TAP_TARGET, TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { toUserMessage } from '@/lib/userMessage';
import { trustedNow, trustedNowMs } from '@/lib/clock';

function getLaunchModules(
  primary: TimeTrackerActivity | undefined | null,
  secondaryIds: string[] | undefined,
  activityMap: Map<string, TimeTrackerActivity>
): { moduleId: string; activityId: string }[] {
  const out: { moduleId: string; activityId: string }[] = [];
  if (primary?.ascendModule) out.push({ moduleId: primary.ascendModule, activityId: primary.id });
  (secondaryIds || []).forEach((secId) => {
    const secAct = activityMap.get(secId);
    if (secAct?.ascendModule && !out.some((m) => m.moduleId === secAct.ascendModule)) {
      out.push({ moduleId: secAct.ascendModule, activityId: secAct.id });
    }
  });
  return out;
}

interface ScheduleTabProps {
  store: AppStore;
  activities: TimeTrackerActivity[];
  templates: TimeTrackerTemplate[];
  selectedDateKey: string;
  onSelectDateKey: (dateKey: string) => void;
  onOpenAddBlockModal: (defaultStart?: string) => void;
  onOpenEditBlockModal: (block: TimeTrackerBlock) => void;
  onOpenApplyTemplateModal: () => void;
  onNavigate?: (view: View) => void;
}

export function ScheduleTab({
  store,
  activities,
  templates,
  selectedDateKey,
  onSelectDateKey,
  onOpenAddBlockModal,
  onOpenEditBlockModal,
  onOpenApplyTemplateModal,
  onNavigate,
}: ScheduleTabProps) {
  const { showSuccessToast, showErrorToast } = useToast();
  const [deleteTargetBlock, setDeleteTargetBlock] = useState<TimeTrackerBlock | null>(null);
  const [showClearDayModal, setShowClearDayModal] = useState(false);
  const [now, setNow] = useState<Date>(trustedNow());

  const today = todayKey();
  const isSelectedDateToday = selectedDateKey === today;
  const isPastDate = selectedDateKey < today;
  const theme = store.state.themePreference || 'dark';

  const todayDailyLogs = store.state.timeTracker?.dailyLogs?.[today] || [];
  const timeTrackerDailyScore = calculateTimeTrackerDailyPoints(todayDailyLogs);

  // Auto-hydrate on date load if needed
  useEffect(() => {
    store.hydrateTimeTrackerForDate(selectedDateKey);
  }, [selectedDateKey, store]);

  // Live timer interval to update active block & progress bar
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(trustedNow());
    }, 15000); // 15 seconds
    return () => clearInterval(timer);
  }, []);

  const dailyBlocks = useMemo(() => {
    const blocks = store.state.timeTracker?.dailyLogs?.[selectedDateKey] || [];
    return [...blocks].sort(
      (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
    );
  }, [store.state.timeTracker?.dailyLogs, selectedDateKey]);

  const [selectedStripBlockId, setSelectedStripBlockId] = useState<string | null>(null);
  const stripTrackRef = useRef<HTMLDivElement>(null);
  const [stripWidth, setStripWidth] = useState(0);

  useEffect(() => {
    if (dailyBlocks.length === 0) return;
    const el = stripTrackRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.width > 0) {
      setStripWidth(Math.round(rect.width));
    }

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          setStripWidth(Math.round(entry.contentRect.width));
        }
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [dailyBlocks.length > 0]);

  const activityMap = useMemo(() => {
    return new Map<string, TimeTrackerActivity>(activities.map((a) => [a.id, a]));
  }, [activities]);

  const liveStats = useMemo(() => {
    return computeLiveSchedule(dailyBlocks, activities, now);
  }, [dailyBlocks, activities, now]);

  // Date Navigation Handlers
  const handlePrevDay = () => {
    onSelectDateKey(addDays(selectedDateKey, -1));
  };

  const handleNextDay = () => {
    onSelectDateKey(addDays(selectedDateKey, 1));
  };

  const handleJumpToToday = () => {
    onSelectDateKey(today);
  };

  // Block Actions
  const handleToggleComplete = async (block: TimeTrackerBlock) => {
    try {
      store.toggleDailyTimeBlockCompleted(selectedDateKey, block.id);
      const isNowCompleted = !block.completed;
      if (isNowCompleted) {
        showSuccessToast(
          'Block completed!',
          `Logged completion for "${block.customTitle || activityMap.get(block.activityId)?.name || 'Scheduled Block'}"`
        );
      }
    } catch (err: any) {
      showErrorToast("Couldn't update block", toUserMessage(err, 'Try again.'));
    }
  };

  const handleConfirmDeleteBlock = async () => {
    if (!deleteTargetBlock) return;
    const blockId = deleteTargetBlock.id;
    try {
      store.deleteDailyTimeBlock(selectedDateKey, blockId);
      showSuccessToast('Time block deleted', 'Time block removed.', `time_block_${blockId}`);
    } catch (err: any) {
      showErrorToast("Couldn't delete block", toUserMessage(err, 'Try again.'));
    } finally {
      setDeleteTargetBlock(null);
    }
  };

  const handleConfirmClearDay = async () => {
    try {
      store.clearDailyTimeBlocks(selectedDateKey);
      showSuccessToast('Day cleared', 'Day schedule cleared.', `clear_day_${selectedDateKey}_${trustedNowMs()}`);
    } catch (err: any) {
      showErrorToast("Couldn't clear day", toUserMessage(err, 'Try again.'));
    } finally {
      setShowClearDayModal(false);
    }
  };

  // Module Quick-Launch Handoff
  const handleLaunchModuleHandoff = (block: TimeTrackerBlock, targetModule?: string) => {
    const act = activityMap.get(block.activityId);
    const mod = targetModule || act?.ascendModule;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = timeStringToMinutes(block.startTime);
    const endMinutes = timeStringToMinutes(block.endTime);

    let targetDuration = endMinutes - startMinutes;
    if (isSelectedDateToday && nowMinutes >= startMinutes && nowMinutes < endMinutes) {
      targetDuration = endMinutes - nowMinutes;
    }
    // Absolute safeguard to prevent timer crashing on 0 or negative values
    targetDuration = Math.max(1, targetDuration);

    const title = block.customTitle || act?.name || 'Focus Block';

    const targetView = getAscendViewForModule(targetModule || act?.ascendModule, act?.name);

    if (targetView === 'prefrontal') {
      try {
        sessionStorage.removeItem('ascend_pending_focus_task');
        sessionStorage.removeItem('ascend_pending_focus_duration');
        sessionStorage.removeItem('ascend_pending_focus_timestamp');
        sessionStorage.setItem('ascend_pending_pfc_timer_mode', 'sync');
      } catch {
        /* storage quota fallback */
      }
      if (onNavigate) {
        onNavigate('prefrontal');
      }
    } else if (targetView && onNavigate) {
      onNavigate(targetView);
    }
  };

  const dayOfWeek = getDayOfWeekName(selectedDateKey);
  const formattedDayTitle = formatDateKeyHuman(selectedDateKey);
  const nowMinutesCurrent = now.getHours() * 60 + now.getMinutes();

  return (
    <div className="space-y-6">
      {/* 1. Date Navigation & Actions Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full p-4 rounded-2xl bg-bg-800/60 border border-overlay-subtle ">
        {/* Date Selector Navigation */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handlePrevDay}
            className={`p-2 rounded-xl bg-overlay-subtle hover:bg-overlay-default text-content-tertiary hover:text-content-primary border border-overlay-subtle transition-colors cursor-pointer shrink-0 ${TAP_TARGET}`}
            title="Previous day"
            aria-label="Previous day"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-overlay-default flex-1 sm:flex-none justify-center">
            <Calendar size={16} className="text-success-text shrink-0" />
            <span className="item-name text-sm min-w-[100px] sm:min-w-[120px] text-center">
              {formattedDayTitle}
            </span>
            <span className="text-xs text-content-disabled hidden sm:inline">
              ({dayOfWeek})
            </span>
          </div>

          <button
            onClick={handleNextDay}
            className={`p-2 rounded-xl bg-overlay-subtle hover:bg-overlay-default text-content-tertiary hover:text-content-primary border border-overlay-subtle transition-colors cursor-pointer shrink-0 ${TAP_TARGET}`}
            title="Next day"
            aria-label="Next day"
          >
            <ChevronRight size={18} />
          </button>

          {!isSelectedDateToday && (
            <button
              onClick={handleJumpToToday}
              className="text-xs font-medium px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-success-text border border-emerald-500/30 transition-colors cursor-pointer shrink-0"
            >
              Today
            </button>
          )}
        </div>

        {/* Schedule Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {dailyBlocks.length > 0 && (
            <button
              onClick={() => setShowClearDayModal(true)}
              disabled={isPastDate}
              className={`p-2 text-xs text-content-muted hover:text-rose-theme hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-xl transition-colors cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${TAP_TARGET}`}
              title="Clear Schedule for this Day"
            >
              <RotateCcw size={15} />
            </button>
          )}

          {templates.length > 0 && (
            <button
              onClick={onOpenApplyTemplateModal}
              disabled={isPastDate}
              className="flex-1 min-w-[120px] sm:flex-none justify-center flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-content-secondary bg-overlay-subtle hover:bg-overlay-default border border-overlay-default rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Apply blueprint template"
            >
              <Layers size={14} className="text-success-text shrink-0" />
              <span className="whitespace-nowrap">Apply Template</span>
            </button>
          )}

          <button
            onClick={() => onOpenAddBlockModal()}
            disabled={isPastDate}
            className="flex-1 min-w-[120px] sm:flex-none justify-center flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-on-brand bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={15} className="shrink-0" />
            <span className="whitespace-nowrap">Schedule Block</span>
          </button>
        </div>
      </div>

      {/* 2. Real-Time Live Status Card (When Viewing Today) */}
      {isSelectedDateToday && (
        <div className="p-4 rounded-2xl bg-bg-800 border border-overlay-subtle shadow-sm relative overflow-hidden">
          <div className="flex flex-col gap-3">
            {/* Active Block Info */}
            <div className="flex items-center gap-3.5 min-w-0">
              {liveStats.activeBlock && liveStats.activeBlockActivity ? (() => {
                const activeColor = getActivityDisplayColor(liveStats.activeBlockActivity, theme);
                return (
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${activeColor}25`,
                      color: activeColor,
                      border: `1px solid ${activeColor}50`,
                    }}
                  >
                    <ActivityIcon iconName={liveStats.activeBlockActivity.icon} size={22} />
                  </div>
                );
              })() : (
                <div className="w-6 flex items-center justify-center text-content-subtle shrink-0">
                  <Clock size={20} />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-success-text flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {liveStats.activeBlock ? 'Active Live Block' : 'Live Status'}
                  </span>
                  <span className="figure text-xs text-content-disabled">
                    {liveStats.currentTimeString}
                  </span>
                </div>

                {liveStats.activeBlock && liveStats.activeBlockActivity ? (
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="section-title text-xl leading-tight truncate">
                        {liveStats.activeBlock.customTitle || liveStats.activeBlockActivity.name}
                      </h3>
                      {liveStats.activeBlock.secondaryActivityIds &&
                        liveStats.activeBlock.secondaryActivityIds.map((secId) => {
                          const secAct = activityMap.get(secId);
                          if (!secAct) return null;
                          if (getLaunchModules(liveStats.activeBlockActivity, liveStats.activeBlock?.secondaryActivityIds, activityMap).some((m) => m.activityId === secId)) return null;
                          return (
                            <span
                              key={secId}
                              className="text-2xs font-medium px-1.5 py-0.5 rounded shrink-0"
                              style={categoryTintStyle(getActivityDisplayColor(secAct, theme))}
                            >
                              +{secAct.name}
                            </span>
                          );
                        })}
                    </div>
                    <p className="text-xs text-content-tertiary">
                      {formatTime12h(liveStats.activeBlock.startTime)} –{' '}
                      {formatTime12h(liveStats.activeBlock.endTime)} ·{' '}
                      <span className="figure text-success-text">
                        <LiveCountdown endTime={liveStats.activeBlock.endTime} />
                      </span>
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="item-name text-sm text-content-tertiary">
                      Free time
                    </h3>
                    {liveStats.nextBlock ? (
                      <p className="text-xs text-content-muted">
                        Next: {liveStats.nextBlock.customTitle || 'Upcoming Block'} at{' '}
                        <strong className="text-content-secondary">
                          {formatTime12h(liveStats.nextBlock.startTime)}
                        </strong>
                      </p>
                    ) : (
                      <p className="text-xs text-content-muted">No further blocks scheduled for today.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Action Button for Active Block */}
            {liveStats.activeBlock && (
              <div className="flex flex-wrap items-center gap-2 w-full">
                <button
                  onClick={() => handleToggleComplete(liveStats.activeBlock!)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    liveStats.activeBlock.completed
                      ? 'bg-emerald-500/20 text-success-text border border-emerald-500/30'
                      : 'bg-overlay-subtle hover:bg-overlay-default text-content-secondary border border-overlay-default'
                  }`}
                >
                  {liveStats.activeBlock.completed ? (
                    <>
                      <CheckCircle2 size={14} className="text-success-text" />
                      <span>Completed</span>
                    </>
                  ) : (
                    <>
                      <Circle size={14} />
                      <span>Mark Complete</span>
                    </>
                  )}
                </button>

                {(() => {
                  const activeLinkedModules = getLaunchModules(liveStats.activeBlockActivity, liveStats.activeBlock.secondaryActivityIds, activityMap);
                  return activeLinkedModules.map((m) => (
                    <button
                      key={m.moduleId}
                      onClick={() => handleLaunchModuleHandoff(liveStats.activeBlock!, m.moduleId)}
                      aria-label={`Launch ${m.moduleId}`}
                      title={`Open ${m.moduleId} (${activityMap.get(m.activityId)?.name ?? m.moduleId})`}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-micro font-semibold whitespace-nowrap hover:opacity-80 transition-opacity cursor-pointer"
                      style={categoryTintStyle(getActivityDisplayColor(activityMap.get(m.activityId), theme))}
                    >
                      <Play size={11} className="fill-current shrink-0" />
                      <span>{m.moduleId}</span>
                    </button>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Active Block Progress Bar */}
          {liveStats.activeBlock && (
            <div className="mt-3">
              <ProgressBar
                value={liveStats.activeBlockProgressPercent}
                label="Current block progress"
                size="sm"
                live
                fillStyle={
                  liveStats.activeBlockActivity
                    ? { backgroundColor: getActivityDisplayColor(liveStats.activeBlockActivity, theme) }
                    : undefined
                }
              />
            </div>
          )}
        </div>
      )}

      {/* 3. The day at a glance: one hero instead of four boxes and a separate meter */}
      <PageHero
        ariaLabel="This day at a glance"
        ring={{
          value: liveStats.dayScheduledProgressPercent,
          max: 100,
          label: `Execution rate: ${liveStats.dayScheduledProgressPercent}%`,
          center: <AutoNum text={`${liveStats.dayScheduledProgressPercent}%`} />,
          caption: 'executed',
          tone: 'success',
        }}
        lead={{
          label: 'Planned',
          value: <AutoNum text={formatDurationHuman(liveStats.totalScheduledMinutesToday)} />,
          hint: `${dailyBlocks.length} scheduled block${dailyBlocks.length === 1 ? '' : 's'}, ${formatDurationHuman(liveStats.completedScheduledMinutesToday)} done`,
        }}
        stats={[
          { label: 'Deep work', value: <AutoNum text={formatDurationHuman(liveStats.deepWorkMinutesToday)} />, hint: 'Focus & high-leverage', valueClassName: 'text-info-text' },
          {
            label: 'Training & mind',
            value: <AutoNum text={formatDurationHuman(liveStats.exerciseMinutesToday + liveStats.readingMinutesToday)} />,
            hint: 'Exercise & reading',
            valueClassName: 'text-warning-text',
          },
        ]}
        side={
          isSelectedDateToday ? (
            <CapMeter
              variant="bar"
              label={`Points today (${Math.floor(timeTrackerDailyScore.percentage)}% of blocks)`}
              earned={timeTrackerDailyScore.pointsAwarded}
              cap={TIME_TRACKER_POINTS.dailyCap}
              note={capNote('timeTracker')}
            />
          ) : undefined
        }
      />

      {/* 4. Professional Gantt-Style 24-Hour Distribution Bar */}
      {dailyBlocks.length > 0 && (
        <div className="p-4 rounded-2xl border border-overlay-subtle space-y-3">
          <div className="flex items-center justify-between text-xs text-content-muted">
            <div className="flex items-center gap-2">
              <span className="item-name text-xs text-content-secondary">
                24-Hour Timeline Distribution
              </span>
              <span className="figure text-2xs text-content-disabled">
                ({dailyBlocks.length} blocks · {formatDurationHuman(liveStats.totalScheduledMinutesToday)})
              </span>
            </div>
            <span className="figure text-micro text-content-disabled">00:00 – 24:00</span>
          </div>

          {/* Timeline Track with Major Hour Grid Guides */}
          <div
            ref={stripTrackRef}
            className="relative w-full h-11 bg-overlay-subtle rounded-xl overflow-visible border border-overlay-default"
          >
            {/* Subtle Vertical Hour Grid Lines */}
            {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => (
              <div
                key={hour}
                className="absolute top-0 bottom-0 border-l border-overlay-subtle pointer-events-none z-0"
                style={{ left: `${(hour / 24) * 100}%` }}
              />
            ))}

            {/* Block Segments */}
            {dailyBlocks.map((block) => {
              const startMins = timeStringToMinutes(block.startTime);
              const endMins = timeStringToMinutes(block.endTime);
              const duration = Math.max(1, endMins - startMins);
              const leftPercent = (startMins / 1440) * 100;
              const widthPercent = (duration / 1440) * 100;
              const act = activityMap.get(block.activityId);
              const color = getActivityDisplayColor(act, theme);

              const isBlockActive =
                isSelectedDateToday &&
                nowMinutesCurrent >= startMins &&
                nowMinutesCurrent < endMins &&
                !block.completed &&
                !block.skipped;

              const isBlockPast =
                isSelectedDateToday && nowMinutesCurrent >= endMins;

              const blockName = block.customTitle || act?.name || 'Block';
              const blockPx = (stripWidth * widthPercent) / 100 - 10;
              const iconFits = stripWidth > 0 && blockPx >= 12;
              const nameFits = stripWidth > 0 && blockPx >= 16 + blockName.length * 6.5;

              return (
                <div
                  key={block.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedStripBlockId === block.id}
                  aria-label={`${blockName}, ${formatTime12h(block.startTime)} to ${formatTime12h(block.endTime)}`}
                  title={`${blockName} · ${formatTime12h(block.startTime)} – ${formatTime12h(block.endTime)} (${formatDurationHuman(duration)})`}
                  onClick={() => setSelectedStripBlockId((cur) => (cur === block.id ? null : block.id))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      if (e.key === ' ') e.preventDefault();
                      setSelectedStripBlockId((cur) => (cur === block.id ? null : block.id));
                    }
                  }}
                  className={`absolute top-1 bottom-1 rounded-lg cursor-pointer transition-all flex items-center justify-center px-1 overflow-hidden z-1 shadow-sm ${
                    isBlockActive
                      ? 'ring-2 ring-content-primary ring-offset-1 ring-offset-bg-900 shadow-md'
                      : isBlockPast
                      ? 'opacity-70 hover:opacity-100'
                      : 'hover:brightness-110 hover:shadow-md'
                  } ${
                    selectedStripBlockId === block.id && !isBlockActive
                      ? 'ring-2 ring-content-tertiary ring-offset-1 ring-offset-bg-900'
                      : ''
                  }`}
                  style={{
                    left: `calc(${leftPercent}% + 1px)`,
                    width: `calc(${widthPercent}% - 2px)`,
                    backgroundColor: color,
                  }}
                >
                  {nameFits ? (
                    <span className="flex items-center gap-1 min-w-0">
                      <ActivityIcon iconName={act?.icon || 'Activity'} size={12} className="text-white shrink-0" />
                      <span className="text-2xs font-medium text-white whitespace-nowrap select-none">{blockName}</span>
                    </span>
                  ) : iconFits ? (
                    <ActivityIcon iconName={act?.icon || 'Activity'} size={12} className="text-white shrink-0" />
                  ) : null}
                </div>
              );
            })}

            {/* Current Time Needle Cursor with Glowing Beacon */}
            {isSelectedDateToday && (
              <div
                className="absolute -top-1 -bottom-1 w-[2px] bg-rose-500 z-20 pointer-events-none"
                style={{
                  left: `${(nowMinutesCurrent / 1440) * 100}%`,
                }}
              >
                {/* Top Glowing Diamond */}
                <div className="w-3 h-3 bg-rose-500 rotate-45 -ml-[5px] -mt-1.5 rounded-sm shadow-md border border-overlay-heavy" />
              </div>
            )}
          </div>

          {/* Major Hour Markers (0h, 3h, 6h, 9h, 12h, 15h, 18h, 21h, 24h) */}
          <div className="figure flex justify-between text-2xs text-content-muted px-0.5 pt-0.5">
            <span>12 AM</span>
            <span>3 AM</span>
            <span>6 AM</span>
            <span>9 AM</span>
            <span>12 PM</span>
            <span>3 PM</span>
            <span>6 PM</span>
            <span>9 PM</span>
            <span>12 AM</span>
          </div>

          {(() => {
            const sel = dailyBlocks.find((b) => b.id === selectedStripBlockId);
            if (!sel) return null;
            const selAct = activityMap.get(sel.activityId);
            const selColor = getActivityDisplayColor(selAct, theme);
            const selMins = Math.max(1, timeStringToMinutes(sel.endTime) - timeStringToMinutes(sel.startTime));
            const selName = sel.customTitle || selAct?.name || 'Block';

            return (
              <div className="flex items-start justify-between gap-3 p-3 rounded-xl bg-bg-800 border border-overlay-subtle">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: selColor }} />
                  <div className="min-w-0">
                    <p className="item-name text-sm break-words">{selName}</p>
                    <p className="figure text-xs text-content-tertiary">
                      {formatTime12h(sel.startTime)} – {formatTime12h(sel.endTime)} · {formatDurationHuman(selMins)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onOpenEditBlockModal(sel)}
                    disabled={isPastDate}
                    aria-label="Edit block"
                    title={isPastDate ? 'Cannot edit past logs' : 'Edit Block'}
                    className={`p-1.5 text-content-muted hover:text-content-secondary hover:bg-overlay-subtle rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${TAP_TARGET_Y}`}
                  >
                    <Edit2 size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStripBlockId(null)}
                    aria-label="Close block details"
                    className={`p-1.5 text-content-muted hover:text-content-secondary hover:bg-overlay-subtle rounded-lg transition-colors cursor-pointer ${TAP_TARGET_Y}`}
                  >
                    <X size={15} />
                  </button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* 5. Scheduled Blocks List with Live Status Sync */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="section-title text-xl leading-tight">
            Scheduled Timeline ({dailyBlocks.length})
          </h3>
          {dailyBlocks.length > 0 && (
            <button
              onClick={() => onOpenAddBlockModal()}
              disabled={isPastDate}
              className="text-xs font-medium text-success-text hover:opacity-80 flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={13} />
              <span>Add Block</span>
            </button>
          )}
        </div>

        {isPastDate && (
          <p className="text-micro text-content-muted">Past days are read-only.</p>
        )}

        {dailyBlocks.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No blocks scheduled"
            description="Add time blocks or apply one of your saved templates."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
                {templates.length > 0 && (
                  <button
                    onClick={onOpenApplyTemplateModal}
                    disabled={isPastDate}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-overlay-subtle hover:bg-overlay-default border border-overlay-default text-xs font-semibold text-content-secondary whitespace-nowrap transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Layers size={14} className="text-success-text" />
                    <span>Apply Template</span>
                  </button>
                )}
                <button
                  onClick={() => onOpenAddBlockModal()}
                  disabled={isPastDate}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-on-brand text-xs font-semibold whitespace-nowrap shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus size={14} />
                  <span>Add Time Block</span>
                </button>
              </div>
            }
          />
        ) : (
          <div className="card p-0 divide-y divide-overlay-subtle">
            {dailyBlocks.map((block) => {
              const act = activityMap.get(block.activityId);
              const durationMins = calculateBlockDurationMinutes(block.startTime, block.endTime);
              const color = getActivityDisplayColor(act, theme);

              const startMins = timeStringToMinutes(block.startTime);
              const endMins = timeStringToMinutes(block.endTime);

              const isBlockActive =
                isSelectedDateToday &&
                nowMinutesCurrent >= startMins &&
                nowMinutesCurrent < endMins &&
                !block.completed &&
                !block.skipped;

              const isBlockPast =
                isSelectedDateToday && nowMinutesCurrent >= endMins;

              const linkedModules: { moduleId: string; activityId: string; activityName: string }[] = [];
              const seenModules = new Set<string>();

              if (act?.ascendModule) {
                linkedModules.push({ moduleId: act.ascendModule, activityId: act.id, activityName: act.name });
                seenModules.add(act.ascendModule);
              }

              if (block.secondaryActivityIds) {
                block.secondaryActivityIds.forEach((secId) => {
                  const secAct = activityMap.get(secId);
                  if (secAct?.ascendModule && !seenModules.has(secAct.ascendModule)) {
                    linkedModules.push({ moduleId: secAct.ascendModule, activityId: secAct.id, activityName: secAct.name });
                    seenModules.add(secAct.ascendModule);
                  }
                });
              }

              return (
                <div
                  key={block.id}
                  className={`scroll-rise group relative p-4 transition-colors ${
                    block.skipped
                      ? 'opacity-60'
                      : isBlockActive
                      ? 'bg-overlay-subtle'
                      : isBlockPast
                      ? 'opacity-60 grayscale-[0.35] hover:opacity-90 hover:grayscale-0'
                      : block.completed
                      ? 'opacity-80'
                      : 'hover:bg-overlay-subtle'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: Checkbox + Icon + Title */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <button
                        onClick={() => handleToggleComplete(block)}
                        disabled={!isSelectedDateToday}
                        className={`mt-1 p-1 rounded-lg transition-colors shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          block.completed
                            ? 'text-success-text hover:opacity-80'
                            : block.skipped
                            ? 'text-content-subtle hover:text-content-muted'
                            : 'text-content-disabled hover:text-content-tertiary'
                        } ${TAP_TARGET}`}
                        aria-label={block.completed ? 'Mark uncompleted' : block.skipped ? 'Undo skipped' : 'Mark completed'}
                        title={
                          !isSelectedDateToday
                            ? "Only today's blocks can be completed"
                            : block.completed
                            ? 'Mark uncompleted'
                            : block.skipped
                            ? 'Undo skipped'
                            : 'Mark completed'
                        }
                      >
                        {block.completed ? (
                          <CheckCircle2 size={20} />
                        ) : block.skipped ? (
                          <SkipForward size={20} />
                        ) : (
                          <Circle size={20} />
                        )}
                      </button>

                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                        style={{
                          backgroundColor: `${color}25`,
                          color,
                          border: `1px solid ${color}40`,
                        }}
                      >
                        <ActivityIcon iconName={act?.icon || 'Activity'} size={18} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span
                            className="px-2 py-0.5 rounded-lg text-2xs font-medium truncate max-w-full"
                            style={{
                              backgroundColor: `${color}20`,
                              color,
                              border: `1px solid ${color}30`,
                            }}
                          >
                            {act?.name || 'Activity'}
                          </span>

                          {block.secondaryActivityIds &&
                            block.secondaryActivityIds.map((secId) => {
                              const secAct = activityMap.get(secId);
                              if (!secAct) return null;
                              if (linkedModules.some((m) => m.activityId === secId)) return null;
                              return (
                                <span
                                  key={secId}
                                  className="text-2xs font-medium px-1.5 py-0.5 rounded truncate max-w-full"
                                  style={categoryTintStyle(getActivityDisplayColor(secAct, theme))}
                                >
                                  +{secAct.name}
                                </span>
                              );
                            })}

                          <span className="figure text-xs text-content-tertiary whitespace-nowrap">
                            {formatTime12h(block.startTime)} – {formatTime12h(block.endTime)}
                          </span>

                          <span className="figure text-micro text-content-disabled whitespace-nowrap">
                            ({formatDurationHuman(durationMins)})
                          </span>

                          {block.breakDurationMinutes && (
                            <span className="badge-emerald px-2 py-0.5 rounded-full text-2xs font-medium flex items-center gap-1 shrink-0">
                              <Coffee size={10} />
                              <span>{block.breakDurationMinutes}m break</span>
                            </span>
                          )}

                          {isBlockActive && !block.skipped && (
                            <span className="badge-emerald px-2 py-0.5 rounded-full text-2xs font-medium flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Active Now
                            </span>
                          )}

                          {block.skipped && (
                            <span className="badge-amber px-2 py-0.5 rounded-full text-2xs font-medium flex items-center gap-1">
                              <SkipForward size={10} />
                              Skipped
                            </span>
                          )}

                          {isBlockPast && !block.completed && !block.skipped && (
                            <span className="text-2xs text-content-muted">
                              Passed
                            </span>
                          )}
                        </div>

                        <h4
                          className={`item-name text-sm mt-1 break-words ${
                            block.completed
                              ? 'text-content-muted line-through'
                              : block.skipped
                              ? 'text-content-disabled line-through italic'
                              : 'text-content-primary'
                          }`}
                        >
                          {block.customTitle || act?.name || 'Scheduled Block'}
                        </h4>

                        {block.notes && (
                          <p className="text-xs text-content-muted mt-1 leading-relaxed line-clamp-2">
                            {block.notes}
                          </p>
                        )}

                        {linkedModules.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {linkedModules.map((item) => (
                              <button
                                key={item.moduleId}
                                onClick={() => handleLaunchModuleHandoff(block, item.moduleId)}
                                title={`Open ${item.moduleId} (${item.activityName})`}
                                className="text-micro font-semibold px-2 py-0.5 rounded-lg hover:opacity-80 transition-opacity flex items-center gap-1 cursor-pointer"
                                style={categoryTintStyle(getActivityDisplayColor(activityMap.get(item.activityId), theme))}
                              >
                                <span>Open {item.moduleId}</span>
                                <Play size={10} className="fill-current" />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Action buttons */}
                    <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onOpenEditBlockModal(block)}
                        disabled={isPastDate}
                        className={`p-1.5 text-content-muted hover:text-content-secondary hover:bg-overlay-subtle rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${TAP_TARGET_Y}`}
                        title="Edit block"
                        aria-label="Edit block"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteTargetBlock(block)}
                        disabled={isPastDate}
                        className={`p-1.5 text-content-muted hover:text-rose-theme hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${TAP_TARGET_Y}`}
                        title="Delete block"
                        aria-label="Delete block"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Single Block Modal */}
      {deleteTargetBlock && (
        <ConfirmDeleteModal
          open={Boolean(deleteTargetBlock)}
          onClose={() => setDeleteTargetBlock(null)}
          onConfirm={handleConfirmDeleteBlock}
          title="Delete scheduled time block?"
          description={`Are you sure you want to remove the block scheduled for ${formatTime12h(
            deleteTargetBlock.startTime
          )} - ${formatTime12h(deleteTargetBlock.endTime)}?`}
        />
      )}

      {/* Clear Entire Day Modal */}
      {showClearDayModal && (
        <ConfirmDeleteModal
          open={showClearDayModal}
          onClose={() => setShowClearDayModal(false)}
          onConfirm={handleConfirmClearDay}
          title="Clear Schedule for this Day?"
          description={`This will permanently remove all ${dailyBlocks.length} scheduled time block(s) for ${formattedDayTitle}.`}
        />
      )}
    </div>
  );
}
