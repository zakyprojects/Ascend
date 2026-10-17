import React, { useState, useEffect } from 'react';
import { Dialog, Form, Input, Select } from '@/components/ui/primitives';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { TimeTrackerActivity } from '@/types';
import { ActivityIcon } from './ActivityIcon';
import {
  getActivityThemeColor,
  resolveActivityColor,
  AVAILABLE_ACTIVITY_ICONS,
  AVAILABLE_ACTIVITY_COLORS,
} from '@/lib/timeTracker';
import { getLocalThemePreference } from '@/lib/store';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { Shapes, AlertTriangle, Check } from 'lucide-react';
import { toUserMessage } from '@/lib/userMessage';

interface ActivityModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (activityData: {
    name: string;
    color: string;
    icon: string;
    ascendModule?: string;
  }) => Promise<void> | void;
  editingActivity?: TimeTrackerActivity | null;
}

const MODULE_OPTIONS = [
  { label: 'None (General Activity)', value: '' },
  { label: 'Deep Focus (Prefrontal Cortex)', value: 'Deep Focus' },
  { label: 'Exercise & Training', value: 'Exercise' },
  { label: 'Reading & Knowledge', value: 'Reading' },
  { label: 'Habits & Routines', value: 'Habits' },
  { label: 'Skill Mastery', value: 'Skills' },
  { label: 'Addiction Recovery / Dopamine Reset', value: 'Recovery' },
];

export function ActivityModal({
  open,
  onClose,
  onSave,
  editingActivity,
}: ActivityModalProps) {
  const [name, setName] = useState<string>('');
  const [color, setColor] = useState<string>('');
  const [icon, setIcon] = useState<string>('');
  const [ascendModule, setAscendModule] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const theme = getLocalThemePreference() || 'dark';
  const resolvedPreviewColor = color ? getActivityThemeColor(color, theme) : '';
  const form = useUnsavedChanges(open ? (editingActivity?.id ?? 'new') : null, [name, color, icon, ascendModule]);

  useEffect(() => {
    if (!open) return;

    if (editingActivity) {
      setName(editingActivity.name);
      setColor(resolveActivityColor(editingActivity) ?? editingActivity.color);
      setIcon(editingActivity.icon);
      setAscendModule(editingActivity.ascendModule || '');
    } else {
      setName('');
      setColor('');
      setIcon('');
      setAscendModule('');
    }
    setError(null);
  }, [open, editingActivity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Activity name is required.');
      return;
    }
    if (!color) {
      setError('Pick a colour for this category.');
      return;
    }
    if (!icon) {
      setError('Pick an icon for this category.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        color,
        icon,
        ascendModule: ascendModule || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(toUserMessage(err, "Couldn't save this activity. Try again."));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      title={editingActivity ? 'Edit activity' : 'New activity'}
      maxWidth="max-w-md"
      preventClose={isSaving}
      footer={
        <>
          <button type="button" onClick={() => form.confirmDiscard(onClose)} disabled={isSaving} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="tt-activity-form" disabled={isSaving} className="btn-primary">
            {isSaving ? <AscendLoadingIndicator size="sm" /> : <Check size={16} />}
            <span>{isSaving ? 'Saving…' : editingActivity ? 'Save activity' : 'Create activity'}</span>
          </button>
        </>
      }
    >
      <Form id="tt-activity-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div role="alert" className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2 text-rose-theme text-xs">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Live preview */}
        <div className="flex items-center gap-3 p-3 rounded-xl border border-overlay-default">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center transition-colors"
            style={{
              backgroundColor: resolvedPreviewColor ? `${resolvedPreviewColor}25` : 'var(--bg-overlay-subtle)',
              color: resolvedPreviewColor || 'var(--color-content-muted)',
              border: resolvedPreviewColor ? `1px solid ${resolvedPreviewColor}40` : '1px solid var(--border-overlay-default)',
            }}
          >
            {icon ? (
              <ActivityIcon iconName={icon} size={24} />
            ) : (
              <Shapes size={22} className="text-content-disabled" />
            )}
          </div>
          <div className="min-w-0">
            <p className="item-name text-sm truncate">
              {name.trim() || 'Activity name'}
            </p>
            <p className="text-xs text-content-muted">
              {ascendModule ? `Linked to ${ascendModule}` : 'Standard activity'}
            </p>
          </div>
        </div>

        <Input
          id="tt-act-name"
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Client Consulting, Meditation, Piano"
          maxLength={60}
          autoComplete="off"
          required
        />

        <div role="group" aria-labelledby="tt-act-colour-label">
          <p id="tt-act-colour-label" className="block label mb-2">Colour</p>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_ACTIVITY_COLORS.map((col) => {
              const isSelected = color === col.value;
              const displaySwatchColor = getActivityThemeColor(col.value, theme);
              return (
                <button
                  type="button"
                  key={col.value}
                  onClick={() => setColor(col.value)}
                  aria-pressed={isSelected}
                  className={`w-9 h-9 sm:w-7 sm:h-7 rounded-full border-2 transition-transform cursor-pointer ${
                    isSelected ? 'scale-110 border-content-primary shadow-sm' : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: displaySwatchColor }}
                  title={col.name}
                  aria-label={`Colour ${col.name}`}
                />
              );
            })}
          </div>
        </div>

        <div role="group" aria-labelledby="tt-act-icon-label">
          <p id="tt-act-icon-label" className="block label mb-2">Icon</p>
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-40 overflow-y-auto p-1 rounded-xl border border-overlay-subtle">
            {AVAILABLE_ACTIVITY_ICONS.map((ic) => {
              const isSelected = icon === ic;
              return (
                <button
                  type="button"
                  key={ic}
                  onClick={() => setIcon(ic)}
                  aria-label={`Icon ${ic}`}
                  aria-pressed={isSelected}
                  className={`min-h-11 sm:min-h-9 p-2 rounded-lg flex items-center justify-center transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-primary-500/15 text-brand-text border-primary-500/40'
                      : 'border-transparent text-content-muted hover:text-content-secondary hover:bg-overlay-subtle'
                  }`}
                >
                  <ActivityIcon iconName={ic} size={18} />
                </button>
              );
            })}
          </div>
        </div>

        <Select
          id="tt-act-module"
          label="Link to an Ascend module"
          optional
          hint="A linked activity can open that section in one click."
          value={ascendModule}
          onChange={(e) => setAscendModule(e.target.value)}
        >
          {MODULE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </Form>
    </Dialog>
  );
}
