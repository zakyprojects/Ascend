import React, { useState, useEffect } from 'react';
import { Dialog, FieldMessage, Form, Input, useFormController } from '@/components/ui/primitives';
import {
  TimeTrackerActivity,
  TimeTrackerBlock,
  TimeTrackerTemplate,
} from '@/types';
import {
  DAYS_OF_WEEK,
  timeStringToMinutes,
  formatTime12h,
  formatDurationHuman,
  calculateBlockDurationMinutes,
  normalizeOrSplitMidnightBlock,
  getActivityDisplayColor,
  categoryTintStyle,
  templateDays,
} from '@/lib/timeTracker';
import { getLocalThemePreference } from '@/lib/store';
import { ActivityIcon } from './ActivityIcon';
import { TimeBlockModal, type BlockDraft } from './TimeBlockModal';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { Plus, Trash2, Edit2, Check } from 'lucide-react';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { toUserMessage } from '@/lib/userMessage';

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
  const [title, setTitle] = useState<string>('');
  const [activeDays, setActiveDays] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<TimeTrackerBlock[]>([]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const formIssues = useFormController();
  const form = useUnsavedChanges(open && (editingTemplate?.id ?? 'new'), [title, activeDays, blocks]);

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
      setActiveDays(templateDays(editingTemplate));
      setBlocks(editingTemplate.blocks || []);
    } else {
      setTitle('');
      setActiveDays([]);
      setBlocks([]);
    }
    setShowBlockModal(false);
    setTargetBlockForModal(null);
    formIssues.clear();
    setConflictState(null);
    // Prefill once per open (and per edited template): re-running when `activities` changes
    // would wipe the user's edits whenever a sync or realtime update lands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingTemplate?.id]);

  const toggleDay = (day: string) => {
    const isAdding = !activeDays.some((d) => d.toLowerCase() === day.toLowerCase());

    if (isAdding) {
      const conflictingTemplate = (templates || []).find((t) => {
        if (editingTemplate && t.id === editingTemplate.id) return false;
        return templateDays(t).some((d) => d.toLowerCase() === day.toLowerCase());
      });

      if (conflictingTemplate) {
        setConflictState({
          isOpen: true,
          day,
          conflictingTitle: conflictingTemplate.title,
        });
        return;
      }
    }

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

  const handleSaveBlockFromModal = (blockData: BlockDraft) => {
    // Both parts of a block past midnight stay in the template (the day starts and ends with it);
    // they are not one block on two days, so they are not linked.
    const splitBlocks = normalizeOrSplitMidnightBlock({
      ...blockData,
      secondaryActivityIds:
        blockData.secondaryActivityIds && blockData.secondaryActivityIds.length > 0
          ? blockData.secondaryActivityIds
          : undefined,
    }).map(({ splitPairId: _pair, ...rest }) => rest);

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
      return; // the name field's required rule says so
    }

    if (blocks.length === 0) {
      formIssues.showError('Add at least one block.', 'tt-tpl-blocks');
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
      formIssues.showError(toUserMessage(err, "Couldn't save this template. Try again."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        dirty={form.dirty}
        title={editingTemplate ? 'Edit template' : 'Create template'}
        maxWidth="max-w-xl"
        preventClose={isSaving}
        footer={
          <>
            <button type="button" onClick={() => form.confirmDiscard(onClose)} disabled={isSaving} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" form="tt-template-form" disabled={isSaving} className="btn-primary">
              {isSaving ? <AscendLoadingIndicator size="sm" /> : <Check size={16} />}
              <span>{isSaving ? 'Saving…' : editingTemplate ? 'Save changes' : 'Create template'}</span>
            </button>
          </>
        }
      >
        <Form id="tt-template-form" onSubmit={handleSubmit} controller={formIssues} className="space-y-4">

          {/* Template Title */}
          <Input
            id="tt-tpl-title"
            label="Name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekday, Focus day, Weekend"
            maxLength={60}
            autoComplete="off"
            required
          />

          <div role="group" aria-labelledby="tt-tpl-days-label">
            <p id="tt-tpl-days-label" className="block label mb-1">
              Fills these days
            </p>
            <p className="text-xs text-content-muted mb-2">
              On these weekdays, a day you haven't planned starts with this template.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = activeDays.some((d) => d.toLowerCase() === day.toLowerCase());
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => toggleDay(day)}
                    aria-pressed={isSelected}
                    className={`min-h-11 sm:min-h-8 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-primary-500/15 border-primary-500/50 text-brand-text'
                        : 'border-overlay-subtle text-content-muted hover:bg-overlay-subtle'
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Blocks */}
          <div className="pt-2" data-field="tt-tpl-blocks">
            <div className="flex items-center justify-between mb-2">
              <p className="label">
                Blocks ({blocks.length})
              </p>
              <button
                type="button"
                onClick={handleOpenAddBlock}
                className="btn-ghost text-xs px-2.5 py-1.5 text-brand-text"
              >
                <Plus size={14} />
                <span>Add block</span>
              </button>
            </div>

            {/* Block List */}
            {blocks.length === 0 ? (
              <>
              <div
                id="tt-tpl-blocks"
                tabIndex={-1}
                className="p-5 border border-dashed border-overlay-default rounded-xl text-center text-content-muted text-xs outline-none aria-[invalid=true]:border-rose-500/70"
              >
                No blocks yet. Use &ldquo;Add block&rdquo; to build the schedule.
              </div>
              <FieldMessage htmlFor="tt-tpl-blocks" />
              </>
            ) : (
              <div className="divide-y divide-overlay-subtle max-h-56 overflow-y-auto pr-1">
                {blocks.map((block) => {
                  const act = activities.find((a) => a.id === block.activityId);
                  const duration = calculateBlockDurationMinutes(block.startTime, block.endTime);
                  const theme = getLocalThemePreference() || 'dark';
                  const resolvedColor = getActivityDisplayColor(act, theme);
                  return (
                    <div
                      key={block.id}
                      className="flex items-center justify-between py-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: `${resolvedColor}25`,
                            color: resolvedColor,
                          }}
                        >
                          <ActivityIcon iconName={act?.icon || 'Clock'} size={16} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="item-name text-xs text-content-secondary truncate">
                              {block.customTitle || act?.name || 'Block'}
                            </p>
                            {block.secondaryActivityIds &&
                              block.secondaryActivityIds.map((secId) => {
                                const secAct = activities.find((a) => a.id === secId);
                                if (!secAct) return null;
                                return (
                                  <span
                                    key={secId}
                                    className="text-2xs font-medium px-1.5 py-0.5 rounded"
                                    style={categoryTintStyle(getActivityDisplayColor(secAct, theme))}
                                  >
                                    +{secAct.name}
                                  </span>
                                );
                              })}
                          </div>
                          <p className="figure text-micro text-content-muted">
                            {formatTime12h(block.startTime)} – {formatTime12h(block.endTime)} ({formatDurationHuman(duration)})
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditBlock(block)}
                          className={`p-1.5 rounded-lg text-content-muted hover:text-content-secondary hover:bg-overlay-subtle transition-colors cursor-pointer ${TAP_TARGET_Y}`}
                          title="Edit block"
                          aria-label="Edit block"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveBlock(block.id)}
                          className={`p-1.5 rounded-lg text-content-muted hover:text-rose-theme hover:bg-rose-500/10 transition-colors cursor-pointer ${TAP_TARGET_Y}`}
                          title="Remove block"
                          aria-label="Remove block"
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

        </Form>
      </Dialog>

      {/* Add / Edit Block Inside Template Modal */}
      <TimeBlockModal
        open={showBlockModal}
        onClose={() => {
          setShowBlockModal(false);
          setTargetBlockForModal(null);
        }}
        onSave={handleSaveBlockFromModal}
        activities={activities}
        editingBlock={targetBlockForModal}
        context={{ kind: 'template', blocks: blocks.filter((b) => b.id !== targetBlockForModal?.id) }}
      />

      {/* Move a weekday from another template */}
      {conflictState && (
        <Dialog
          open={conflictState.isOpen}
          onClose={() => setConflictState(null)}
          title="Move this day?"
          maxWidth="max-w-md"
          description={
            <>
              <strong className="text-content-primary">{conflictState.day}</strong> is filled by{' '}
              <strong className="text-content-primary">{conflictState.conflictingTitle}</strong>. Move it to this template instead?
            </>
          }
          footer={
            <>
              <button type="button" onClick={() => setConflictState(null)} className="btn-secondary">
                Cancel
              </button>
              <button type="button" onClick={confirmTransfer} className="btn-primary">
                Move day
              </button>
            </>
          }
        >
          {null}
        </Dialog>
      )}
    </>
  );
}
