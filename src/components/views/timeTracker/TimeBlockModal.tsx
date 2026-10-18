import React, { useState, useEffect } from 'react';
import { Dialog, FieldGroup, Form, Input, Textarea, useFormController } from '@/components/ui/primitives';
import { TimeTrackerActivity, TimeTrackerBlock } from '@/types';
import {
  formatTime12h,
  checkTimeCollision,
  calculateBlockDurationMinutes,
  describeBlockSpan,
  formatDurationHuman,
  getActivityDisplayColor,
} from '@/lib/timeTracker';
import { addDays, formatDateKeyHuman, formatWeekdayDate } from '@/lib/dates';
import { getLocalThemePreference } from '@/lib/store';
import { ActivityIcon } from './ActivityIcon';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { Clock, MoonStar, Check } from 'lucide-react';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';

export interface BlockDraft {
  activityId: string;
  secondaryActivityIds?: string[];
  startTime: string;
  endTime: string;
  customTitle?: string;
  notes?: string;
}

/**
 * Where the block goes. A day: a block past midnight saves its second part on the next day, so
 * that part is checked against the next day's blocks. A template: both parts stay in the template.
 */
export type BlockContext =
  | { kind: 'day'; dateKey: string; dayBlocks: TimeTrackerBlock[]; nextDayBlocks: TimeTrackerBlock[] }
  | { kind: 'template'; blocks: TimeTrackerBlock[] };

interface TimeBlockModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (draft: BlockDraft) => Promise<void> | void;
  activities: TimeTrackerActivity[];
  context: BlockContext;
  editingBlock?: TimeTrackerBlock | null;
  defaultStartTime?: string;
  defaultEndTime?: string;
}

/** A time input cannot show 24:00; midnight as an end is entered and shown as 00:00. */
const forInput = (time: string) => (time === '24:00' ? '00:00' : time);

