import React, { useState, useMemo } from 'react';
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
  timeStringToMinutes,
  DAYS_OF_WEEK,
  getActivityDisplayColor,
  categoryTintStyle,
} from '@/lib/timeTracker';
import { todayKey, formatDateKeyHuman } from '@/lib/dates';
import { ActivityIcon } from './ActivityIcon';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { Dialog, EmptyState } from '@/components/ui/primitives';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  Clock,
  ArrowRight,
  Check,
  Zap,
  Compass,
  Brain,
  Heart,
  Moon,
  AlertTriangle,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { toUserMessage } from '@/lib/userMessage';

interface TemplatesTabProps {
  store: AppStore;
  templates: TimeTrackerTemplate[];
  activities: TimeTrackerActivity[];
  selectedDateKey: string;
  onOpenCreateTemplateModal: () => void;
  onOpenEditTemplateModal: (template: TimeTrackerTemplate) => void;
  onOpenApplyTemplateModal: (preselectedTemplateId?: string) => void;
}

export function TemplatesTab({
  store,
  templates,
  activities,
  selectedDateKey,
  onOpenCreateTemplateModal,
  onOpenEditTemplateModal,
  onOpenApplyTemplateModal,
}: TemplatesTabProps) {
  const { showSuccessToast, showErrorToast } = useToast();
  const [deleteTargetTemplate, setDeleteTargetTemplate] = useState<TimeTrackerTemplate | null>(null);
  // Phones: the 8+8+8 guide starts folded; from md up it is always open and the toggle is hidden.
  const [ruleOpen, setRuleOpen] = useState(false);
  const theme = store.state.themePreference || 'dark';
  const [conflictState, setConflictState] = useState<{
    isOpen: boolean;
    day: string;
    template: TimeTrackerTemplate;
    conflictingTitle: string;
  } | null>(null);

  const activityMap = useMemo(() => {
    const map = new Map<string, TimeTrackerActivity>();
    for (const act of activities) {
      map.set(act.id, act);
    }
    return map;
  }, [activities]);

  const handleApplyToDate = (templateId: string, dateKey: string) => {
    try {
      const result = store.applyTemplateToDate(dateKey, templateId, 'merge');
      if (result.added > 0 && result.rejected === 0) {
        showSuccessToast('Blueprint merged', `Blueprint merged: ${result.added} blocks added to ${formatDateKeyHuman(dateKey)}.`);
      } else if (result.added > 0 && result.rejected > 0) {
        showSuccessToast('Blueprint merged', `Blueprint merged: ${result.added} added, ${result.rejected} skipped (overlap).`);
      } else if (result.added === 0 && result.rejected > 0) {
        showErrorToast('Nothing merged', `All ${result.rejected} blocks overlapped with existing schedule.`);
      } else {
        showSuccessToast('Blueprint applied', `Blueprint applied to ${formatDateKeyHuman(dateKey)}.`);
      }
    } catch (err: any) {
      showErrorToast("Couldn't apply template", toUserMessage(err, 'Try again.'));
    }
  };

  const handleConfirmDeleteTemplate = async () => {
    if (!deleteTargetTemplate) return;
    const templateId = deleteTargetTemplate.id;
    try {
      store.deleteTimeTrackerTemplate(templateId);
      showSuccessToast('Template deleted', 'Template removed.', `template_${templateId}`);
    } catch (err: any) {
      showErrorToast("Couldn't delete template", toUserMessage(err, 'Try again.'));
    } finally {
      setDeleteTargetTemplate(null);
    }
  };

  const handleToggleDay = (template: TimeTrackerTemplate, day: string) => {
    console.log(`[TRACER] handleToggleDay clicked for template: ${template.title}, day: ${day}`);
    const getDays = (t: TimeTrackerTemplate): string[] => {
      if (Array.isArray(t.activeDays) && t.activeDays.length > 0) return t.activeDays;
      if (Array.isArray(t.autoApplyDays) && t.autoApplyDays.length > 0) return t.autoApplyDays;
      return [];
    };

    const currentDays = getDays(template);
    console.log(`[TRACER] currentDays:`, currentDays);

    const isAdding = !currentDays.some((d) => d.toLowerCase() === day.toLowerCase());
    console.log(`[TRACER] isAdding:`, isAdding);

    if (isAdding) {
      const conflictingTemplate = templates.find((t) => {
        if (t.id === template.id) return false;
        const tDays = getDays(t);
        return tDays.some((d) => d.toLowerCase() === day.toLowerCase());
      });
      console.log(`[TRACER] conflictingTemplate found:`, conflictingTemplate?.title);

      if (conflictingTemplate) {
        setConflictState({
          isOpen: true,
          day,
          template,
          conflictingTitle: conflictingTemplate.title,
        });
        return;
      }
    }

    console.log(`[TRACER] Firing store.toggleTemplateAutoApplyDay...`);
    store.toggleTemplateAutoApplyDay(template.id, day);
    console.log(`[TRACER] Store function fired successfully.`);
  };

  const confirmTransfer = () => {
    if (conflictState) {
      store.toggleTemplateAutoApplyDay(conflictState.template.id, conflictState.day);
      setConflictState(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header and Action */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="section-title text-xl leading-tight flex items-center gap-2">
            <Layers className="text-success-text" size={18} />
            <span>Recurring Templates</span>
          </h2>
          <p className="text-xs text-content-muted mt-0.5">
            Construct standard ideal day architectures (e.g. Weekdays, Deep Rest Weekends) that automatically auto-apply onto your schedule.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!store.state.timeTracker?.templates?.some((t) => t.id === 'template-default-weekday') && (
            <button
              onClick={() => {
                store.restoreTimeTrackerTemplate('template-default-weekday');
                showSuccessToast('Template restored', 'Standard Productive Day blueprint has been restored.');
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-success-text bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 rounded-xl transition-colors cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>Restore Default Blueprint</span>
            </button>
          )}

          <button
            onClick={onOpenCreateTemplateModal}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-on-brand bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm transition-all shrink-0 cursor-pointer"
          >
            <Plus size={15} />
            <span>Create Template</span>
          </button>
        </div>
      </div>

      {/* Blueprint Philosophy / 8-8-8 Guide */}
      <div className="p-4 rounded-2xl border border-overlay-subtle flex flex-row md:flex-col xl:flex-row gap-3 items-start">
        <Compass className="text-success-text shrink-0 mt-1" size={18} />
        <div className="flex-1 w-full">
          <h3 className="section-title">
            <button
              type="button"
              aria-expanded={ruleOpen}
              aria-controls="eight-eight-eight-rule"
              onClick={() => setRuleOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-2 text-left md:pointer-events-none md:cursor-default"
            >
              The 8+8+8 rule
              <ChevronDown
                size={16}
                aria-hidden="true"
                className={`shrink-0 text-content-muted transition-transform duration-base ease-emphasized motion-reduce:transition-none md:hidden ${ruleOpen ? 'rotate-180' : ''}`}
              />
            </button>
          </h3>
          <div
            id="eight-eight-eight-rule"
            className={`grid transition-[grid-template-rows] duration-base ease-emphasized motion-reduce:transition-none md:grid-rows-[1fr] ${ruleOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
          >
            <div className="min-h-0 overflow-hidden">
              <p className="text-xs text-content-tertiary leading-relaxed mt-1.5 mb-3 max-w-3xl">
                Split your 24 hours into three equal parts. Ascend blueprints are built around this.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-0 md:divide-x md:divide-overlay-subtle">
                {/* Hard Work */}
                <div className="md:px-4 md:first:pl-0">
                  <h4 className="item-name text-xs text-content-secondary mb-1 flex items-center gap-1.5">
                    <Brain className="text-content-muted" size={13} /> 
                    8 Hours: Hard Work
                  </h4>
                  <p className="text-2xs text-content-muted leading-snug">Deep focus and your career.</p>
                </div>

                {/* Life & Balance */}
                <div className="md:px-4 md:first:pl-0">
                  <h4 className="item-name text-xs text-content-secondary mb-1.5 flex items-center gap-1.5">
                    <Heart className="text-content-muted" size={13} /> 
                    8 Hours: 3Fs, 3Hs, & 3Ss
                  </h4>
                  <div className="text-2xs text-content-muted leading-snug space-y-0.5">
                    <p><strong className="text-content-tertiary font-medium">3Fs:</strong> Family, Friends, Faith</p>
                    <p><strong className="text-content-tertiary font-medium">3Hs:</strong> Health, Hygiene, Hobby</p>
                    <p><strong className="text-content-tertiary font-medium">3Ss:</strong> Soul, Service, Smile</p>
                  </div>
                </div>

                {/* Sleep */}
                <div className="md:px-4 md:first:pl-0">
                  <h4 className="item-name text-xs text-content-secondary mb-1 flex items-center gap-1.5">
                    <Moon className="text-content-muted" size={13} /> 
                    8 Hours: Good Sleep
                  </h4>
                  <p className="text-2xs text-content-muted leading-snug">Rest for your mind and body.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Template Cards List */}
      {templates.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No blueprints yet"
          description="Build a daily routine once and reuse it. Blueprints apply automatically on the days you assign."
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={onOpenCreateTemplateModal}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-on-brand text-xs font-semibold shadow-sm transition-all cursor-pointer"
              >
                <Plus size={14} />
                <span>Create Your First Blueprint</span>
              </button>

              {!store.state.timeTracker?.templates?.some((t) => t.id === 'template-default-weekday') && (
                <button
                  onClick={() => {
                    store.restoreTimeTrackerTemplate('template-default-weekday');
                    showSuccessToast('Template restored', 'Standard Productive Day blueprint has been restored.');
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-overlay-subtle hover:bg-overlay-default text-content-secondary border border-overlay-default text-xs font-semibold transition-all cursor-pointer"
                >
                  <RotateCcw size={14} className="text-success-text" />
                  <span>Restore Default Blueprint</span>
                </button>
              )}
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {templates.map((tpl) => {
            const sortedBlocks = [...(tpl.blocks || [])].sort(
              (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
            );

            let totalMinutes = 0;
            for (const b of sortedBlocks) {
              totalMinutes += calculateBlockDurationMinutes(b.startTime, b.endTime);
            }

            return (
              <div
                key={tpl.id}
                className="scroll-rise p-5 rounded-2xl border border-overlay-subtle hover:border-overlay-default transition-colors space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-3">
                  {/* Title & Actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="item-name text-base">{tpl.title}</h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-content-muted">
                        <span className="figure text-content-tertiary">
                          {sortedBlocks.length} block(s)
                        </span>
                        <span>·</span>
                        <span className="figure text-success-text">
                          {formatDurationHuman(totalMinutes)} planned
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => onOpenEditTemplateModal(tpl)}
                        className={`p-1.5 text-content-muted hover:text-content-secondary hover:bg-overlay-subtle rounded-lg transition-colors cursor-pointer ${TAP_TARGET_Y}`}
                        title="Edit Template"
                        aria-label="Edit template"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => setDeleteTargetTemplate(tpl)}
                        className={`p-1.5 text-content-muted hover:text-rose-theme hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer ${TAP_TARGET_Y}`}
                        title="Delete Template"
                        aria-label="Delete template"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  {/* Active Days Badges */}
                  <div>
                    <span className="stat-label block mb-1.5">
                      Auto-Apply Days
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {DAYS_OF_WEEK.map((day) => {
                        const tplDays =
                          Array.isArray(tpl.activeDays) && tpl.activeDays.length > 0
                            ? tpl.activeDays
                            : Array.isArray(tpl.autoApplyDays) && tpl.autoApplyDays.length > 0
                            ? tpl.autoApplyDays
                            : [];
                        const isDayActive = tplDays.some(
                          (d) => d.toLowerCase() === day.toLowerCase()
                        );
                        return (
                          <button
                            type="button"
                            key={day}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleToggleDay(tpl, day);
                            }}
                            title={`Toggle ${day} auto-apply for ${tpl.title}`}
                            className={`px-2 py-0.5 rounded-lg text-2xs font-medium transition-all cursor-pointer ${
                              isDayActive
                                ? 'bg-emerald-500/20 text-success-text border border-emerald-500/30 hover:bg-emerald-500/30'
                                : 'text-content-subtle border border-overlay-subtle hover:text-content-muted hover:border-overlay-default'
                            }`}
                          >
                            {day.slice(0, 3)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Visual Mini 24h Bar */}
                  {sortedBlocks.length > 0 && (
                    <div className="space-y-1">
                      <div className="relative w-full h-4 bg-bg-900 rounded-lg overflow-hidden border border-overlay-default flex">
                        {sortedBlocks.map((block) => {
                          const startMins = timeStringToMinutes(block.startTime);
                          const endMins = timeStringToMinutes(block.endTime);
                          const duration = Math.max(1, endMins - startMins);
                          const leftPercent = (startMins / 1440) * 100;
                          const widthPercent = (duration / 1440) * 100;
                          const act = activityMap.get(block.activityId);
                          const color = getActivityDisplayColor(act, theme);

                          return (
                            <div
                              key={block.id}
                              className="absolute h-full top-0 border-r border-overlay-subtle"
                              style={{
                                left: `${leftPercent}%`,
                                width: `${widthPercent}%`,
                                backgroundColor: color,
                              }}
                              title={`${block.customTitle || act?.name || 'Block'} (${formatTime12h(
                                block.startTime
                              )} - ${formatTime12h(block.endTime)})`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Compact Block Timeline List */}
                  <div className="divide-y divide-overlay-subtle max-h-44 overflow-y-auto pr-1">
                    {sortedBlocks.map((block) => {
                      const act = activityMap.get(block.activityId);
                      const color = getActivityDisplayColor(act, theme);
                      return (
                        <div
                          key={block.id}
                          className="flex items-center justify-between py-2 text-xs"
                        >
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: color }}
                            />
                            <span className="figure text-micro text-content-muted shrink-0">
                              {formatTime12h(block.startTime)} – {formatTime12h(block.endTime)}
                            </span>
                            <span className="item-name text-content-secondary truncate">
                              {block.customTitle || act?.name || 'Block'}
                            </span>
                            {block.secondaryActivityIds &&
                              block.secondaryActivityIds.map((secId) => {
                                const secAct = activityMap.get(secId);
                                if (!secAct) return null;
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
                          {act?.ascendModule && (
                            <span
                              className="text-2xs px-1.5 py-0.5 rounded shrink-0"
                              style={categoryTintStyle(color)}
                            >
                              {act.ascendModule}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Bottom Card Actions */}
                <div className="pt-3 border-t border-overlay-subtle flex items-center justify-between gap-2">
                  <button
                    onClick={() => handleApplyToDate(tpl.id, selectedDateKey)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-overlay-subtle hover:bg-overlay-default text-content-secondary border border-overlay-default text-xs font-semibold transition-all cursor-pointer"
                  >
                    <span>Apply to {formatDateKeyHuman(selectedDateKey)}</span>
                  </button>

                  <button
                    onClick={() => onOpenApplyTemplateModal(tpl.id)}
                    className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-success-text border border-emerald-500/30 text-xs font-medium transition-colors cursor-pointer"
                    title="Apply to another date"
                  >
                    <Calendar size={13} />
                    <span>Apply to Date</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Template Modal */}
      {deleteTargetTemplate && (
        <ConfirmDeleteModal
          open={Boolean(deleteTargetTemplate)}
          onClose={() => setDeleteTargetTemplate(null)}
          onConfirm={handleConfirmDeleteTemplate}
          title="Delete Blueprint Template?"
          description={`Are you sure you want to permanently delete "${deleteTargetTemplate.title}"? Existing scheduled days will not be affected.`}
        />
      )}

      {/* Transfer Auto-Apply Day Modal */}
      {conflictState && (
        <Dialog
          open={conflictState.isOpen}
          onClose={() => setConflictState(null)}
          title="Transfer Auto-Apply Day?"
          maxWidth="max-w-md"
        >
          <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex items-start gap-3 mb-6">
            <AlertTriangle className="text-warning-text shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-warning-text-muted leading-relaxed">
              Are you sure you want to replace it? The day <strong className="text-warning-text">{conflictState.day}</strong> is currently assigned to <strong className="text-warning-text">{conflictState.conflictingTitle}</strong>.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setConflictState(null)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-content-tertiary hover:text-content-primary hover:bg-bg-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmTransfer}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-warning hover:bg-warning transition-colors cursor-pointer"
            >
              Transfer Day
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
