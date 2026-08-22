import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { TimeTrackerActivity } from '@/types';
import {
  ActivityIcon,
  AVAILABLE_ACTIVITY_ICONS,
  AVAILABLE_ACTIVITY_COLORS,
} from './ActivityIcon';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { Sparkles, AlertTriangle, Link as LinkIcon, Check } from 'lucide-react';

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

  useEffect(() => {
    if (!open) return;

    if (editingActivity) {
      setName(editingActivity.name);
      setColor(editingActivity.color);
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
      setError('Please select a color accent for this category.');
      return;
    }
    if (!icon) {
      setError('Please select an icon for this category.');
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
      setError(err?.message || 'Failed to save activity.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingActivity ? 'Edit Activity Category' : 'New Activity Category'}
      maxWidth="max-w-md"
      preventClose={isSaving}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-start gap-2 text-rose-300 text-xs">
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Live Preview Header */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/10">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center transition-colors shadow-inner"
            style={{
              backgroundColor: color ? `${color}25` : 'rgba(255, 255, 255, 0.05)',
              color: color || '#94a3b8',
              border: color ? `1px solid ${color}40` : '1px solid rgba(255, 255, 255, 0.1)',
            }}
          >
            {icon ? (
              <ActivityIcon iconName={icon} size={24} />
            ) : (
              <Sparkles size={22} className="text-slate-500" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-100">
              {name.trim() || 'Category Name Preview'}
            </p>
            <p className="text-xs text-slate-400">
              {ascendModule ? `Linked to ${ascendModule}` : 'Standard tracking category'}
            </p>
          </div>
        </div>

        {/* Category Name */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
            Category Name <span className="text-rose-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Client Consulting, Meditation, Piano"
            className="w-full bg-slate-900/80 border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500"
            required
          />
        </div>

        {/* Color Picker */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Color Accent <span className="text-rose-400">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {AVAILABLE_ACTIVITY_COLORS.map((col) => {
              const isSelected = color === col.value;
              return (
                <button
                  type="button"
                  key={col.value}
                  onClick={() => setColor(col.value)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform cursor-pointer ${
                    isSelected ? 'scale-110 border-white shadow-lg' : 'border-transparent hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: col.value }}
                  title={col.name}
                />
              );
            })}
          </div>
        </div>

        {/* Icon Picker */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Category Icon <span className="text-rose-400">*</span>
          </label>
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5 max-h-36 overflow-y-auto p-1 bg-slate-950/50 rounded-xl border border-white/5">
            {AVAILABLE_ACTIVITY_ICONS.map((ic) => {
              const isSelected = icon === ic;
              return (
                <button
                  type="button"
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={`p-2 rounded-lg flex items-center justify-center transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
                >
                  <ActivityIcon iconName={ic} size={18} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Ascend Module Linkage */}
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <LinkIcon size={13} className="text-emerald-400" />
            Ascend Ecosystem Module Sync (Optional)
          </label>
          <select
            value={ascendModule}
            onChange={(e) => setAscendModule(e.target.value)}
            className="w-full bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
          >
            {MODULE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-slate-900 text-slate-100">
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500 mt-1">
            Linking an activity connects completed scheduled blocks with bonus discipline points and one-click session handoffs.
          </p>
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
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>{editingActivity ? 'Save Category' : 'Create Category'}</span>
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
