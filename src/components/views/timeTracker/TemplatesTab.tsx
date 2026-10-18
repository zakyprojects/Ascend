import { useMemo, useState } from 'react';
import { Brain, Heart, Layers, Moon, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import { ASCEND_RECOMMENDED_DAY_BLOCKS, ASCEND_RECOMMENDED_DAY_TITLE, TimeTrackerActivity, TimeTrackerTemplate } from '@/types';
import { AppStore } from '@/lib/store';
import {
  calculateBlockDurationMinutes,
  DAYS_OF_WEEK,
  formatDurationHuman,
  formatTime12h,
  getActivityDisplayColor,
  templateDays,
  templateSignature,
  timeStringToMinutes,
} from '@/lib/timeTracker';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useToast } from '@/components/ui/Toast';
import { Dialog, Disclosure, EmptyState } from '@/components/ui/primitives';
import { cx, TAP_TARGET } from '@/components/ui/primitives/shared';

interface TemplatesTabProps {
  store: AppStore;
  templates: TimeTrackerTemplate[];
  activities: TimeTrackerActivity[];
  onCreateTemplate: () => void;
  onEditTemplate: (template: TimeTrackerTemplate) => void;
  onApplyTemplate: (templateId?: string) => void;
}

const RECOMMENDED_SIGNATURE = templateSignature(ASCEND_RECOMMENDED_DAY_BLOCKS);
const hasDay = (days: string[], day: string) => days.some((d) => d.toLowerCase() === day.toLowerCase());

