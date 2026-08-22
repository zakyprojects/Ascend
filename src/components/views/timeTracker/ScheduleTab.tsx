import React, { useState, useEffect, useMemo } from 'react';
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
} from '@/lib/timeTracker';
import { todayKey, formatDateKeyHuman } from '@/lib/dates';
import { ActivityIcon } from './ActivityIcon';
import { LiveCountdown } from './LiveCountdown';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
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
  Sparkles,
  Zap,
  Flame,
  AlertCircle,
  BrainCircuit,
  Activity,
  BookOpen,
  Check,
  SkipForward,
} from 'lucide-react';
import { View } from '@/components/AppShell';

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
  const [now, setNow] = useState<Date>(new Date());

  const today = todayKey();
  const isSelectedDateToday = selectedDateKey === today;

  // Auto-hydrate on date load if needed
  useEffect(() => {
    store.hydrateTimeTrackerForDate(selectedDateKey);
  }, [selectedDateKey, store]);

  // Live timer interval to update active block & progress bar
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 15000); // 15 seconds
    return () => clearInterval(timer);
  }, []);

  const dailyBlocks = useMemo(() => {
    const blocks = store.state.timeTracker?.dailyLogs?.[selectedDateKey] || [];
    return [...blocks].sort(
      (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
    );
  }, [store.state.timeTracker?.dailyLogs, selectedDateKey]);

  const activityMap = useMemo(() => {
    return new Map<string, TimeTrackerActivity>(activities.map((a) => [a.id, a]));
  }, [activities]);

  const liveStats = useMemo(() => {
    return computeLiveSchedule(dailyBlocks, activities, now);
  }, [dailyBlocks, activities, now]);

  // Date Navigation Handlers
  const handlePrevDay = () => {
    const parts = selectedDateKey.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) - 1);
      onSelectDateKey(todayKey(d));
    }
  };

  const handleNextDay = () => {
    const parts = selectedDateKey.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + 1);
      onSelectDateKey(todayKey(d));
    }
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
          'Block Completed!',
          `Logged completion for "${block.customTitle || activityMap.get(block.activityId)?.name || 'Scheduled Block'}"`
        );
      }
    } catch (err: any) {
      showErrorToast('Failed to update block', err?.message);
    }
  };

  const handleConfirmDeleteBlock = async () => {
    if (!deleteTargetBlock) return;
    try {
      store.deleteDailyTimeBlock(selectedDateKey, deleteTargetBlock.id);
      showSuccessToast('Time block deleted');
    } catch (err: any) {
      showErrorToast('Failed to delete block', err?.message);
    } finally {
      setDeleteTargetBlock(null);
    }
  };

  const handleConfirmClearDay = async () => {
    try {
      store.clearDailyTimeBlocks(selectedDateKey);
      showSuccessToast('Day schedule cleared');
    } catch (err: any) {
      showErrorToast('Failed to clear schedule', err?.message);
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
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 w-full p-4 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-md">
        {/* Date Selector Navigation */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={handlePrevDay}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 transition-colors cursor-pointer shrink-0"
            title="Previous Day"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/60 border border-white/10 flex-1 sm:flex-none justify-center">
            <Calendar size={16} className="text-emerald-400 shrink-0" />
            <span className="text-sm font-bold text-slate-100 min-w-[100px] sm:min-w-[120px] text-center">
              {formattedDayTitle}
            </span>
            <span className="text-xs font-mono text-slate-500 hidden sm:inline">
              ({dayOfWeek})
            </span>
          </div>

          <button
            onClick={handleNextDay}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/5 transition-colors cursor-pointer shrink-0"
            title="Next Day"
          >
            <ChevronRight size={18} />
          </button>

          {!isSelectedDateToday && (
            <button
              onClick={handleJumpToToday}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-all cursor-pointer shrink-0"
            >
              Today
            </button>
          )}
        </div>

        {/* Schedule Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {templates.length > 0 && (
            <button
              onClick={onOpenApplyTemplateModal}
              className="flex-1 min-w-[120px] sm:flex-none justify-center flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all shadow-sm cursor-pointer"
              title="Apply Blueprint Template"
            >
              <Layers size={14} className="text-emerald-400 shrink-0" />
              <span className="whitespace-nowrap">Apply Template</span>
            </button>
          )}

          {dailyBlocks.length > 0 && (
            <button
              onClick={() => setShowClearDayModal(true)}
              className="p-2 text-xs text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 rounded-xl transition-colors cursor-pointer shrink-0"
              title="Clear Schedule for this Day"
            >
              <RotateCcw size={15} />
            </button>
          )}

          <button
            onClick={() => onOpenAddBlockModal()}
            className="flex-1 min-w-[120px] sm:flex-none justify-center flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
          >
            <Plus size={15} className="shrink-0" />
            <span className="whitespace-nowrap">Schedule Block</span>
          </button>
        </div>
      </div>

      {/* 2. Real-Time Live Status Card (When Viewing Today) */}
      {isSelectedDateToday && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/30 via-slate-900/60 to-slate-900/80 border border-emerald-500/20 backdrop-blur-md relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Active Block Info */}
            <div className="flex items-center gap-3.5 min-w-0">
              {liveStats.activeBlock && liveStats.activeBlockActivity ? (
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg relative"
                  style={{
                    backgroundColor: `${liveStats.activeBlockActivity.color}25`,
                    color: liveStats.activeBlockActivity.color,
                    border: `1px solid ${liveStats.activeBlockActivity.color}50`,
                  }}
                >
                  <ActivityIcon iconName={liveStats.activeBlockActivity.icon} size={24} />
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900 animate-ping" />
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-900" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 shrink-0">
                  <Clock size={22} />
                </div>
              )}

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {liveStats.activeBlock ? 'Active Live Block' : 'Live Status'}
                  </span>
                  <span className="text-xs text-slate-500 font-mono">
                    {liveStats.currentTimeString}
                  </span>
                </div>

                {liveStats.activeBlock && liveStats.activeBlockActivity ? (
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-slate-100 truncate">
                        {liveStats.activeBlock.customTitle || liveStats.activeBlockActivity.name}
                      </h3>
                      {liveStats.activeBlock.secondaryActivityIds &&
                        liveStats.activeBlock.secondaryActivityIds.map((secId) => {
                          const secAct = activityMap.get(secId);
                          if (!secAct) return null;
                          return (
                            <span
                              key={secId}
                              className="text-[10px] text-emerald-300 font-mono bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded shrink-0"
                            >
                              +{secAct.name}
                            </span>
                          );
                        })}
                    </div>
                    <p className="text-xs text-slate-300">
                      {formatTime12h(liveStats.activeBlock.startTime)} –{' '}
                      {formatTime12h(liveStats.activeBlock.endTime)} ·{' '}
                      <span className="text-emerald-300 font-semibold">
                        <LiveCountdown endTime={liveStats.activeBlock.endTime} />
                      </span>
                    </p>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-300">
                      Free / Unscheduled Window
                    </h3>
                    {liveStats.nextBlock ? (
                      <p className="text-xs text-slate-400">
                        Next: {liveStats.nextBlock.customTitle || 'Upcoming Block'} at{' '}
                        <strong className="text-slate-200">
                          {formatTime12h(liveStats.nextBlock.startTime)}
                        </strong>
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400">No further blocks scheduled for today.</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Action Button for Active Block */}
            {liveStats.activeBlock && (
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <button
                  onClick={() => handleToggleComplete(liveStats.activeBlock!)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                    liveStats.activeBlock.completed
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
                  }`}
                >
                  {liveStats.activeBlock.completed ? (
                    <>
                      <CheckCircle2 size={14} className="text-emerald-400" />
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
                  const activeLinkedModules: string[] = [];
                  if (liveStats.activeBlockActivity?.ascendModule) {
                    activeLinkedModules.push(liveStats.activeBlockActivity.ascendModule);
                  }
                  if (liveStats.activeBlock.secondaryActivityIds) {
                    liveStats.activeBlock.secondaryActivityIds.forEach((secId) => {
                      const secAct = activityMap.get(secId);
                      if (secAct?.ascendModule && !activeLinkedModules.includes(secAct.ascendModule)) {
                        activeLinkedModules.push(secAct.ascendModule);
                      }
                    });
                  }
                  return activeLinkedModules.map((mod) => (
                    <button
                      key={mod}
                      onClick={() => handleLaunchModuleHandoff(liveStats.activeBlock!, mod)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-200 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 transition-all shadow-sm cursor-pointer"
                    >
                      <Play size={13} className="fill-current text-emerald-400" />
                      <span>Launch {mod}</span>
                    </button>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* Active Block Progress Bar */}
          {liveStats.activeBlock && (
            <div className="mt-3">
              <div className="w-full h-1.5 bg-slate-950/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500 rounded-full"
                  style={{ width: `${liveStats.activeBlockProgressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. Daily Metrics Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Planned</span>
            <Clock size={14} className="text-emerald-400" />
          </div>
          <p className="text-lg font-bold text-slate-100">
            {formatDurationHuman(liveStats.totalScheduledMinutesToday)}
          </p>
          <p className="text-[11px] text-slate-500">{dailyBlocks.length} scheduled block(s)</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Execution Rate</span>
            <CheckCircle2 size={14} className="text-emerald-400" />
          </div>
          <p className="text-lg font-bold text-emerald-400">
            {liveStats.dayScheduledProgressPercent}%
          </p>
          <p className="text-[11px] text-slate-500">
            {formatDurationHuman(liveStats.completedScheduledMinutesToday)} completed
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Deep Work</span>
            <BrainCircuit size={14} className="text-indigo-400" />
          </div>
          <p className="text-lg font-bold text-indigo-300">
            {formatDurationHuman(liveStats.deepWorkMinutesToday)}
          </p>
          <p className="text-[11px] text-slate-500">Focus & High-leverage</p>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/50 border border-white/5 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Training & Mind</span>
            <Activity size={14} className="text-amber-400" />
          </div>
          <p className="text-lg font-bold text-amber-300">
            {formatDurationHuman(liveStats.exerciseMinutesToday + liveStats.readingMinutesToday)}
          </p>
          <p className="text-[11px] text-slate-500">Exercise & Reading</p>
        </div>
      </div>

      {/* 4. Professional Gantt-Style 24-Hour Distribution Bar */}
      {dailyBlocks.length > 0 && (
        <div className="p-4 rounded-2xl bg-slate-900/50 border border-white/5 space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <span className="font-semibold uppercase tracking-wider text-[11px] text-slate-300">
                24-Hour Timeline Distribution
              </span>
              <span className="text-[10px] text-slate-500 font-mono">
                ({dailyBlocks.length} blocks · {formatDurationHuman(liveStats.totalScheduledMinutesToday)})
              </span>
            </div>
            <span className="text-[11px] font-mono text-slate-500">00:00 – 24:00</span>
          </div>

          {/* Timeline Track with Major Hour Grid Guides */}
          <div className="relative w-full h-11 bg-slate-950/90 rounded-xl overflow-visible border border-white/10 shadow-inner">
            {/* Subtle Vertical Hour Grid Lines */}
            {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => (
              <div
                key={hour}
                className="absolute top-0 bottom-0 border-l border-white/5 pointer-events-none z-0"
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
              const color = act?.color || '#10b981';

              const isBlockActive =
                isSelectedDateToday &&
                nowMinutesCurrent >= startMins &&
                nowMinutesCurrent < endMins &&
                !block.completed &&
                !block.skipped;

              const isBlockPast =
                isSelectedDateToday && nowMinutesCurrent >= endMins;

              return (
                <div
                  key={block.id}
                  onClick={() => onOpenEditBlockModal(block)}
                  className={`group absolute top-1 bottom-1 rounded-md cursor-pointer transition-all flex items-center justify-center px-1 overflow-hidden z-1 shadow-sm ${
                    isBlockActive
                      ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-slate-950 shadow-md'
                      : isBlockPast
                      ? 'opacity-70 hover:opacity-100'
                      : 'hover:brightness-110 hover:shadow-md'
                  }`}
                  style={{
                    left: `calc(${leftPercent}% + 1px)`,
                    width: `calc(${widthPercent}% - 2px)`,
                    backgroundColor: color,
                    backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.15) 0%, rgba(0,0,0,0.15) 100%)',
                  }}
                >
                  {widthPercent > 4 && (
                    <span className="text-[10px] font-bold text-white truncate drop-shadow px-1 select-none">
                      {block.customTitle || act?.name}
                    </span>
                  )}

                  {/* High-End Floating Tooltip on Hover */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center pointer-events-none z-30 whitespace-nowrap">
                    <div className="px-2.5 py-1.5 rounded-lg bg-slate-900/95 border border-white/15 text-slate-100 text-xs shadow-2xl backdrop-blur-md space-y-0.5 text-center">
                      <div className="flex items-center justify-center gap-1.5 flex-wrap">
                        <p className="font-bold text-white">
                          {block.customTitle || act?.name || 'Block'}
                        </p>
                        {block.secondaryActivityIds &&
                          block.secondaryActivityIds.map((secId) => {
                            const secAct = activityMap.get(secId);
                            if (!secAct) return null;
                            return (
                              <span
                                key={secId}
                                className="text-[10px] text-emerald-300 font-mono bg-emerald-500/10 border border-emerald-500/20 px-1 py-0.2 rounded shrink-0"
                              >
                                +{secAct.name}
                              </span>
                            );
                          })}
                      </div>
                      <p className="text-[11px] text-slate-300 font-mono">
                        {formatTime12h(block.startTime)} – {formatTime12h(block.endTime)}{' '}
                        <span className="text-slate-400">({formatDurationHuman(duration)})</span>
                      </p>
                      {block.completed && (
                        <p className="text-[10px] text-emerald-400 font-semibold flex items-center justify-center gap-1">
                          <Check size={10} /> Completed
                        </p>
                      )}
                    </div>
                    <div className="w-2 h-2 bg-slate-900 rotate-45 -mt-1 border-r border-b border-white/15" />
                  </div>
                </div>
              );
            })}

            {/* Current Time Needle Cursor with Glowing Beacon */}
            {isSelectedDateToday && (
              <div
                className="absolute -top-1 -bottom-1 w-[2px] bg-rose-500 z-20 pointer-events-none shadow-[0_0_10px_rgba(244,63,94,0.9)]"
                style={{
                  left: `${(nowMinutesCurrent / 1440) * 100}%`,
                }}
              >
                {/* Top Glowing Diamond */}
                <div className="w-3 h-3 bg-rose-500 rotate-45 -ml-[5px] -mt-1.5 rounded-xs shadow-md border border-white/40" />
              </div>
            )}
          </div>

          {/* Major Hour Markers (0h, 3h, 6h, 9h, 12h, 15h, 18h, 21h, 24h) */}
          <div className="flex justify-between text-[10px] font-mono text-slate-400 px-0.5 pt-0.5">
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
        </div>
      )}

      {/* 5. Scheduled Blocks List with Live Status Sync */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
            Scheduled Timeline ({dailyBlocks.length})
          </h3>
          {dailyBlocks.length > 0 && (
            <button
              onClick={() => onOpenAddBlockModal()}
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center gap-1 cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Block</span>
            </button>
          )}
        </div>

        {dailyBlocks.length === 0 ? (
          <div className="p-8 rounded-2xl bg-slate-900/30 border border-white/5 text-center space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto shadow-inner">
              <Clock size={28} />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-200">No Blocks Scheduled</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                Construct your daily blueprint by adding time blocks or applying one of your saved templates.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3">
              {templates.length > 0 && (
                <button
                  onClick={onOpenApplyTemplateModal}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-slate-200 transition-all cursor-pointer"
                >
                  <Layers size={14} className="text-emerald-400" />
                  <span>Apply Template</span>
                </button>
              )}
              <button
                onClick={() => onOpenAddBlockModal()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>Add Time Block</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5">
            {dailyBlocks.map((block) => {
              const act = activityMap.get(block.activityId);
              const durationMins = calculateBlockDurationMinutes(block.startTime, block.endTime);
              const color = act?.color || '#10b981';

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

              const linkedModules: { moduleId: string; activityName: string }[] = [];
              const seenModules = new Set<string>();

              if (act?.ascendModule) {
                linkedModules.push({ moduleId: act.ascendModule, activityName: act.name });
                seenModules.add(act.ascendModule);
              }

              if (block.secondaryActivityIds) {
                block.secondaryActivityIds.forEach((secId) => {
                  const secAct = activityMap.get(secId);
                  if (secAct?.ascendModule && !seenModules.has(secAct.ascendModule)) {
                    linkedModules.push({ moduleId: secAct.ascendModule, activityName: secAct.name });
                    seenModules.add(secAct.ascendModule);
                  }
                });
              }

              return (
                <div
                  key={block.id}
                  className={`group relative p-4 rounded-2xl border transition-all ${
                    block.skipped
                      ? 'bg-slate-950/20 border-white/5 opacity-60'
                      : isBlockActive
                      ? 'bg-emerald-950/20 border-emerald-500/40 shadow-xl shadow-emerald-950/30 ring-2 ring-emerald-500/30'
                      : isBlockPast
                      ? 'bg-slate-950/40 border-white/5 opacity-60 grayscale-[0.35] hover:opacity-90 hover:grayscale-0'
                      : block.completed
                      ? 'bg-slate-950/30 border-white/5 opacity-80'
                      : 'bg-slate-900/60 border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* Left: Checkbox + Icon + Title */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <button
                        onClick={() => handleToggleComplete(block)}
                        className={`mt-1 p-1 rounded-lg transition-colors shrink-0 cursor-pointer ${
                          block.completed
                            ? 'text-emerald-400 hover:text-emerald-300'
                            : block.skipped
                            ? 'text-slate-600 hover:text-slate-400'
                            : 'text-slate-500 hover:text-slate-300'
                        }`}
                        title={block.completed ? 'Mark uncompleted' : block.skipped ? 'Undo skipped' : 'Mark completed'}
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
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner mt-0.5"
                        style={{
                          backgroundColor: `${color}25`,
                          color,
                          border: `1px solid ${color}40`,
                        }}
                      >
                        <ActivityIcon iconName={act?.icon || 'Activity'} size={20} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span
                            className="px-2 py-0.5 rounded-md text-[10px] font-bold truncate max-w-full"
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
                              return (
                                <span
                                  key={secId}
                                  className="text-[10px] text-emerald-300 font-mono bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded truncate max-w-full"
                                >
                                  +{secAct.name}
                                </span>
                              );
                            })}

                          <span className="text-xs font-mono font-semibold text-slate-300 whitespace-nowrap">
                            {formatTime12h(block.startTime)} – {formatTime12h(block.endTime)}
                          </span>

                          <span className="text-[11px] text-slate-500 font-mono whitespace-nowrap">
                            ({formatDurationHuman(durationMins)})
                          </span>

                          {isBlockActive && !block.skipped && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                              Active Now
                            </span>
                          )}

                          {block.skipped && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
                              <SkipForward size={10} />
                              Skipped
                            </span>
                          )}

                          {isBlockPast && !block.completed && !block.skipped && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-white/5">
                              Passed
                            </span>
                          )}
                        </div>

                        <h4
                          className={`text-sm font-bold mt-1 break-words ${
                            block.completed
                              ? 'text-slate-400 line-through'
                              : block.skipped
                              ? 'text-slate-500 line-through italic'
                              : 'text-slate-100'
                          }`}
                        >
                          {block.customTitle || act?.name || 'Scheduled Block'}
                        </h4>

                        {block.notes && (
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed line-clamp-2">
                            {block.notes}
                          </p>
                        )}

                        {linkedModules.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 mt-2">
                            {linkedModules.map((item) => (
                              <div key={item.moduleId} className="flex items-center gap-1.5">
                                <span className="text-[10px] text-emerald-300/80 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                                  <Zap size={11} className="text-emerald-400" />
                                  Linked: {item.moduleId}
                                </span>

                                <button
                                  onClick={() => handleLaunchModuleHandoff(block, item.moduleId)}
                                  className="text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  <span>Open {item.moduleId}</span>
                                  <Play size={10} className="fill-current" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right Action buttons */}
                    <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onOpenEditBlockModal(block)}
                        className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                        title="Edit Block"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteTargetBlock(block)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Delete Block"
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
          title="Delete Scheduled Time Block?"
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
