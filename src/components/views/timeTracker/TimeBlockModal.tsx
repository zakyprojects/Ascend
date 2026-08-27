import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import {
  TimeTrackerActivity,
  TimeTrackerBlock,
} from '@/types';
import {
  timeStringToMinutes,
  minutesToTimeString,
  formatTime12h,
  checkTimeCollision,
  calculateBlockDurationMinutes,
  formatDurationHuman,
  getActivityThemeColor,
} from '@/lib/timeTracker';
import { getLocalThemePreference } from '@/lib/store';
import { ActivityIcon } from './ActivityIcon';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { Clock, AlertTriangle, Sparkles, Tag, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

interface TimeBlockModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (blockData: {
    activityId: string;
    secondaryActivityIds?: string[];
    startTime: string;
    endTime: string;
    customTitle?: string;
    notes?: string;
  }) => Promise<void> | void;
  activities: TimeTrackerActivity[];
  existingBlocks: TimeTrackerBlock[];
  editingBlock?: TimeTrackerBlock | null;
  defaultStartTime?: string;
  defaultDurationMinutes?: number;
}

export function TimeBlockModal({
  open,
  onClose,
  onSave,
  activities,
  existingBlocks,
  editingBlock,
  defaultStartTime = '09:00',
  defaultDurationMinutes = 60,
}: TimeBlockModalProps) {
  const { showErrorToast } = useToast();
  const [activityId, setActivityId] = useState<string>('');
  const [secondaryActivityIds, setSecondaryActivityIds] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('10:00');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    if (editingBlock) {
      setActivityId(editingBlock.activityId);
      setSecondaryActivityIds(editingBlock.secondaryActivityIds || []);
      setStartTime(editingBlock.startTime);
      setEndTime(editingBlock.endTime);
      setCustomTitle(editingBlock.customTitle || '');
      setNotes(editingBlock.notes || '');
    } else {
      setActivityId('');
      setSecondaryActivityIds([]);

      let computedStartTime = '00:00';
      if (existingBlocks && existingBlocks.length > 0) {
        let maxEndMins = 0;
        for (const block of existingBlocks) {
          const endM = timeStringToMinutes(block.endTime);
          if (endM > maxEndMins) {
            maxEndMins = endM;
          }
        }
        computedStartTime = minutesToTimeString(maxEndMins);
      } else {
        computedStartTime = '00:00';
      }

      const startMins = timeStringToMinutes(computedStartTime);
      const endMins = startMins + defaultDurationMinutes;

      if (startMins >= 1439) {
        setStartTime('00:00');
        setEndTime(minutesToTimeString(defaultDurationMinutes));
      } else {
        setStartTime(minutesToTimeString(startMins));
        setEndTime(minutesToTimeString(Math.min(1439, endMins)));
      }
      setCustomTitle('');
      setNotes('');
    }
    setValidationError(null);
  }, [open, editingBlock, activities, existingBlocks, defaultStartTime, defaultDurationMinutes]);

  const handleActivityClick = (actId: string) => {
    if (actId === activityId) {
      if (secondaryActivityIds.length > 0) {
        const [firstSecondary, ...restSecondary] = secondaryActivityIds;
        setActivityId(firstSecondary);
        setSecondaryActivityIds(restSecondary);
      } else {
        setActivityId('');
      }
    } else if (secondaryActivityIds.includes(actId)) {
      setSecondaryActivityIds((prev) => prev.filter((id) => id !== actId));
    } else {
      if (!activityId) {
        setActivityId(actId);
      } else {
        setSecondaryActivityIds((prev) => [...prev, actId]);
      }
    }
  };

  const startMins = timeStringToMinutes(startTime);
  const endMins = timeStringToMinutes(endTime);
  const isMidnightCrossing = startMins > endMins;
  const isZeroDuration = startMins === endMins;
  const calculatedDuration = calculateBlockDurationMinutes(startTime, endTime);

  // Selected Activity
  const selectedActivity = activities.find((a) => a.id === activityId) || activities[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityId) {
      setValidationError('Please select a primary activity category.');
      showErrorToast('Activity Required', 'Please select a primary activity category.');
      return;
    }
    if (isZeroDuration) {
      setValidationError('Start time and end time cannot be identical.');
      return;
    }

    // Local collision validation check (if not midnight crossing)
    if (!isMidnightCrossing) {
      const collision = checkTimeCollision(
        { id: editingBlock?.id, startTime, endTime },
        existingBlocks,
        editingBlock?.id
      );
      if (collision.hasCollision) {
        setValidationError(collision.message || 'Collision with an existing scheduled block.');
        return;
      }
    } else {
      // For midnight crossing: Part 1 and Part 2 collision checks
      const part1 = { startTime, endTime: '23:59' };
      const part2 = { startTime: '00:00', endTime };
      const col1 = checkTimeCollision(part1, existingBlocks, editingBlock?.id);
      const col2 = checkTimeCollision(part2, existingBlocks, editingBlock?.id);
      if (col1.hasCollision || col2.hasCollision) {
        setValidationError('One or both parts of this split block collide with an existing scheduled block.');
        return;
      }
    }

    setValidationError(null);
    setIsSaving(true);
    try {
      await onSave({
        activityId,
        secondaryActivityIds: secondaryActivityIds.length > 0 ? secondaryActivityIds : undefined,
        startTime,
        endTime,
        customTitle: customTitle.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to save time block.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingBlock ? 'Edit Time Block' : 'Schedule Time Block'}
      maxWidth="max-w-lg"
      preventClose={isSaving}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Validation Error Banner */}
        {validationError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2.5 text-rose-theme text-xs animate-shake">
            <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-theme" />
            <span className="leading-relaxed">{validationError}</span>
          </div>
        )}

        {/* Activity Category Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-content-muted uppercase tracking-wider">
              Activity Categories
            </label>
            <span className="text-[11px] text-content-muted">
              Primary + Optional Secondary
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
            {activities.map((act) => {
              const isPrimary = act.id === activityId;
              const isSecondary = secondaryActivityIds.includes(act.id);
              const theme = getLocalThemePreference() || 'dark';
              const resolvedColor = getActivityThemeColor(act.color, theme);
              return (
                <button
                  type="button"
                  key={act.id}
                  onClick={() => handleActivityClick(act.id)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all relative ${
                    isPrimary
                      ? 'bg-emerald-500/15 border-emerald-500/60 shadow-md text-white ring-1 ring-emerald-500/40'
                      : isSecondary
                      ? 'bg-overlay-default border-emerald-500/40 text-content-primary shadow-xs'
                      : 'bg-overlay-subtle border-overlay-subtle text-content-muted hover:bg-overlay-default hover:border-overlay-default hover:text-content-secondary'
                  }`}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${resolvedColor}25`, color: resolvedColor }}
                  >
                    <ActivityIcon iconName={act.icon} size={15} />
                  </div>
                  <div className="truncate min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{act.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {isPrimary ? (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-success-text bg-emerald-500/20 px-1.5 py-0.5 rounded">
                          Primary
                        </span>
                      ) : isSecondary ? (
                        <span className="text-[9px] font-medium uppercase tracking-wider text-success-text bg-overlay-default px-1.5 py-0.5 rounded">
                          Secondary
                        </span>
                      ) : act.ascendModule ? (
                        <span className="text-[10px] text-success-text font-mono block truncate">
                          {act.ascendModule}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Start and End Times */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="flex flex-col h-full space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <label className="text-xs font-medium text-content-tertiary truncate">Start Time (24h)</label>
              <span className="text-[11px] text-content-muted font-mono bg-overlay-subtle px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
                {formatTime12h(startTime)}
              </span>
            </div>
            <div className="relative mt-auto">
              <input
                type="time"
                step="60"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-bg-800/80 border border-overlay-default rounded-xl px-3 py-2 text-sm text-content-primary focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                required
              />
            </div>
          </div>

          <div className="flex flex-col h-full space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <label className="text-xs font-medium text-content-tertiary truncate">End Time (24h)</label>
              <span className="text-[11px] text-content-muted font-mono bg-overlay-subtle px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
                {formatTime12h(endTime)}
              </span>
            </div>
            <div className="relative mt-auto">
              <input
                type="time"
                step="60"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-bg-800/80 border border-overlay-default rounded-xl px-3 py-2 text-sm text-content-primary focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                required
              />
            </div>
          </div>
        </div>

        {/* Read-Only Computed Duration Indicator */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-bg-800/60 border border-overlay-subtle">
          <div className="flex items-center gap-2 text-xs text-content-muted">
            <Clock size={13} className="text-success-text" />
            <span>Calculated Duration:</span>
          </div>
          <span className="text-xs font-semibold text-success-text bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-lg">
            {formatDurationHuman(calculatedDuration)} ({calculatedDuration} mins)
          </span>
        </div>

        {/* Midnight Crossing Warning & Explanation */}
        {isMidnightCrossing && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl flex items-start gap-2.5 text-xs text-warning-text-muted">
            <AlertTriangle size={16} className="text-warning-text shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-warning-text">Midnight Boundary Split</p>
              <p className="text-content-tertiary text-[11px] leading-relaxed">
                This block crosses midnight ({formatTime12h(startTime)} to {formatTime12h(endTime)}). It will automatically be split into 2 safe daily blocks:
              </p>
              <div className="flex items-center gap-2 pt-1 font-mono text-[10px] text-warning-text">
                <span className="bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                  Part 1 (Today): {startTime} - 23:59
                </span>
                <span>+</span>
                <span className="bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                  Part 2 (Tomorrow): 00:00 - {endTime}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Custom Title (Optional) */}
        <div>
          <label className="block text-xs font-medium text-content-tertiary mb-1.5 flex items-center gap-1.5">
            <Tag size={13} className="text-content-muted" />
            Custom Label / Task (Optional)
          </label>
          <input
            type="text"
            value={customTitle}
            onChange={(e) => setCustomTitle(e.target.value)}
            placeholder={`e.g. ${selectedActivity?.name || 'Deep Work Session'}`}
            className="w-full bg-bg-800/80 border border-overlay-default rounded-xl px-3 py-2 text-sm text-content-primary placeholder:text-content-subtle focus:outline-none focus:border-emerald-500"
          />
        </div>

        {/* Notes (Optional) */}
        <div>
          <label className="block text-xs font-medium text-content-tertiary mb-1.5 flex items-center gap-1.5">
            <FileText size={13} className="text-content-muted" />
            Notes & Intentions (Optional)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Key objectives, location, or constraints..."
            rows={2}
            className="w-full bg-bg-800/80 border border-overlay-default rounded-xl px-3 py-2 text-sm text-content-primary placeholder:text-content-subtle focus:outline-none focus:border-emerald-500 resize-none"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-overlay-subtle">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-medium text-content-muted hover:text-content-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving || isZeroDuration}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-on-brand text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
          >
            {isSaving ? (
              <>
                <AscendLoadingIndicator size="sm" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>{editingBlock ? 'Update Block' : 'Schedule Block'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
