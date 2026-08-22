import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import {
  TimeTrackerActivity,
  TimeTrackerBlock,
  TimeTrackerTemplate,
} from '@/types';
import {
  DAYS_OF_WEEK,
  timeStringToMinutes,
  minutesToTimeString,
  formatTime12h,
  formatDurationHuman,
  calculateBlockDurationMinutes,
  checkTimeCollision,
  normalizeOrSplitMidnightBlock,
} from '@/lib/timeTracker';
import { ActivityIcon } from './ActivityIcon';
import { TimeBlockModal } from './TimeBlockModal';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { Plus, Trash2, Edit2, Clock, Calendar, AlertTriangle, Layers, Check } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { uid } from '@/lib/dates';

interface TemplateEditorModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (templateData: {
    title: string;
    activeDays: string[];
    blocks: TimeTrackerBlock[];
  }) => Promise<void> | void;
  activities: TimeTrackerActivity[];
  templates?: TimeTrackerTemplate[];
  editingTemplate?: TimeTrackerTemplate | null;
}

export function TemplateEditorModal({
  open,
  onClose,
  onSave,
  activities,
  templates = [],
  editingTemplate,
}: TemplateEditorModalProps) {
  const { showErrorToast } = useToast();
  const [title, setTitle] = useState<string>('');
  const [activeDays, setActiveDays] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<TimeTrackerBlock[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Block Modal State (for both Add and Edit)
  const [targetBlockForModal, setTargetBlockForModal] = useState<TimeTrackerBlock | null>(null);
  const [showBlockModal, setShowBlockModal] = useState<boolean>(false);

  // Transfer Day Confirmation Modal State
  const [conflictState, setConflictState] = useState<{
    isOpen: boolean;
    day: string;
    conflictingTitle: string;
  } | null>(null);

  useEffect(() => {
    if (!open) return;

    if (editingTemplate) {
      setTitle(editingTemplate.title);
      const existingDays =
        Array.isArray(editingTemplate.activeDays) && editingTemplate.activeDays.length > 0
          ? editingTemplate.activeDays
          : Array.isArray(editingTemplate.autoApplyDays) && editingTemplate.autoApplyDays.length > 0
          ? editingTemplate.autoApplyDays
          : [];
      setActiveDays(existingDays);
      setBlocks(editingTemplate.blocks || []);
    } else {
      setTitle('');
      setActiveDays([]);
      setBlocks([]);
    }
    setShowBlockModal(false);
    setTargetBlockForModal(null);
    setValidationError(null);
    setConflictState(null);
  }, [open, editingTemplate, activities]);

  const toggleDay = (day: string) => {
    console.log(`[TRACER MODAL] toggleDay clicked for day: ${day}`);
    const isAdding = !activeDays.some((d) => d.toLowerCase() === day.toLowerCase());
    console.log(`[TRACER MODAL] isAdding:`, isAdding, `current activeDays:`, activeDays);

    if (isAdding) {
      const conflictingTemplate = (templates || []).find((t) => {
        if (editingTemplate && t.id === editingTemplate.id) return false;
        const currentDays =
          Array.isArray(t.activeDays) && t.activeDays.length > 0
            ? t.activeDays
            : Array.isArray(t.autoApplyDays) && t.autoApplyDays.length > 0
            ? t.autoApplyDays
            : [];
        return currentDays.some((d) => d.toLowerCase() === day.toLowerCase());
      });
      console.log(`[TRACER MODAL] conflictingTemplate:`, conflictingTemplate?.title);

      if (conflictingTemplate) {
        setConflictState({
          isOpen: true,
          day,
          conflictingTitle: conflictingTemplate.title,
        });
        return;
      }
    }

    console.log(`[TRACER MODAL] Updating local state setActiveDays...`);
    setActiveDays((prev) =>
      prev.some((d) => d.toLowerCase() === day.toLowerCase())
        ? prev.filter((d) => d.toLowerCase() !== day.toLowerCase())
        : [...prev, day]
    );
  };

  const confirmTransfer = () => {
    if (conflictState) {
      const day = conflictState.day;
      setActiveDays((prev) =>
        prev.some((d) => d.toLowerCase() === day.toLowerCase())
          ? prev.filter((d) => d.toLowerCase() !== day.toLowerCase())
          : [...prev, day]
      );
      setConflictState(null);
    }
  };

  const handleOpenAddBlock = () => {
    setTargetBlockForModal(null);
    setShowBlockModal(true);
  };

  const handleOpenEditBlock = (block: TimeTrackerBlock) => {
    setTargetBlockForModal(block);
    setShowBlockModal(true);
  };

  const handleSaveBlockFromModal = (blockData: {
    activityId: string;
    secondaryActivityIds?: string[];
    startTime: string;
    endTime: string;
    customTitle?: string;
    notes?: string;
  }) => {
    const splitBlocks = normalizeOrSplitMidnightBlock({
      ...blockData,
      secondaryActivityIds:
        blockData.secondaryActivityIds && blockData.secondaryActivityIds.length > 0
          ? blockData.secondaryActivityIds
          : undefined,
    });

    if (targetBlockForModal) {
      // Editing existing block in template
      setBlocks((prev) => {
        const withoutTarget = prev.filter((b) => b.id !== targetBlockForModal.id);
        const mappedSplit = splitBlocks.map((sb, idx) => (idx === 0 ? { ...sb, id: targetBlockForModal.id } : sb));
        return [...withoutTarget, ...mappedSplit].sort(
          (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
        );
      });
    } else {
      // Adding new block to template
      setBlocks((prev) =>
        [...prev, ...splitBlocks].sort(
          (a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime)
        )
      );
    }

    setShowBlockModal(false);
    setTargetBlockForModal(null);
  };

  const handleRemoveBlock = (blockId: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setValidationError('Please enter a template title.');
      showErrorToast('Title Required', 'Please enter a template title.');
      return;
    }

    if (blocks.length === 0) {
      setValidationError('A template must have at least 1 time block.');
      showErrorToast('Blocks Required', 'A template must have at least 1 time block.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        title: title.trim(),
        activeDays,
        blocks,
      });
      onClose();
    } catch (err: any) {
      setValidationError(err?.message || 'Failed to save template.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={editingTemplate ? 'Edit Template' : 'Create Template'}
        maxWidth="max-w-xl"
        preventClose={isSaving}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Validation Error Banner */}
          {validationError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2 text-rose-300 text-xs">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Template Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Template Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Standard Weekday Template, Focus Day, Weekend Recovery..."
              className="w-full bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          {/* Active Days of Week (Auto-Apply Assignment) */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
              Auto-Apply Days
            </label>
            <p className="text-[11px] text-slate-400 mb-2">
              On the selected days, opening the schedule for an empty day will automatically apply this template.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = activeDays.some((d) => d.toLowerCase() === day.toLowerCase());
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600/20 border-emerald-500/70 text-emerald-300 shadow-sm'
                        : 'bg-white/[0.02] border-white/5 text-slate-400 hover:bg-white/[0.05]'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Blueprint Blocks Section */}
          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Template Blocks ({blocks.length})
              </label>
              <button
                type="button"
                onClick={handleOpenAddBlock}
                className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                <Plus size={13} />
                <span>Add Block</span>
              </button>
            </div>

            {/* Block List */}
            {blocks.length === 0 ? (
              <div className="p-5 border border-dashed border-white/10 rounded-xl text-center text-slate-500 text-xs">
                No blocks in this template yet. Click &ldquo;Add Block&rdquo; to build the template schedule.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {blocks.map((block) => {
                  const act = activities.find((a) => a.id === block.activityId);
                  const duration = calculateBlockDurationMinutes(block.startTime, block.endTime);
                  return (
                    <div
                      key={block.id}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: `${act?.color || '#10b981'}25`,
                            color: act?.color || '#10b981',
                          }}
                        >
                          <ActivityIcon iconName={act?.icon || 'Clock'} size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-medium text-slate-200 truncate">
                              {block.customTitle || act?.name || 'Block'}
                            </p>
                            {act?.ascendModule && (
                              <span className="text-[10px] text-emerald-400 font-mono">
                                [{act.ascendModule}]
                              </span>
                            )}
                            {block.secondaryActivityIds &&
                              block.secondaryActivityIds.map((secId) => {
                                const secAct = activities.find((a) => a.id === secId);
                                if (!secAct) return null;
                                return (
                                  <span
                                    key={secId}
                                    className="text-[10px] text-emerald-300 font-mono bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded"
                                  >
                                    +{secAct.name}
                                  </span>
                                );
                              })}
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {formatTime12h(block.startTime)} – {formatTime12h(block.endTime)} ({formatDurationHuman(duration)})
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditBlock(block)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
                          title="Edit block"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveBlock(block.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          title="Remove block"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
            >
              {isSaving ? (
                <>
                  <AscendLoadingIndicator size="sm" />
                  <span>Saving Template...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>{editingTemplate ? 'Save Changes' : 'Create Template'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add / Edit Block Inside Template Modal */}
      {showBlockModal && (
        <TimeBlockModal
          open={showBlockModal}
          onClose={() => {
            setShowBlockModal(false);
            setTargetBlockForModal(null);
          }}
          onSave={handleSaveBlockFromModal}
          activities={activities}
          editingBlock={targetBlockForModal}
          existingBlocks={blocks.filter((b) => b.id !== targetBlockForModal?.id)}
        />
      )}

      {/* Transfer Auto-Apply Day Modal */}
      {conflictState && (
        <Modal
          open={conflictState.isOpen}
          onClose={() => setConflictState(null)}
          title="Transfer Auto-Apply Day?"
          maxWidth="max-w-md"
        >
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3 mb-6">
            <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
            <p className="text-sm text-amber-200/90 leading-relaxed">
              Are you sure you want to replace it? The day <strong className="text-amber-100">{conflictState.day}</strong> is currently assigned to <strong className="text-amber-100">{conflictState.conflictingTitle}</strong>.
            </p>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setConflictState(null)}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmTransfer}
              className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-amber-600 hover:bg-amber-500 transition-colors cursor-pointer"
            >
              Transfer Day
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
