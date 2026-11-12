import { useEffect, useState } from 'react';
import type { FocusSessionLog } from '@/types';
import { Dialog, Form, Input, Textarea, useFormController } from '@/components/ui/primitives';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';
import { formatDateLong } from '@/lib/dates';
import { FOCUS_REFLECTION_MAX, FOCUS_TASK_MAX } from '@/lib/pfcLogEdits';
import { timeOfDay } from './pfcLists';

/** Edit a focus session's words: task name and note. Minutes, time, skill and points stay. */
export function FocusLogEditDialog({
  log,
  onClose,
  onSave,
}: {
  log: FocusSessionLog | null;
  onClose: () => void;
  onSave: (taskName: string, reflection: string) => Promise<void> | void;
}) {
  const [taskName, setTaskName] = useState('');
  const [reflection, setReflection] = useState('');
  const issues = useFormController();
  const [saving, setSaving] = useState(false);
  const form = useUnsavedChanges(log?.id ?? null, [taskName, reflection] as [string, string], {
    key: 'pfc-focus-edit',
    restore: ([t, r]) => {
      setTaskName(t);
      setReflection(r);
    },
  });

  useEffect(() => {
    if (!log) return;
    setTaskName(log.taskName);
    setReflection(log.reflection || '');
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
    if (!log || !taskName.trim()) return;
    void run(() => onSave(taskName.trim(), reflection.trim()));
  };

  const at = log ? timeOfDay(log.createdAt) : '';
  return (
    <Dialog
      open={!!log}
      onClose={onClose}
      dirty={form.dirty}
      title="Edit focus session"
      description={
        log ? `${log.durationMinutes} min · ${formatDateLong(log.date)}${at ? ` · ${at}` : ''}. Time and points stay as they are.` : undefined
      }
      footer={
        <>
          <button type="button" onClick={() => form.confirmDiscard(onClose)} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="pfc-focus-edit-form" className="btn-primary" disabled={saving}>
            Save changes
          </button>
        </>
      }
    >
      <Form id="pfc-focus-edit-form" onSubmit={submit} controller={issues} className="space-y-4">
        <Input
          id="pfc-focus-edit-task"
          label="What did you focus on?"
          value={taskName}
          onChange={(e) => setTaskName(e.target.value)}
          maxLength={FOCUS_TASK_MAX}
          autoComplete="off"
          required
        />
        <Textarea
          id="pfc-focus-edit-reflection"
          label="How did it go?"
          optional
          value={reflection}
          onChange={(e) => setReflection(e.target.value)}
          placeholder="What did you get done? What got in the way?"
          className="min-h-24"
          maxLength={FOCUS_REFLECTION_MAX}
        />
      </Form>
    </Dialog>
  );
}
