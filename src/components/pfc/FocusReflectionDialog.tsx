import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import type { AppStore } from '@/lib/store';
import { Dialog, Textarea } from '@/components/ui/primitives';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { useFocusSession } from './FocusSessionProvider';

/** After a focus session ends: an optional note, saved on that session's own log. */
export function FocusReflectionDialog({ store }: { store: AppStore }) {
  const { finished, clearFinished } = useFocusSession();
  const [text, setText] = useState('');
  const open = Boolean(finished);
  const form = useUnsavedChanges(finished?.logId ?? null, text);

  useEffect(() => {
    if (finished) setText('');
  }, [finished]);

  const save = () => {
    if (finished && text.trim()) store.updateFocusLogReflection(finished.logId, text);
    clearFinished();
  };

  return (
    <Dialog
      open={open}
      onClose={clearFinished}
      dirty={form.dirty}
      title="Focus session done"
      description={finished ? `${finished.minutes} min on ${finished.taskName} is saved.` : undefined}
      footer={
        <>
          <button type="button" onClick={() => form.confirmDiscard(clearFinished)} className="btn-secondary">
            Skip
          </button>
          <button type="button" onClick={save} className="btn-primary">
            <Check size={16} aria-hidden="true" />
            <span>Save note</span>
          </button>
        </>
      }
    >
      <Textarea
        id="pfc-session-reflection"
        label="How did it go?"
        optional
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What did you get done? What got in the way?"
        className="min-h-[90px]"
        maxLength={2000}
      />
    </Dialog>
  );
}
