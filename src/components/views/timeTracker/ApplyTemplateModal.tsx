import React, { useState } from 'react';
import { Dialog, Form, Input } from '@/components/ui/primitives';
import { TimeTrackerTemplate } from '@/types';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { Check, RefreshCw, Plus } from 'lucide-react';
import { formatDurationHuman, calculateBlockDurationMinutes } from '@/lib/timeTracker';

interface ApplyTemplateModalProps {
  open: boolean;
  onClose: () => void;
  templates: TimeTrackerTemplate[];
  initialDate?: string;
  preselectedTemplateId?: string;
  onApply: (templateId: string, mode: 'merge' | 'replace', targetDate: string) => Promise<void> | void;
}

export function ApplyTemplateModal({
  open,
  onClose,
  templates,
  initialDate,
  preselectedTemplateId,
  onApply,
}: ApplyTemplateModalProps) {
  const [selectedDate, setSelectedDate] = useState<string>(initialDate || '');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    preselectedTemplateId || templates[0]?.id || ''
  );
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [isApplying, setIsApplying] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId || !selectedDate) return;

    setIsApplying(true);
    try {
      await onApply(selectedTemplateId, mode, selectedDate);
      onClose();
    } catch {
      // The caller already showed the failure toast; the dialog stays open to retry.
    } finally {
      setIsApplying(false);
    }
  };

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
          <button type="submit" form="tt-apply-form" disabled={isApplying || !selectedTemplateId} className="btn-primary">
            {isApplying ? <AscendLoadingIndicator size="sm" /> : <Check size={16} />}
            <span>{isApplying ? 'Applying…' : 'Apply to schedule'}</span>
          </button>
        </>
      }
    >
      <Form id="tt-apply-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          id="tt-apply-date"
          label="Date"
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          required
        />

        <div role="group" aria-labelledby="tt-apply-template-label">
          <p id="tt-apply-template-label" className="block label mb-2">Template</p>
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {templates.map((tpl) => {
              const isSelected = tpl.id === selectedTemplateId;
              const totalMins = (tpl.blocks || []).reduce(
                (acc, b) => acc + calculateBlockDurationMinutes(b.startTime, b.endTime),
                0
              );
              return (
                <button
                  type="button"
                  key={tpl.id}
                  onClick={() => setSelectedTemplateId(tpl.id)}
                  aria-pressed={isSelected}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-primary-500/10 border-primary-500/50 text-content-primary'
                      : 'border-overlay-default text-content-tertiary hover:bg-overlay-subtle'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="item-name text-sm !text-current truncate">{tpl.title}</p>
                    <p className="text-xs text-content-muted">
                      {tpl.blocks?.length || 0} blocks ({formatDurationHuman(totalMins)})
                    </p>
                  </div>
                  <span className="figure text-xs text-content-muted shrink-0">
                    {tpl.activeDays?.length || 0} active days
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div role="group" aria-labelledby="tt-apply-mode-label">
          <p id="tt-apply-mode-label" className="block label mb-2">How to apply</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('merge')}
              aria-pressed={mode === 'merge'}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                mode === 'merge'
                  ? 'bg-primary-500/10 border-primary-500/50 text-brand-text'
                  : 'border-overlay-default text-content-secondary hover:bg-overlay-subtle'
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm font-medium mb-0.5">
                <Plus size={14} />
                <span>Merge</span>
              </div>
              <p className="text-xs text-content-muted leading-snug">
                Adds blocks that don&rsquo;t overlap and keeps the ones already there.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode('replace')}
              aria-pressed={mode === 'replace'}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                mode === 'replace'
                  ? 'bg-amber-500/10 border-amber-500/50 text-warning-text'
                  : 'border-overlay-default text-content-secondary hover:bg-overlay-subtle'
              }`}
            >
              <div className="flex items-center gap-1.5 text-sm font-medium mb-0.5">
                <RefreshCw size={14} />
                <span>Replace</span>
              </div>
              <p className="text-xs text-content-muted leading-snug">
                Replaces that day&rsquo;s blocks with this template.
              </p>
            </button>
          </div>
        </div>
      </Form>
    </Dialog>
  );
}
