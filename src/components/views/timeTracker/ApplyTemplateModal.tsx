import React, { useEffect, useState } from 'react';
import { Dialog, FieldGroup, Form, Input, useFormController } from '@/components/ui/primitives';
import { toUserMessage } from '@/lib/userMessage';
import { TimeTrackerBlock, TimeTrackerTemplate } from '@/types';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { Check, RefreshCw, Plus } from 'lucide-react';
import { formatDurationHuman, calculateBlockDurationMinutes, templateDays } from '@/lib/timeTracker';
import { formatDateKeyHuman } from '@/lib/dates';
import { cx } from '@/components/ui/primitives/shared';

interface ApplyTemplateModalProps {
  open: boolean;
  onClose: () => void;
  templates: TimeTrackerTemplate[];
  today: string;
  initialDate: string;
  preselectedTemplateId?: string;
  /** What the date holds now (saved blocks or its template preview), for Replace's warning. */
  blocksForDate: (dateKey: string) => TimeTrackerBlock[];
  onApply: (templateId: string, mode: 'merge' | 'replace', targetDate: string) => Promise<void> | void;
}

export function ApplyTemplateModal({
  open,
  onClose,
  templates,
  today,
  initialDate,
  preselectedTemplateId,
  blocksForDate,
  onApply,
}: ApplyTemplateModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(preselectedTemplateId || templates[0]?.id || '');
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  // Replace removes what the day holds: the first press asks, the second applies.
  const [confirmingReplace, setConfirmingReplace] = useState(false);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const formIssues = useFormController();

  // The dialog stays mounted for its exit animation, so each open starts from the caller's values.
  useEffect(() => {
    if (!open) return;
    setSelectedDate(initialDate);
    setSelectedTemplateId(preselectedTemplateId || templates[0]?.id || '');
    setMode('merge');
    setConfirmingReplace(false);
    formIssues.clear();
    // Prefill once per open: re-running on `templates` changes would reset the user's pick on sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => setConfirmingReplace(false), [mode, selectedDate, selectedTemplateId]);

  const existing = selectedDate ? blocksForDate(selectedDate) : [];
  const existingDone = existing.filter((b) => b.completed).length;
  const replaceNote =
    existing.length === 0
      ? 'The day is empty, so nothing is removed.'
      : `Removes the ${existing.length} block${existing.length === 1 ? '' : 's'} on this day${existingDone > 0 ? `, ${existingDone} of them done` : ''}.${selectedDate === today && existingDone > 0 ? " Today's points are worked out again." : ''}`;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId || !selectedDate) return;
    if (mode === 'replace' && existing.length > 0 && !confirmingReplace) {
      setConfirmingReplace(true);
      return;
    }
    setIsApplying(true);
    try {
      await onApply(selectedTemplateId, mode, selectedDate);
      onClose();
    } catch (err) {
      formIssues.showError(toUserMessage(err, "Couldn't apply this template. Try again."));
    } finally {
      setIsApplying(false);
    }
  };

  const choice = (active: boolean) =>
    cx(
      'w-full rounded-xl border p-3 text-left transition-colors',
      active ? 'border-primary-500/50 bg-primary-500/10 text-content-primary' : 'border-overlay-default text-content-secondary hover:bg-overlay-subtle'
    );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Apply template"
      maxWidth="max-w-md"
      preventClose={isApplying}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={isApplying} className="btn-secondary">
            Cancel
          </button>
          <button
            type="submit"
            form="tt-apply-form"
            disabled={isApplying || !selectedTemplateId}
            className={confirmingReplace ? 'btn-danger-solid' : 'btn-primary'}
          >
            {isApplying ? <AscendLoadingIndicator size="sm" /> : <Check size={16} />}
            <span>{isApplying ? 'Applying…' : confirmingReplace ? 'Replace blocks' : 'Apply'}</span>
          </button>
        </>
      }
    >
      <Form id="tt-apply-form" onSubmit={handleSubmit} controller={formIssues} className="space-y-4">
        <Input
          id="tt-apply-date"
          label="Day"
          type="date"
          min={today}
          title="Pick today or a later day."
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          hint={selectedDate ? formatDateKeyHuman(selectedDate) : undefined}
          required
        />

        <FieldGroup id="tt-apply-template" label="Template">
          <div className="max-h-52 space-y-2 overflow-y-auto pr-1">
            {templates.map((tpl) => {
              const minutes = (tpl.blocks || []).reduce((acc, b) => acc + calculateBlockDurationMinutes(b.startTime, b.endTime), 0);
              const days = templateDays(tpl);
              return (
                <button
                  type="button"
                  key={tpl.id}
                  onClick={() => setSelectedTemplateId(tpl.id)}
                  aria-pressed={tpl.id === selectedTemplateId}
                  className={choice(tpl.id === selectedTemplateId)}
                >
                  <span className="item-name block truncate text-sm !text-current">{tpl.title}</span>
                  <span className="figure block text-xs text-content-muted">
                    {tpl.blocks?.length || 0} blocks · {formatDurationHuman(minutes)}
                    {days.length > 0 ? ` · ${days.map((d) => d.slice(0, 3)).join(', ')}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </FieldGroup>

        <FieldGroup id="tt-apply-mode" label="How">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setMode('merge')} aria-pressed={mode === 'merge'} className={choice(mode === 'merge')}>
              <span className="mb-0.5 flex items-center gap-1.5 text-sm font-medium">
                <Plus size={14} aria-hidden="true" /> Add to the day
              </span>
              <span className="block text-xs leading-snug text-content-muted">Keeps what's there and adds the blocks that fit.</span>
            </button>
            <button type="button" onClick={() => setMode('replace')} aria-pressed={mode === 'replace'} className={choice(mode === 'replace')}>
              <span className="mb-0.5 flex items-center gap-1.5 text-sm font-medium">
                <RefreshCw size={14} aria-hidden="true" /> Replace
              </span>
              <span className="block text-xs leading-snug text-content-muted">Swaps the day's blocks for this template.</span>
            </button>
          </div>
        </FieldGroup>

        {mode === 'replace' && (
          <p className={cx('text-xs', confirmingReplace ? 'text-rose-theme' : 'text-content-muted')} role={confirmingReplace ? 'alert' : undefined}>
            {replaceNote}
            {confirmingReplace ? ' Press Replace blocks to go ahead.' : ''}
          </p>
        )}
      </Form>
    </Dialog>
  );
}
