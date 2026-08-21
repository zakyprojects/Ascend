import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { TimeTrackerTemplate } from '@/types';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { Layers, Sparkles, RefreshCw, Plus, Calendar } from 'lucide-react';
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
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apply Blueprint Template"
      maxWidth="max-w-md"
      preventClose={isApplying}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          {/* Target Date Picker */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Calendar size={13} className="text-emerald-400" />
              <span>Target Schedule Date</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900/90 border border-white/10 rounded-xl text-slate-100 text-xs focus:outline-none focus:border-emerald-500 transition-colors"
              required
            />
          </div>

          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Select Template
          </label>
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
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-500/15 border-emerald-500/60 shadow-sm text-white'
                      : 'bg-white/[0.02] border-white/5 text-slate-300 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <p className="text-xs font-semibold truncate">{tpl.title}</p>
                    <p className="text-[11px] text-slate-400">
                      {tpl.blocks?.length || 0} scheduled blocks ({formatDurationHuman(totalMins)})
                    </p>
                  </div>
                  <div className="text-[10px] font-mono text-emerald-300 shrink-0 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                    {tpl.activeDays?.length || 0} active days
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Application Mode */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Application Mode
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode('merge')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                mode === 'merge'
                  ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-200 font-semibold'
                  : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-medium mb-0.5">
                <Plus size={13} />
                <span>Merge Safely</span>
              </div>
              <p className="text-[10px] text-slate-400 font-normal leading-tight">
                Add non-colliding blueprint blocks without removing existing ones.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode('replace')}
              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                mode === 'replace'
                  ? 'bg-amber-500/20 border-amber-500/70 text-amber-200 font-semibold'
                  : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/[0.05]'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs font-medium mb-0.5">
                <RefreshCw size={13} />
                <span>Replace Schedule</span>
              </div>
              <p className="text-[10px] text-slate-400 font-normal leading-tight">
                Overwrite today&rsquo;s blocks completely with this template.
              </p>
            </button>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/5">
          <button
            type="button"
            onClick={onClose}
            disabled={isApplying}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isApplying || !selectedTemplateId}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
          >
            {isApplying ? (
              <>
                <AscendLoadingIndicator size="sm" />
                <span>Applying Blueprint...</span>
              </>
            ) : (
              <>
                <Sparkles size={14} />
                <span>Apply to Schedule</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
