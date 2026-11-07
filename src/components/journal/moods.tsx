import { Smile, Meh, Frown, Zap } from 'lucide-react';
import type { Mood } from '@/types';
import { cx } from '@/components/ui/primitives/shared';

export interface MoodMeta {
  value: Mood;
  label: string;
  score: number; // 1 to 4, for the average
  icon: typeof Smile;
  color: string; // Hex for inline styles
}

/** One mood scale for every page that shows a mood (Journal, Dashboard). */
export const MOODS: MoodMeta[] = [
  { value: 'sad', label: 'Sad', score: 1, icon: Frown, color: '#38bdf8' },
  { value: 'neutral', label: 'Neutral', score: 2, icon: Meh, color: '#94a3b8' },
  { value: 'happy', label: 'Happy', score: 3, icon: Smile, color: '#10b981' },
  { value: 'motivated', label: 'Motivated', score: 4, icon: Zap, color: '#f59e0b' },
];

export const MOOD_MAP: Record<Mood, MoodMeta> = MOODS.reduce((acc, m) => {
  acc[m.value] = m;
  return acc;
}, {} as Record<Mood, MoodMeta>);

/** The mood as icon + label in its colour, so it never relies on colour alone. */
export function MoodBadge({ mood }: { mood: Mood }) {
  const meta = MOOD_MAP[mood] || MOOD_MAP.neutral;
  const Icon = meta.icon;
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-lg border"
      style={{ backgroundColor: `${meta.color}15`, borderColor: `${meta.color}30`, color: meta.color }}
    >
      <Icon size={12} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

/** The four moods as toggle buttons (today's editor and the edit of a saved entry). */
export function MoodPicker({ value, onChange }: { value: Mood; onChange: (mood: Mood) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {MOODS.map((m) => {
        const Icon = m.icon;
        const selected = value === m.value;
        return (
          <button
            key={m.value}
            type="button"
            onClick={() => onChange(m.value)}
            aria-pressed={selected}
            className={cx(
              'flex items-center justify-center gap-2 min-h-11 px-2 rounded-xl border text-sm font-medium transition-colors',
              !selected && 'border-overlay-subtle text-content-muted hover:bg-overlay-subtle'
            )}
            style={selected ? { borderColor: m.color, backgroundColor: `${m.color}15`, color: m.color } : undefined}
          >
            <Icon size={18} />
            {m.label}
          </button>
        );
      })}
    </div>
  );
}
