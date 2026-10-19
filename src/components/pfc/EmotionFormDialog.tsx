import { useEffect, useState } from 'react';
import { Dialog, Form, Input, Select, Textarea } from '@/components/ui/primitives';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { COMMON_EMOTIONS } from './pfcLists';

const OTHER = 'Other';

/**
 * Label an emotion. `initialEmotion`: null = closed, '' = open with the default, a name = open
 * with that emotion chosen (quick label chips).
 */
export function EmotionFormDialog({
  initialEmotion,
  onClose,
  onSave,
}: {
  initialEmotion: string | null;
  onClose: () => void;
  onSave: (emotion: string, intensity: number, context: string) => void;
}) {
  const open = initialEmotion !== null;
  const [emotion, setEmotion] = useState(COMMON_EMOTIONS[0]);
  const [custom, setCustom] = useState('');
  const [intensity, setIntensity] = useState(5);
  const [context, setContext] = useState('');
  const form = useUnsavedChanges(open, [emotion, custom, intensity, context] as [string, string, number, string], {
    key: 'pfc-emotion',
    restore: ([e, c, i, x]) => {
      setEmotion(e);
      setCustom(c);
      setIntensity(i);
      setContext(x);
    },
  });

  // Every open starts clean.
  useEffect(() => {
    if (initialEmotion === null) return;
    setEmotion(initialEmotion || COMMON_EMOTIONS[0]);
    setCustom('');
    setIntensity(5);
    setContext('');
  }, [initialEmotion]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = (emotion === OTHER ? custom : emotion).trim();
    if (!name) return;
    onSave(name, intensity, context.trim());
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      title="Label emotion"
      footer={
        <>
          <button type="button" onClick={() => form.confirmDiscard(onClose)} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="pfc-emotion-form" className="btn-primary">
            Save
          </button>
        </>
      }
    >
      <Form id="pfc-emotion-form" onSubmit={submit} className="space-y-4">
        <Select id="pfc-emotion-select" label="Emotion" value={emotion} onChange={(e) => setEmotion(e.target.value)}>
          {COMMON_EMOTIONS.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
          <option value={OTHER}>Other…</option>
        </Select>
        {emotion === OTHER && (
          <Input
            id="pfc-emotion-custom"
            label="Emotion name"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="e.g. Jealousy"
            maxLength={40}
            autoComplete="off"
            required
          />
        )}

        <div>
          <div className="flex justify-between mb-1.5">
            <label htmlFor="pfc-emotion-intensity" className="label">
              Intensity
            </label>
            <span className="figure text-xs text-rose-theme">{intensity} / 10</span>
          </div>
          <input
            id="pfc-emotion-intensity"
            type="range"
            min="1"
            max="10"
            value={intensity}
            onChange={(e) => setIntensity(Number(e.target.value))}
            className="w-full h-11 sm:h-6 accent-rose-500"
          />
        </div>

        <Textarea
          id="pfc-emotion-context"
          label="What triggered it?"
          optional
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. Work deadline, argument with a friend"
          maxLength={1000}
        />
      </Form>
    </Dialog>
  );
}
