import { useRef, useState } from 'react';
import { BookMarked, Calendar, Check, Pencil, Plus, Repeat } from 'lucide-react';
import type { Habit, HabitFrequency } from '@/types';
import { PRESET_CATEGORIES, type PresetHabit } from '@/lib/presets';
import { PRESET_HABIT_POINTS } from '@/lib/pointsConfig';
import { CUSTOM_HABIT_POINTS } from '@/lib/habitAwards';
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

const FREQUENCIES: { id: HabitFrequency; label: string; icon: typeof Calendar }[] = [
  { id: 'daily', label: 'Daily', icon: Calendar },
  { id: 'weekly', label: 'Weekly', icon: Repeat },
];

const normalise = (name: string) => name.trim().toLowerCase();

const PRESET_NAMES = PRESET_CATEGORIES.flatMap((category) => category.habits.map((preset) => preset.name));

interface AddHabitDialogProps {
  open: boolean;
  onClose: () => void;
  habits: Habit[];
  onAddPreset: (preset: PresetHabit) => void;
  onAddCustom: (name: string, frequency: HabitFrequency) => void;
}

/**
 * Add a habit: the preset library (stays open for several adds) or a custom habit, as two tabs
 * of one dialog. Points stay the store's: presets earn their catalogue points, daily custom ones
 * CUSTOM_HABIT_POINTS.
 */
export function AddHabitDialog({ open, onClose, habits, onAddPreset, onAddCustom }: AddHabitDialogProps) {
  const [tab, setTab] = useState<AddTab>('library');
  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<HabitFrequency>('daily');
  const radioRefs = useRef<Map<HabitFrequency, HTMLButtonElement>>(new Map());

  // Every open starts clean, on the library.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTab('library');
      setName('');
      setFrequency('daily');
    }
  }

  const form = useUnsavedChanges(open, [name, frequency]);
  const close = () => form.confirmDiscard(onClose);

  // The store dedupes presets by trimmed, lower-case name; the library shows the same rule.
  const addedPresets = new Set(habits.filter((h) => h.isPreset).map((h) => normalise(h.name)));

  const submitCustom = () => {
    if (!name.trim()) return;
    onAddCustom(name.trim(), frequency);
    onClose();
  };

  const onRadioKey = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next: HabitFrequency = frequency === 'daily' ? 'weekly' : 'daily';
    setFrequency(next);
    radioRefs.current.get(next)?.focus();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      title="Add habit"
      maxWidth="max-w-lg"
      footer={
        tab === 'custom' ? (
          <>
            <button type="button" onClick={close} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" form="habit-custom-form" className="btn-primary">
              Create habit
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
        <Tabs idBase="add-habit" ariaLabel="Add from" items={TABS} value={tab} onChange={(id) => setTab(id as AddTab)} />

        <StaticTabPanel idBase="add-habit" value={tab}>
          {tab === 'library' ? (
            <div className="space-y-5">
              <p className="text-xs text-content-muted">
                Preset habits earn the points shown, daily custom habits{' '}
                <span className="figure">{ptsText(CUSTOM_HABIT_POINTS, true)}</span>, up to{' '}
                <span className="figure">{ptsText(PRESET_HABIT_POINTS.dailyCap)}</span> a day for all of them together. The ones
                you tick first count first.
              </p>
              {PRESET_CATEGORIES.map((category) => (
                <section key={category.name} aria-labelledby={`preset-cat-${category.name}`}>
                  <h3 id={`preset-cat-${category.name}`} className="mb-2 text-sm font-medium text-content-secondary">
                    {category.name}
                  </h3>
                  <ul className="divide-y divide-overlay-subtle rounded-xl border border-overlay-subtle">
                    {category.habits.map((preset) => {
                      const added = addedPresets.has(normalise(preset.name));
                      return (
                        <li key={preset.name} className="flex items-center gap-3 px-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="text-sm text-content-primary">{preset.name}</div>
                            <div className="text-xs text-content-muted">
                              {preset.frequency === 'daily' ? 'Daily' : 'Weekly'} ·{' '}
                              <span className="figure text-brand-text">{ptsText(preset.points, true)}</span>
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
                </section>
              ))}
            </div>
          ) : (
            <Form
              id="habit-custom-form"
              onSubmit={submitCustom}
              validate={() =>
                nameTaken(name, habits)
                  ? { message: 'You already have a habit with this name.', field: 'habit-name-input' }
                  : PRESET_NAMES.some((presetName) => sameName(presetName, name))
                    ? { message: 'That habit is in the Library. Add it from there to earn its points.', field: 'habit-name-input' }
                    : null
              }
              className="space-y-4"
            >
              <Input
                id="habit-name-input"
                label="Habit name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Call my mom"
                maxLength={80}
                autoComplete="off"
                enterKeyHint="done"
                required
              />
              <div>
                <p id="habit-frequency-label" className="label mb-1.5 block">
                  Frequency
                </p>
                <div role="radiogroup" aria-labelledby="habit-frequency-label" className="grid grid-cols-2 gap-2">
                  {FREQUENCIES.map(({ id, label, icon: Icon }) => {
                    const checked = frequency === id;
                    return (
                      <button
                        key={id}
                        ref={(el) => {
                          if (el) radioRefs.current.set(id, el);
                          else radioRefs.current.delete(id);
                        }}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        tabIndex={checked ? 0 : -1}
                        onClick={() => setFrequency(id)}
                        onKeyDown={onRadioKey}
                        className={cx(
                          'flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium',
                          checked
                            ? 'border-overlay-strong bg-overlay-default text-content-primary'
                            : 'border-overlay-subtle text-content-tertiary hover:bg-overlay-subtle hover:text-content-primary',
                          FOCUS_RING,
                          TRANSITION
                        )}
                      >
                        <Icon size={16} aria-hidden="true" /> {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-content-muted">
                {frequency === 'daily' ? (
                  <>
                    A daily custom habit earns <span className="figure">{ptsText(CUSTOM_HABIT_POINTS, true)}</span> a day, inside
                    the same <span className="figure">{ptsText(PRESET_HABIT_POINTS.dailyCap)}</span> daily cap.
                  </>
                ) : (
                  'A weekly custom habit tracks its streak only and earns no points.'
                )}
              </p>
            </Form>
          )}
        </StaticTabPanel>
      </div>
    </Dialog>
  );
}
