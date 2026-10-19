import { useState } from 'react';
import { BookMarked, Check, Pencil, Plus } from 'lucide-react';
import type { BadHabit } from '@/types';
import { PRESET_BAD_HABITS, type PresetBadHabit } from '@/lib/presets';
import { BAD_HABIT_POINTS } from '@/lib/pointsConfig';
import { ptsText } from '@/lib/leagues';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { nameTaken, sameName } from '@/lib/uniqueNames';
import { Dialog, Form, Input, StaticTabPanel, Tabs } from '@/components/ui/primitives';
import { cx, FOCUS_RING, TRANSITION } from '@/components/ui/primitives/shared';

type AddTab = 'library' | 'custom';

const TABS = [
  { id: 'library', label: 'Library', icon: BookMarked },
  { id: 'custom', label: 'Custom', icon: Pencil },
];

interface AddBadHabitDialogProps {
  open: boolean;
  onClose: () => void;
  /** The active bad habits: names must be unique among them. */
  habits: BadHabit[];
  onAddPreset: (preset: PresetBadHabit) => void;
  onAddCustom: (name: string) => void;
}

/**
 * Add a bad habit, built like AddHabitDialog: the library (stays open for several adds) or a
 * custom name, as two tabs of one dialog. A library bad habit earns its points per resist, a
 * custom one BAD_HABIT_POINTS.customResist; the server decides the award.
 */
export function AddBadHabitDialog({ open, onClose, habits, onAddPreset, onAddCustom }: AddBadHabitDialogProps) {
  const [tab, setTab] = useState<AddTab>('library');
  const [name, setName] = useState('');

  // Every open starts clean, on the library.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTab('library');
      setName('');
    }
  }

  const form = useUnsavedChanges(open, [name]);
  const close = () => form.confirmDiscard(onClose);

  const submitCustom = () => {
    if (!name.trim()) return;
    onAddCustom(name.trim());
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      title="Add bad habit"
      maxWidth="max-w-lg"
      footer={
        tab === 'custom' ? (
          <>
            <button type="button" onClick={close} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" form="bad-habit-add-form" className="btn-primary">
              Add bad habit
            </button>
          </>
        ) : (
          <button type="button" onClick={close} className="btn-primary">
            Done
          </button>
        )
      }
    >
      <div className="space-y-5">
        <Tabs idBase="add-bad-habit" ariaLabel="Add from" items={TABS} value={tab} onChange={(id) => setTab(id as AddTab)} />

        <StaticTabPanel idBase="add-bad-habit" value={tab}>
          {tab === 'library' ? (
            <div className="space-y-3">
              <p className="text-xs text-content-muted">
                Each day you resist one earns its points, up to{' '}
                <span className="figure">{ptsText(BAD_HABIT_POINTS.dailyCap)}</span> a day for all of them together. The ones
                you log first count first.
              </p>
              <ul className="divide-y divide-overlay-subtle rounded-xl border border-overlay-subtle">
                {PRESET_BAD_HABITS.map((preset) => {
                  // A library name already used by an active bad habit (preset or typed) can't be added again.
                  const added = nameTaken(preset.name, habits);
                  return (
                    <li key={preset.name} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-content-primary">{preset.name}</div>
                        <div className="text-xs text-content-muted">
                          Resisted <span className="figure text-brand-text">{ptsText(preset.points, true)}</span>
                        </div>
                      </div>
                      {/* One button that turns into "Added", so keyboard focus stays put after an add. */}
                      <button
                        type="button"
                        onClick={added ? undefined : () => onAddPreset(preset)}
                        aria-disabled={added || undefined}
                        aria-label={added ? `${preset.name} added` : `Add ${preset.name}`}
                        className={cx(
                          'inline-flex min-h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-medium',
                          added
                            ? 'badge-emerald cursor-default'
                            : 'border border-overlay-default bg-bg-600 text-content-secondary hover:bg-bg-500 hover:text-content-primary',
                          FOCUS_RING,
                          TRANSITION
                        )}
                      >
                        {added ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                        {added ? 'Added' : 'Add'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <Form
              id="bad-habit-add-form"
              onSubmit={submitCustom}
              validate={() =>
                nameTaken(name, habits)
                  ? { message: 'You already have a bad habit with this name.', field: 'bad-habit-name-input' }
                  : PRESET_BAD_HABITS.some((preset) => sameName(preset.name, name))
                    ? { message: 'That bad habit is in the Library. Add it from there to earn its points.', field: 'bad-habit-name-input' }
                    : null
              }
              className="space-y-4"
            >
              <Input
                id="bad-habit-name-input"
                label="Bad habit"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Nail biting"
                maxLength={80}
                enterKeyHint="done"
                autoComplete="off"
                required
              />
              <p className="text-xs text-content-muted">
                A custom bad habit earns <span className="figure">{ptsText(BAD_HABIT_POINTS.customResist, true)}</span> each day
                you resist it.
              </p>
            </Form>
          )}
        </StaticTabPanel>
      </div>
    </Dialog>
  );
}
