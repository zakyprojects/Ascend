import { CircleOff, Vibrate, Volume2, type LucideIcon } from 'lucide-react';
import { cx, FOCUS_RING } from '@/components/ui/primitives';
import {
  canPlaySound,
  canVibrate,
  previewFeedback,
  setFeedbackPrefs,
  useFeedbackPrefs,
  type ActionFeedbackKind,
  type FeedbackMode,
  type FeedbackPrefs,
  type SoundVolume,
  type VibrationStrength,
} from '@/lib/actionFeedback';
import { SettingRow, SettingsCard } from './SettingRow';

interface Choice<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

/** A row of options, one active; the same look as the theme switch under Appearance. */
function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Choice<T>[];
  onChange: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl border border-overlay-default bg-bg-700 p-1">
      {options.map(({ id, label: optionLabel, icon: Icon, disabled }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => onChange(id)}
            className={cx(
              'inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
              active ? 'bg-bg-500 text-content-primary shadow-sm' : 'text-content-muted enabled:hover:text-content-secondary',
              FOCUS_RING
            )}
          >
            {Icon && <Icon size={14} aria-hidden="true" />}
            {optionLabel}
          </button>
        );
      })}
    </div>
  );
}

const ACTIONS: { kind: ActionFeedbackKind; title: string; description: string }[] = [
  { kind: 'tick', title: 'Ticking off', description: 'Checking a habit, task or goal as done.' },
  { kind: 'swipe', title: 'Swiping', description: 'Swiping a habit row, or between tabs and pages.' },
];

const STRENGTHS: Choice<VibrationStrength>[] = [
  { id: 'light', label: 'Light' },
  { id: 'medium', label: 'Medium' },
  { id: 'strong', label: 'Strong' },
];

const VOLUMES: Choice<SoundVolume>[] = [
  { id: 'soft', label: 'Soft' },
  { id: 'medium', label: 'Medium' },
  { id: 'loud', label: 'Loud' },
];

/** Phones stack the options under the text, so three options never squeeze the title. */
const STACKED_ROW = 'flex-col sm:flex-row';

export function SoundVibrationSection() {
  const prefs = useFeedbackPrefs();
  const vibrationAvailable = canVibrate();
  const soundAvailable = canPlaySound();
  const modes: Choice<FeedbackMode>[] = [
    { id: 'vibration', label: 'Vibration', icon: Vibrate, disabled: !vibrationAvailable },
    { id: 'sound', label: 'Sound', icon: Volume2, disabled: !soundAvailable },
    { id: 'none', label: 'None', icon: CircleOff },
  ];
  const usesVibration = vibrationAvailable && (prefs.tick === 'vibration' || prefs.swipe === 'vibration');
  const usesSound = prefs.tick === 'sound' || prefs.swipe === 'sound';

  // Each change plays once, so the user feels or hears what they picked.
  const update = (change: Partial<FeedbackPrefs>, kind: ActionFeedbackKind, mode: FeedbackMode) => {
    setFeedbackPrefs(change);
    previewFeedback(kind, mode, { ...prefs, ...change });
  };

  return (
    <SettingsCard title="Sound and vibration">
      <div className="-my-1 divide-y divide-overlay-subtle">
        {ACTIONS.map(({ kind, title, description }) => (
          <SettingRow
            key={kind}
            className={STACKED_ROW}
            title={title}
            description={description}
            control={
              <ChoiceGroup
                label={title}
                value={prefs[kind]}
                options={modes}
                onChange={(mode) => update(kind === 'tick' ? { tick: mode } : { swipe: mode }, kind, mode)}
              />
            }
          />
        ))}
        {usesVibration && (
          <SettingRow
            className={STACKED_ROW}
            title="Vibration strength"
            description="Your phone's own vibration setting can still mute it."
            control={
              <ChoiceGroup
                label="Vibration strength"
                value={prefs.vibrationStrength}
                options={STRENGTHS}
                onChange={(vibrationStrength) => update({ vibrationStrength }, 'tick', 'vibration')}
              />
            }
          />
        )}
        {usesSound && (
          <SettingRow
            className={STACKED_ROW}
            title="Sound volume"
            description="Plays at your media volume. iPhones stay quiet on silent."
            control={
              <ChoiceGroup
                label="Sound volume"
                value={prefs.soundVolume}
                options={VOLUMES}
                onChange={(soundVolume) => update({ soundVolume }, 'tick', 'sound')}
              />
            }
          />
        )}
      </div>
      {!vibrationAvailable && (
        <p className="border-t border-overlay-subtle pt-4 text-xs leading-relaxed text-content-muted">
          This device can&apos;t vibrate. iPhones and computers don&apos;t let websites use vibration.
        </p>
      )}
    </SettingsCard>
  );
}
