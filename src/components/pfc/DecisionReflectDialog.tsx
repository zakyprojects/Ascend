import { useEffect, useState } from 'react';
import type { DecisionLog } from '@/types';
import { Dialog, Form, Textarea } from '@/components/ui/primitives';
import { useUnsavedChanges } from '@/lib/unsavedChanges';

export function DecisionReflectDialog({
  decision,
  onClose,
  onSave,
}: {
  decision: DecisionLog | null;
  onClose: () => void;
  onSave: (id: string, reflection: string) => void;
}) {
  const [text, setText] = useState('');
  const form = useUnsavedChanges(decision?.id ?? null, text);

  useEffect(() => {
    if (decision) setText('');
  }, [decision?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!decision || !text.trim()) return;
    onSave(decision.id, text.trim());
  };

  return (
    <Dialog
      open={!!decision}
      onClose={onClose}
      dirty={form.dirty}
      title="Reflect on a decision"
      description={decision?.title}
      footer={
        <>
          <button type="button" onClick={() => form.confirmDiscard(onClose)} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="pfc-decision-reflect-form" className="btn-primary">
            Save reflection
          </button>
        </>
      }
    >
      <Form id="pfc-decision-reflect-form" onSubmit={submit}>
        <Textarea
          id="pfc-decision-reflection-notes"
          label="What actually happened? What did you learn?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="How did it compare to what you expected?"
          className="min-h-[100px]"
          maxLength={2000}
          required
        />
      </Form>
    </Dialog>
  );
}
