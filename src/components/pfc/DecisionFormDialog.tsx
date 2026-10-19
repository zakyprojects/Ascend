import { useEffect, useState } from 'react';
import { Dialog, Form, Input, Textarea } from '@/components/ui/primitives';
import { todayKey } from '@/lib/dates';
import { useUnsavedChanges } from '@/lib/unsavedChanges';

export function DecisionFormDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (title: string, rationale: string, expectedOutcome: string, revisitDate: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');
  const [outcome, setOutcome] = useState('');
  const [revisit, setRevisit] = useState(() => todayKey());
  const form = useUnsavedChanges(open, [title, rationale, outcome, revisit], {
    key: 'pfc-decision',
    restore: ([t, r, o, v]) => {
      setTitle(t);
      setRationale(r);
      setOutcome(o);
      setRevisit(v);
    },
  });

  // Every open starts clean: a dismissed draft is not shown again.
  useEffect(() => {
    if (!open) return;
    setTitle('');
    setRationale('');
    setOutcome('');
    setRevisit(todayKey());
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !rationale.trim()) return;
    onSave(title.trim(), rationale.trim(), outcome.trim(), revisit);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      title="Log decision"
      footer={
        <>
          <button type="button" onClick={() => form.confirmDiscard(onClose)} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="pfc-decision-form" className="btn-primary">
            Save decision
          </button>
        </>
      }
    >
      <Form id="pfc-decision-form" onSubmit={submit} className="space-y-4">
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
        <Input
          id="pfc-decision-revisit-date"
          label="Revisit on"
          type="date"
          min={todayKey()}
          value={revisit}
          onChange={(e) => setRevisit(e.target.value)}
          required
        />
      </Form>
    </Dialog>
  );
}