export function TemplatesTab({ store, templates, activities, onCreateTemplate, onEditTemplate, onApplyTemplate }: TemplatesTabProps) {
  const { showSuccessToast } = useToast();
  const theme = store.state.themePreference || 'dark';
  const [deleting, setDeleting] = useState<TimeTrackerTemplate | null>(null);
  const [moveDay, setMoveDay] = useState<{ day: string; template: TimeTrackerTemplate; from: string } | null>(null);

  const activityMap = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities]);
  const hasRecommended = templates.some((t) => templateSignature(t.blocks || []) === RECOMMENDED_SIGNATURE);

  const addRecommended = () => {
    store.createTimeTrackerTemplate({ title: ASCEND_RECOMMENDED_DAY_TITLE, activeDays: [], blocks: ASCEND_RECOMMENDED_DAY_BLOCKS });
    showSuccessToast('Template added', `${ASCEND_RECOMMENDED_DAY_TITLE}. Pick its days to use it automatically.`);
  };

  const toggleDay = (template: TimeTrackerTemplate, day: string) => {
    if (!hasDay(templateDays(template), day)) {
      const holder = templates.find((t) => t.id !== template.id && hasDay(templateDays(t), day));
      if (holder) {
        setMoveDay({ day, template, from: holder.title });
        return;
      }
    }
    store.toggleTemplateAutoApplyDay(template.id, day);
  };

  const confirmDelete = () => {
    if (!deleting) return;
    store.deleteTimeTrackerTemplate(deleting.id);
    showSuccessToast('Template deleted', undefined, `template_${deleting.id}`);
    setDeleting(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Templates</h2>
          <p className="text-xs text-content-muted">Build a day once. It fills empty days on the weekdays you pick.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!hasRecommended && (
            <button type="button" onClick={addRecommended} className="btn-secondary text-xs">
              <Sparkles size={14} /> Add Ascend recommended day
            </button>
          )}
          <button type="button" onClick={onCreateTemplate} className="btn-primary text-xs">
            <Plus size={14} /> Create template
          </button>
        </div>
      </div>

      <Disclosure title="The 8+8+8 guide" icon={Layers} tone="neutral">
        <p className="mb-3 text-xs leading-relaxed text-content-tertiary">Split the 24 hours into three equal parts.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <h3 className="item-name mb-1 flex items-center gap-1.5 text-xs">
              <Brain size={13} className="text-content-muted" aria-hidden="true" /> 8 hours: hard work
            </h3>
            <p className="text-2xs leading-snug text-content-muted">Deep focus and your career.</p>
          </div>
          <div>
            <h3 className="item-name mb-1 flex items-center gap-1.5 text-xs">
              <Heart size={13} className="text-content-muted" aria-hidden="true" /> 8 hours: life
            </h3>
            <p className="text-2xs leading-snug text-content-muted">Family, friends, faith · health, hygiene, hobby · soul, service, smile.</p>
          </div>
          <div>
            <h3 className="item-name mb-1 flex items-center gap-1.5 text-xs">
              <Moon size={13} className="text-content-muted" aria-hidden="true" /> 8 hours: sleep
            </h3>
            <p className="text-2xs leading-snug text-content-muted">Rest for your mind and body.</p>
          </div>
        </div>
      </Disclosure>

      {templates.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="No templates yet"
          description="A template is a day you can reuse."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" onClick={onCreateTemplate} className="btn-primary text-xs">
                <Plus size={14} /> Create template
              </button>
              <button type="button" onClick={addRecommended} className="btn-secondary text-xs">
                <Sparkles size={14} /> Add Ascend recommended day
              </button>
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {templates.map((tpl) => {
            const blocks = [...(tpl.blocks || [])].sort((a, b) => timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime));
            const total = blocks.reduce((sum, b) => sum + calculateBlockDurationMinutes(b.startTime, b.endTime), 0);
            const days = templateDays(tpl);
            return (
              <section key={tpl.id} className="card scroll-rise space-y-4 p-4 sm:p-5" aria-label={tpl.title}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="item-name truncate text-base">{tpl.title}</h3>
                    <p className="figure text-xs text-content-muted">
                      {blocks.length} block{blocks.length === 1 ? '' : 's'} · {formatDurationHuman(total)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEditTemplate(tpl)}
                      className={cx('rounded-lg p-1.5 text-content-muted transition-colors hover:bg-overlay-subtle hover:text-content-secondary', TAP_TARGET)}
                      aria-label={`Edit ${tpl.title}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleting(tpl)}
                      className={cx('rounded-lg p-1.5 text-content-muted transition-colors hover:bg-overlay-subtle hover:text-rose-theme', TAP_TARGET)}
                      aria-label={`Delete ${tpl.title}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div role="group" aria-label={`Days that use ${tpl.title}`}>
                  <p className="label mb-1.5">Fills these days</p>
                  <div className="grid grid-cols-7 gap-1">
                    {DAYS_OF_WEEK.map((day) => {
                      const on = hasDay(days, day);
                      return (
                        <button
                          type="button"
                          key={day}
                          onClick={() => toggleDay(tpl, day)}
                          aria-pressed={on}
                          aria-label={day}
                          className={cx(
                            'min-h-11 rounded-lg border text-xs font-medium transition-colors',
                            on
                              ? 'border-primary-500/40 bg-primary-500/15 text-brand-text'
                              : 'border-overlay-subtle text-content-muted hover:border-overlay-default hover:text-content-secondary'
                          )}
                        >
                          {day.slice(0, 2)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {blocks.length > 0 && (
                  <div className="relative h-3 overflow-hidden rounded-full bg-overlay-subtle" aria-hidden="true">
                    {blocks.map((block) => {
                      const start = timeStringToMinutes(block.startTime);
                      const rawEnd = timeStringToMinutes(block.endTime);
                      const end = rawEnd === 0 && start > 0 ? 1440 : rawEnd;
                      return (
                        <span
                          key={block.id}
                          className="absolute inset-y-0"
                          style={{
                            left: `${(start / 1440) * 100}%`,
                            width: `${(Math.max(1, end - start) / 1440) * 100}%`,
                            backgroundColor: getActivityDisplayColor(activityMap.get(block.activityId), theme),
                          }}
                        />
                      );
                    })}
                  </div>
                )}

                <ul className="max-h-44 divide-y divide-overlay-subtle overflow-y-auto pr-1">
                  {blocks.map((block) => {
                    const act = activityMap.get(block.activityId);
                    return (
                      <li key={block.id} className="flex items-center gap-2 py-1.5 text-xs">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: getActivityDisplayColor(act, theme) }} aria-hidden="true" />
                        <span className="figure w-32 shrink-0 text-content-muted">
                          {formatTime12h(block.startTime)}–{formatTime12h(block.endTime)}
                        </span>
                        <span className="truncate text-content-secondary">{block.customTitle || act?.name || 'Deleted category'}</span>
                      </li>
                    );
                  })}
                </ul>

                <div className="border-t border-overlay-subtle pt-3">
                  <button type="button" onClick={() => onApplyTemplate(tpl.id)} className="btn-secondary w-full text-xs">
                    Apply to a day…
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <ConfirmDeleteModal
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title="Delete template?"
        itemName={deleting?.title}
        description="Days already planned stay as they are."
        confirmText="Delete template"
      />

      <Dialog
        open={Boolean(moveDay)}
        onClose={() => setMoveDay(null)}
        title="Move this day?"
        maxWidth="max-w-md"
        description={moveDay ? `${moveDay.day} is filled by ${moveDay.from}. Use ${moveDay.template.title} on ${moveDay.day} instead?` : undefined}
        footer={
          <>
            <button type="button" onClick={() => setMoveDay(null)} className="btn-secondary">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (moveDay) store.toggleTemplateAutoApplyDay(moveDay.template.id, moveDay.day);
                setMoveDay(null);
              }}
              className="btn-primary"
            >
              Move day
            </button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}
