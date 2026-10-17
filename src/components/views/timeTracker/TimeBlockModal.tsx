import React, { useState, useEffect } from 'react';
import { Dialog, FieldGroup, Form, Input, Textarea, useFormController } from '@/components/ui/primitives';
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
  getActivityDisplayColor,
} from '@/lib/timeTracker';
import { getLocalThemePreference } from '@/lib/store';
import { ActivityIcon } from './ActivityIcon';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { Clock, AlertTriangle, Check } from 'lucide-react';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';

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
  const [activityId, setActivityId] = useState<string>('');
  const [secondaryActivityIds, setSecondaryActivityIds] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<string>('09:00');
  const [endTime, setEndTime] = useState<string>('10:00');
  const [customTitle, setCustomTitle] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const formIssues = useFormController();
  const form = useUnsavedChanges(open && (editingBlock?.id ?? 'new'), [
    activityId,
    secondaryActivityIds,
    startTime,
    endTime,
    customTitle,
    notes,
  ]);

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
    formIssues.clear();
    // Prefill once per open (and per edited block). Re-running on `existingBlocks`/`activities`
    // changes would wipe what the user is typing whenever a sync or realtime update lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingBlock?.id]);

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
      formIssues.showError('Choose an activity for this block.', 'tt-block-activity');
      return;
    }
    if (isZeroDuration) {
      formIssues.showError('End time can’t be the same as the start.', 'tt-block-end');
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
        formIssues.showError(collision.message || 'This overlaps another block.', 'tt-block-start');
        return;
      }
    } else {
      // For midnight crossing: Part 1 and Part 2 collision checks
      const part1 = { startTime, endTime: '23:59' };
      const part2 = { startTime: '00:00', endTime };
      const col1 = checkTimeCollision(part1, existingBlocks, editingBlock?.id);
      const col2 = checkTimeCollision(part2, existingBlocks, editingBlock?.id);
      if (col1.hasCollision || col2.hasCollision) {
        formIssues.showError('Part of this block overlaps another scheduled block.', 'tt-block-start');
        return;
      }
    }

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
      formIssues.showError(toUserMessage(err, "Couldn't save this block. Try again."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      title={editingBlock ? 'Edit time block' : 'Schedule time block'}
      maxWidth="max-w-lg"
      preventClose={isSaving}
      footer={
        <>
          <button type="button" onClick={() => form.confirmDiscard(onClose)} disabled={isSaving} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="tt-block-form" disabled={isSaving} className="btn-primary">
            {isSaving ? <AscendLoadingIndicator size="sm" /> : <Check size={16} />}
            <span>{isSaving ? 'Saving…' : editingBlock ? 'Save block' : 'Schedule block'}</span>
          </button>
        </>
      }
    >
      <Form id="tt-block-form" onSubmit={handleSubmit} controller={formIssues} className="space-y-4">
        <FieldGroup id="tt-block-activity" label="Activity" hint="First pick is the primary activity; more are secondary.">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
            {activities.map((act) => {
              const isPrimary = act.id === activityId;
              const isSecondary = secondaryActivityIds.includes(act.id);
              const theme = getLocalThemePreference() || 'dark';
              const resolvedColor = getActivityDisplayColor(act, theme);
              return (
                <button
                  type="button"
                  key={act.id}
                  onClick={() => handleActivityClick(act.id)}
                  aria-pressed={isPrimary || isSecondary}
                  className={`flex items-center gap-2 p-2.5 min-h-11 rounded-xl border text-left transition-all relative ${
                    isPrimary
                      ? 'bg-primary-500/10 border-primary-500/50 text-content-primary'
                      : isSecondary
                      ? 'bg-overlay-subtle border-primary-500/30 text-content-primary'
                      : 'border-overlay-subtle text-content-muted hover:bg-overlay-subtle hover:border-overlay-default hover:text-content-secondary'
                  }`}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${resolvedColor}25`, color: resolvedColor }}
                  >
                    <ActivityIcon iconName={act.icon} size={15} />
                  </div>
                  <div className="truncate min-w-0 flex-1">
                    <p className="item-name text-xs !text-current truncate">{act.name}</p>
                    {(isPrimary || isSecondary || act.ascendModule) && (
                      <p className={`text-2xs truncate mt-0.5 ${isPrimary || isSecondary ? 'text-brand-text font-medium' : 'text-content-muted'}`}>
                        {isPrimary ? 'Primary' : isSecondary ? 'Secondary' : act.ascendModule}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </FieldGroup>

        <div className="grid grid-cols-2 gap-3">
          <Input
            id="tt-block-start"
            label="Start"
            type="time"
            step={60}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            hint={formatTime12h(startTime)}
            required
          />
          <Input
            id="tt-block-end"
            label="End"
            type="time"
            step={60}
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            hint={formatTime12h(endTime)}
            required
          />
        </div>

        <div className="flex items-center justify-between gap-3 py-2.5 border-y border-overlay-subtle text-xs">
          <span className="flex items-center gap-2 text-content-muted">
            <Clock size={14} />
            Duration
          </span>
          <span className="figure text-content-primary">
            {formatDurationHuman(calculatedDuration)} ({calculatedDuration} min)
          </span>
        </div>

        {isMidnightCrossing && (
          <div className="p-3 bg-warning/10 border border-warning/25 rounded-xl flex items-start gap-2.5 text-xs">
            <AlertTriangle size={16} className="text-warning-text shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-medium text-warning-text">Crosses midnight</p>
              <p className="text-content-tertiary leading-relaxed">
                It will be saved as two blocks: <span className="figure">{startTime}–23:59</span> today and{' '}
                <span className="figure">00:00–{endTime}</span> tomorrow.
              </p>
            </div>
          </div>
        )}

        <Input
          id="tt-block-title"
          label="Label"
          optional
          value={customTitle}
          onChange={(e) => setCustomTitle(e.target.value)}
          placeholder={`e.g. ${selectedActivity?.name || 'Deep Work Session'}`}
          maxLength={80}
          autoComplete="off"
        />

        <Textarea
          id="tt-block-notes"
          label="Notes"
          optional
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes, location..."
          rows={2}
          className="min-h-0 resize-none"
          maxLength={500}
        />
      </Form>
    </Dialog>
  );
}
