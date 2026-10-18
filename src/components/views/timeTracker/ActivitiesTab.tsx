import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Plus, Trash2 } from 'lucide-react';
import { TimeTrackerActivity } from '@/types';
import { AppStore } from '@/lib/store';
import { getActivityDisplayColor } from '@/lib/timeTracker';
import { ActivityIcon } from './ActivityIcon';
import { useToast } from '@/components/ui/Toast';
import { Dialog, FieldGroup, Form, useFormController } from '@/components/ui/primitives';
import { cx, FOCUS_RING, TAP_TARGET } from '@/components/ui/primitives/shared';
import { toUserMessage } from '@/lib/userMessage';
import { MODULE_LABELS } from './dayMeta';
import { categoryDisplayNames } from './categoryNames';

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
  const names = useMemo(() => categoryDisplayNames(activities), [activities]);

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
                <p className="item-name truncate text-sm">{names.get(act.id) ?? act.name}</p>
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

  const names = useMemo(() => categoryDisplayNames(activities), [activities]);
  // Your own categories first, then the built-in ones (each group in its list order).
  const others = useMemo(() => {
    const rest = activities.filter((a) => a.id !== category?.id);
    return [...rest.filter((a) => !a.isSystemDefault), ...rest.filter((a) => a.isSystemDefault)];
  }, [activities, category?.id]);
  const target = others.find((a) => a.id === replacementId);
  const targetName = target ? (names.get(target.id) ?? target.name) : '';
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
      showSuccessToast('Category deleted', targetName ? `Blocks move to ${targetName}.` : undefined, `activity_${category.id}`);
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
      <Form
        id="tt-delete-category-form"
        onSubmit={submit}
        controller={formIssues}
        validate={() => (target ? null : { message: 'Choose an option.', field: 'tt-delete-category-replacement' })}
        className="space-y-3"
      >
        <FieldGroup id="tt-delete-category-replacement" label="Move its blocks to">
          <CategoryRadioList
            labelledBy="tt-delete-category-replacement-label"
            options={others}
            names={names}
            value={replacementId}
            onChange={setReplacementId}
            theme={store.state.themePreference || 'dark'}
          />
        </FieldGroup>
        <p className="text-xs text-content-secondary" aria-live="polite">
          {targetName ? (
            <>
              Blocks move to <span className="font-semibold text-content-primary break-words [overflow-wrap:anywhere]">{targetName}</span>.
            </>
          ) : (
            'Pick where its blocks go.'
          )}
        </p>
      </Form>
    </Dialog>
  );
}

/**
 * One-choice list of categories (colour, icon, Custom/Built-in) used as a radio group: arrow keys
 * move and pick, Home/End jump, Space/Enter pick; only the picked row (or the first) is in the Tab order.
 */
function CategoryRadioList({
  labelledBy,
  options,
  names,
  value,
  onChange,
  theme,
}: {
  labelledBy: string;
  options: TimeTrackerActivity[];
  names: Map<string, string>;
  value: string;
  onChange: (id: string) => void;
  theme: 'dark' | 'light';
}) {
  const refs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const selectedIndex = options.findIndex((o) => o.id === value);
  const tabStop = selectedIndex >= 0 ? selectedIndex : 0;

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (options.length === 0) return;
    const current = options.findIndex((o) => refs.current.get(o.id) === document.activeElement);
    const from = current >= 0 ? current : tabStop;
    let next = -1;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (from + 1) % options.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (from - 1 + options.length) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;
    event.preventDefault();
    const opt = options[next];
    onChange(opt.id);
    refs.current.get(opt.id)?.focus();
  };

  if (options.length === 0) return <p className="text-xs text-content-muted">No other category to move to.</p>;

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-required="true"
      onKeyDown={onKeyDown}
      className="max-h-72 overflow-y-auto rounded-xl border border-overlay-subtle divide-y divide-overlay-subtle"
    >
      {options.map((opt, i) => {
        const checked = opt.id === value;
        const color = getActivityDisplayColor(opt, theme);
        const label = names.get(opt.id) ?? opt.name;
        return (
          <button
            key={opt.id}
            ref={(el) => {
              if (el) refs.current.set(opt.id, el);
              else refs.current.delete(opt.id);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === tabStop ? 0 : -1}
            onClick={() => onChange(opt.id)}
            className={cx(
              'flex w-full min-h-11 items-center gap-3 px-3 py-2 text-left transition-colors',
              checked ? 'bg-primary-500/15' : 'hover:bg-overlay-subtle',
              FOCUS_RING
            )}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: `${color}22`, color }}
              aria-hidden="true"
            >
              <ActivityIcon iconName={opt.icon} size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={cx('block truncate text-sm', checked ? 'font-semibold text-content-primary' : 'text-content-secondary')}>{label}</span>
              <span className="block text-2xs text-content-muted">{opt.isSystemDefault ? 'Built-in' : 'Custom'}</span>
            </span>
            <span
              className={cx(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                checked ? 'border-primary-600 bg-primary-600 text-white' : 'border-overlay-strong'
              )}
              aria-hidden="true"
            >
              {checked && <Check size={12} strokeWidth={3} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
