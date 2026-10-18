import React, { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { TimeTrackerActivity } from '@/types';
import { AppStore } from '@/lib/store';
import { getActivityDisplayColor } from '@/lib/timeTracker';
import { ActivityIcon } from './ActivityIcon';
import { useToast } from '@/components/ui/Toast';
import { Dialog, Form, Select, useFormController } from '@/components/ui/primitives';
import { cx, TAP_TARGET } from '@/components/ui/primitives/shared';
import { toUserMessage } from '@/lib/userMessage';
import { MODULE_LABELS } from './dayMeta';

interface ActivitiesTabProps {
  store: AppStore;
  activities: TimeTrackerActivity[];
  today: string;
  onCreateCategory: () => void;
  onEditCategory: (activity: TimeTrackerActivity) => void;
}

export function ActivitiesTab({ store, activities, today, onCreateCategory, onEditCategory }: ActivitiesTabProps) {
  const theme = store.state.themePreference || 'dark';
  const [deleting, setDeleting] = useState<TimeTrackerActivity | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Categories</h2>
          <p className="text-xs text-content-muted">Link a category to a section to open it from a block.</p>
        </div>
        <button type="button" onClick={onCreateCategory} className="btn-primary self-start text-xs sm:self-auto">
          <Plus size={14} /> New category
        </button>
      </div>

      <ul className="card divide-y divide-overlay-subtle p-0">
        {activities.map((act) => {
          const color = getActivityDisplayColor(act, theme);
          return (
            <li key={act.id} className="flex items-center gap-3 px-4 py-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${color}22`, color }}
                aria-hidden="true"
              >
                <ActivityIcon iconName={act.icon} size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="item-name truncate text-sm">{act.name}</p>
                <p className="text-xs text-content-muted">
                  {act.ascendModule ? `Opens ${MODULE_LABELS[act.ascendModule] || act.ascendModule}` : 'Not linked'}
                  {act.isSystemDefault ? ' · Built-in' : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onEditCategory(act)}
                  className={cx('rounded-lg p-1.5 text-content-muted transition-colors hover:bg-overlay-subtle hover:text-content-secondary', TAP_TARGET)}
                  aria-label={`Edit ${act.name}`}
                >
                  <Pencil size={15} />
                </button>
                {!act.isSystemDefault && (
                  <button
                    type="button"
                    onClick={() => setDeleting(act)}
                    className={cx('rounded-lg p-1.5 text-content-muted transition-colors hover:bg-overlay-subtle hover:text-rose-theme', TAP_TARGET)}
                    aria-label={`Delete ${act.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <DeleteCategoryDialog
        store={store}
        activities={activities}
        today={today}
        category={deleting}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

interface DeleteCategoryDialogProps {
  store: AppStore;
  activities: TimeTrackerActivity[];
  today: string;
  category: TimeTrackerActivity | null;
  onClose: () => void;
}

/**
 * Deleting a category asks where its blocks go. Today, later days and templates move to the
 * chosen category; past days keep theirs (shown as a deleted category).
 */
function DeleteCategoryDialog({ store, activities, today, category, onClose }: DeleteCategoryDialogProps) {
  const { showSuccessToast } = useToast();
  const formIssues = useFormController();
  const [replacementId, setReplacementId] = useState('');
  const open = Boolean(category);

  useEffect(() => {
    if (!open) return;
    setReplacementId('');
    formIssues.clear();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, category?.id]);

  const usage = useMemo(() => {
    if (!category) return { blocks: 0, days: 0, templates: 0 };
    const uses = (b: { activityId: string; secondaryActivityIds?: string[] }) =>
      b.activityId === category.id || (b.secondaryActivityIds || []).includes(category.id);
    let blocks = 0;
    let days = 0;
    for (const [dateKey, dayBlocks] of Object.entries(store.state.timeTracker?.dailyLogs || {})) {
      if (dateKey < today) continue;
      const count = (dayBlocks || []).filter(uses).length;
      blocks += count;
      if (count > 0) days++;
    }
    const templates = (store.state.timeTracker?.templates || []).filter((t) => (t.blocks || []).some(uses)).length;
    return { blocks, days, templates };
  }, [category, store.state.timeTracker, today]);

  const others = activities.filter((a) => a.id !== category?.id);
  const usageText = [
    usage.blocks > 0 ? `${usage.blocks} block${usage.blocks === 1 ? '' : 's'} on ${usage.days} day${usage.days === 1 ? '' : 's'} from today on` : '',
    usage.templates > 0 ? `${usage.templates} template${usage.templates === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' and ');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category) return;
    try {
      store.deleteTimeTrackerActivity(category.id, replacementId);
      showSuccessToast('Category deleted', undefined, `activity_${category.id}`);
      onClose();
    } catch (err) {
      formIssues.showError(toUserMessage(err, "Couldn't delete this category. Try again."));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete category?"
      description={
        category
          ? `${usageText ? `${category.name} is used by ${usageText}.` : `${category.name} isn't used from today on.`} Past days keep their blocks as they were.`
          : undefined
      }
      maxWidth="max-w-md"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="tt-delete-category-form" className="btn-danger-solid">
            Delete category
          </button>
        </>
      }
    >
      <Form id="tt-delete-category-form" onSubmit={submit} controller={formIssues} className="space-y-3">
        <Select
          id="tt-delete-category-replacement"
          label="Move its blocks to"
          value={replacementId}
          onChange={(e) => setReplacementId(e.target.value)}
          required
        >
          <option value="" disabled>
            Choose a category
          </option>
          {others.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
      </Form>
    </Dialog>
  );
}