export function TimeBlockModal({
  open,
  onClose,
  onSave,
  activities,
  context,
  editingBlock,
  defaultStartTime = '09:00',
  defaultEndTime = '10:00',
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
      setEndTime(forInput(editingBlock.endTime));
      setCustomTitle(editingBlock.customTitle || '');
      setNotes(editingBlock.notes || '');
    } else {
      setActivityId('');
      setSecondaryActivityIds([]);
      setStartTime(defaultStartTime);
      setEndTime(forInput(defaultEndTime));
      setCustomTitle('');
      setNotes('');
    }
    formIssues.clear();
    // Prefill once per open (and per edited block). Re-running on block lists or activities would
    // wipe what the user is typing whenever a sync or realtime update lands.
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
    } else if (!activityId) {
      setActivityId(actId);
    } else {
      setSecondaryActivityIds((prev) => [...prev, actId]);
    }
  };

  const span = describeBlockSpan(startTime, endTime);
  const duration = calculateBlockDurationMinutes(startTime, endTime);
  const selectedActivity = activities.find((a) => a.id === activityId);
  const theme = getLocalThemePreference() || 'dark';
  const nextDayLabel = context.kind === 'day' ? formatWeekdayDate(addDays(context.dateKey, 1)) : '';
  const dayLabel = context.kind === 'day' ? formatWeekdayDate(context.dateKey) : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityId) {
      formIssues.showError('Choose a category.', 'tt-block-activity');
      return;
    }
    if (!span.valid) {
      formIssues.showError('End time can’t be the same as the start.', 'tt-block-end');
      return;
    }

    const ignoreId = editingBlock?.id;
    const firstBlocks = context.kind === 'day' ? context.dayBlocks : context.blocks;
    const first = checkTimeCollision({ ...span.first, id: ignoreId }, firstBlocks, ignoreId);
    if (first.hasCollision) {
      formIssues.showError(first.message || 'This overlaps another block.', 'tt-block-start');
      return;
    }
    if (span.second) {
      // A day's second part goes to the next day; the other half of an edited block is moved, not doubled.
      const secondBlocks = context.kind === 'day' ? context.nextDayBlocks : context.blocks;
      const partnerId = editingBlock?.splitPairId
        ? secondBlocks.find((b) => b.splitPairId === editingBlock.splitPairId && b.id !== editingBlock.id)?.id
        : undefined;
      const second = checkTimeCollision(span.second, secondBlocks.filter((b) => b.id !== partnerId), ignoreId);
      if (second.hasCollision) {
        const where = context.kind === 'day' ? ` on ${nextDayLabel}` : '';
        formIssues.showError(`The part after midnight overlaps ${formatTime12h(second.collidingBlock?.startTime || '')}–${formatTime12h(second.collidingBlock?.endTime || '')}${where}.`, 'tt-block-end');
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
    } catch (err: unknown) {
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
      title={editingBlock ? 'Edit block' : 'Add block'}
      description={context.kind === 'day' ? formatDateKeyHuman(context.dateKey) : undefined}
      maxWidth="max-w-lg"
      preventClose={isSaving}
      footer={
        <>
          <button type="button" onClick={() => form.confirmDiscard(onClose)} disabled={isSaving} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="tt-block-form" disabled={isSaving} className="btn-primary">
            {isSaving ? <AscendLoadingIndicator size="sm" /> : <Check size={16} />}
            <span>{isSaving ? 'Saving…' : editingBlock ? 'Save block' : 'Add block'}</span>
          </button>
        </>
      }
    >
      <Form id="tt-block-form" onSubmit={handleSubmit} controller={formIssues} className="space-y-4">
        <FieldGroup id="tt-block-activity" label="Category" hint="The first one you pick is the main category.">
          <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
            {activities.map((act) => {
              const isPrimary = act.id === activityId;
              const isSecondary = secondaryActivityIds.includes(act.id);
              const color = getActivityDisplayColor(act, theme);
              return (
                <button
                  type="button"
                  key={act.id}
                  onClick={() => handleActivityClick(act.id)}
                  aria-pressed={isPrimary || isSecondary}
                  className={`relative flex min-h-11 items-center gap-2 rounded-xl border p-2.5 text-left transition-colors ${
                    isPrimary
                      ? 'border-primary-500/50 bg-primary-500/10 text-content-primary'
                      : isSecondary
                        ? 'border-primary-500/30 bg-overlay-subtle text-content-primary'
                        : 'border-overlay-subtle text-content-muted hover:border-overlay-default hover:bg-overlay-subtle hover:text-content-secondary'
                  }`}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${color}25`, color }}
                  >
                    <ActivityIcon iconName={act.icon} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="item-name block truncate text-xs !text-current">{act.name}</span>
                    {(isPrimary || isSecondary) && (
                      <span className="mt-0.5 block truncate text-2xs font-medium text-brand-text">
                        {isPrimary ? 'Main' : 'Also'}
                      </span>
                    )}
                  </span>
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

        <div className="flex items-center justify-between gap-3 border-y border-overlay-subtle py-2.5 text-xs">
          <span className="flex items-center gap-2 text-content-muted">
            <Clock size={14} aria-hidden="true" />
            Length
          </span>
          <span className="figure text-content-primary">{span.valid ? formatDurationHuman(duration) : '–'}</span>
        </div>

        {span.second && (
          <div className="flex items-start gap-2.5 rounded-xl border border-overlay-default bg-overlay-subtle p-3 text-xs">
            <MoonStar size={16} className="mt-0.5 shrink-0 text-brand-text" aria-hidden="true" />
            <p className="leading-relaxed text-content-tertiary">
              {context.kind === 'day' ? (
                <>
                  Runs past midnight, so it’s saved in two linked parts:{' '}
                  <span className="figure text-content-secondary">{formatTime12h(span.first.startTime)}–12:00 AM</span> on {dayLabel} and{' '}
                  <span className="figure text-content-secondary">12:00 AM–{formatTime12h(span.second.endTime)}</span> on {nextDayLabel}.
                </>
              ) : (
                <>
                  Runs past midnight, so this template keeps it as two parts: the day starts with{' '}
                  <span className="figure text-content-secondary">12:00 AM–{formatTime12h(span.second.endTime)}</span> and ends with{' '}
                  <span className="figure text-content-secondary">{formatTime12h(span.first.startTime)}–12:00 AM</span>.
                </>
              )}
            </p>
          </div>
        )}

        <Input
          id="tt-block-title"
          label="Label"
          optional
          value={customTitle}
          onChange={(e) => setCustomTitle(e.target.value)}
          placeholder={`e.g. ${selectedActivity?.name || 'Deep work'}`}
          maxLength={80}
          autoComplete="off"
        />

        <Textarea
          id="tt-block-notes"
          label="Notes"
          optional
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Where, what to bring…"
          rows={2}
          className="min-h-0 resize-none"
          maxLength={500}
        />
      </Form>
    </Dialog>
  );
}
