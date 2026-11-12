import { useEffect, useState } from 'react';
import type { EmotionLog } from '@/types';
import { Dialog, Form, Textarea, useFormController } from '@/components/ui/primitives';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';
import { formatDateLong } from '@/lib/time/dates';
import { EMOTION_CONTEXT_MAX } from '@/lib/pfcLogEdits';
import { localDayOf, timeOfDay } from './pfcLists';

/** Edit an emotion entry's note. The emotion, intensity and time stay. */
export function EmotionNoteDialog({
  log,
  onClose,
  onSave,
}: {
  log: EmotionLog | null;
  onClose: () => void;
  onSave: (context: string) => Promise<void> | void;
}) {
  const [context, setContext] = useState('');
  const issues = useFormController();
  const [saving, setSaving] = useState(false);
  const form = useUnsavedChanges(log?.id ?? null, context, { key: 'pfc-emotion-edit', restore: setContext });

  useEffect(() => {
    if (log) setContext(log.context || '');
  }, [log?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (save: () => Promise<void> | void) => {
    setSaving(true);
    try {
      await save();
    } catch (err) {
      issues.showError(toUserMessage(err, "Couldn't save. Try again."));
    } finally {
      setSaving(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!log) return;
    void run(() => onSave(context.trim()));
  };

  const day = log ? localDayOf(log.date) : '';
  const at = log ? timeOfDay(log.date) : '';
  return (
    <Dialog
      open={!!log}
      onClose={onClose}
      dirty={form.dirty}
      title="Edit note"
      description={
        log ? `${log.emotion} · ${log.intensity}/10${day ? ` · ${formatDateLong(day)}` : ''}${at ? ` · ${at}` : ''}` : undefined
      }
      footer={
        <>
          <button type="button" onClick={() => form.confirmDiscard(onClose)} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="pfc-emotion-edit-form" className="btn-primary" disabled={saving}>
            Save changes
          </button>
        </>
      }
    >
      <Form id="pfc-emotion-edit-form" onSubmit={submit} controller={issues}>
        <Textarea
          id="pfc-emotion-edit-context"
          label="What triggered it?"
          optional
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. Work deadline, argument with a friend"
          className="min-h-24"
          maxLength={EMOTION_CONTEXT_MAX}
        />
      </Form>
    </Dialog>
  );
}
