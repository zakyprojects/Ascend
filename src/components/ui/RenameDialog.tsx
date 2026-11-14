import { useState } from 'react';
import { Dialog, Form, Input, useFormController } from '@/components/ui/primitives';
import { useUnsavedChanges } from '@/lib/ui/unsavedChanges';
import { toUserMessage } from '@/lib/app/userMessage';

/**
 * One name field in a dialog (rename a custom habit or bad habit). Mount it with `key` set to the
 * item's id so every open starts from the item's current name. `validate` returns the problem
 * shown under the field; `onSave` may throw, and its message is shown the same way.
 */
export function RenameDialog({
  open,
  onClose,
  title,
  description,
  label,
  initialName,
  inputId,
  maxLength,
  placeholder,
  validate,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  label: string;
  initialName: string;
  inputId: string;
  maxLength: number;
  placeholder?: string;
  validate: (name: string) => string | null;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const form = useUnsavedChanges(open, name);
  const issues = useFormController();
  const formId = `${inputId}-form`;

  const submit = () => {
    try {
      onSave(name);
      onClose();
    } catch (err) {
      issues.showError(toUserMessage(err, "Couldn't save. Try again."), inputId);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      title={title}
      description={description}
      footer={
        <>
          <button type="button" onClick={() => form.confirmDiscard(onClose)} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form={formId} className="btn-primary">
            Save
          </button>
        </>
      }
    >
      <Form
        id={formId}
        onSubmit={submit}
        controller={issues}
        validate={() => {
          const problem = validate(name);
          return problem ? { message: problem, field: inputId } : null;
        }}
      >
        <Input
          id={inputId}
          label={label}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          maxLength={maxLength}
          autoComplete="off"
          enterKeyHint="done"
          required
        />
      </Form>
    </Dialog>
  );
}
