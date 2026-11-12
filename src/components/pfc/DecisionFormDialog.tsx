import { useEffect, useState } from 'react';
import type { DecisionLog } from '@/types';
import { Dialog, Form, Input, Textarea, useFormController } from '@/components/ui/primitives';
import { todayKey } from '@/lib/time/dates';
import { useUnsavedChanges } from '@/lib/ui/unsavedChanges';
import { toUserMessage } from '@/lib/app/userMessage';

/**
 * Log a decision, or (with `editing`) change its words: title, why, expected outcome, and the
 * reflection once written. The revisit day and reflected state stay as they are when editing.
 */
export function DecisionFormDialog({
  open,
  onClose,
  onSave,
  editing = null,
  onSaveEdit,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (title: string, rationale: string, expectedOutcome: string, revisitDate: string) => void;
  editing?: DecisionLog | null;
  onSaveEdit?: (id: string, changes: { title: string; rationale: string; expectedOutcome: string; reflection?: string }) => Promise<void> | void;
}) {
  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');
  const [outcome, setOutcome] = useState('');
  const [revisit, setRevisit] = useState(() => todayKey());
  const [reflection, setReflection] = useState('');
  const editReflection = Boolean(editing?.isReflected);
  const issues = useFormController();
  const [saving, setSaving] = useState(false);
  const form = useUnsavedChanges(open && editing ? editing.id : open, [title, rationale, outcome, revisit, reflection], {
    key: editing ? 'pfc-decision-edit' : 'pfc-decision',
    restore: ([t, r, o, v, x]) => {
      setTitle(t);
      setRationale(r);
      setOutcome(o);
      setRevisit(v);
      setReflection(x ?? '');
    },
  });

  // Every open starts clean: a dismissed draft is not shown again. Editing starts from the decision.
  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? '');
    setRationale(editing?.rationale ?? '');
    setOutcome(editing?.expectedOutcome ?? '');
    setRevisit(editing?.revisitDate ?? todayKey());
    setReflection(editing?.reflection ?? '');
  }, [open, editing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !rationale.trim()) return;
    if (editing) {
      if (editReflection && !reflection.trim()) return;
      const id = editing.id;
      const changes = {
        title: title.trim(),
        rationale: rationale.trim(),
        expectedOutcome: outcome.trim(),
        ...(editReflection ? { reflection: reflection.trim() } : {}),
      };
      setSaving(true);
      void (async () => {
        try {
          await onSaveEdit?.(id, changes);
        } catch (err) {
          issues.showError(toUserMessage(err, "Couldn't save. Try again."));
        } finally {
          setSaving(false);
        }
      })();
      return;
    }
    onSave(title.trim(), rationale.trim(), outcome.trim(), revisit);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      title={editing ? 'Edit decision' : 'Log decision'}
      description={editing ? 'The revisit day stays as it is.' : undefined}
      footer={
        <>
          <button type="button" onClick={() => form.confirmDiscard(onClose)} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="pfc-decision-form" className="btn-primary" disabled={saving}>
            {editing ? 'Save changes' : 'Save decision'}
          </button>
        </>
      }
    >
      <Form id="pfc-decision-form" onSubmit={submit} controller={issues} className="space-y-4">
        <Input
          id="pfc-decision-title"
          label="Decision"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Switch to a new project framework"
          maxLength={150}
          autoComplete="off"
          required
        />
        <Textarea
          id="pfc-decision-rationale"
          label="Why are you deciding this?"
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          placeholder="What facts or assumptions led you here?"
          maxLength={2000}
          required
        />
        <Input
          id="pfc-decision-outcome"
          label="Expected outcome"
          optional
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          placeholder="What do you expect will happen?"
          maxLength={300}
          autoComplete="off"
        />
        {!editing && (
          <Input
            id="pfc-decision-revisit-date"
            label="Revisit on"
            type="date"
            min={todayKey()}
            value={revisit}
            onChange={(e) => setRevisit(e.target.value)}
            required
          />
        )}
        {editReflection && (
          <Textarea
            id="pfc-decision-edit-reflection"
            label="What actually happened? What did you learn?"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            placeholder="How did it compare to what you expected?"
            className="min-h-[100px]"
            maxLength={2000}
            required
          />
        )}
      </Form>
    </Dialog>
  );
}
