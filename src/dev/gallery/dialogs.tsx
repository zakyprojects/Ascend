import { useState } from 'react';
import { Button, Dialog, Form, Input, NumberField, Switch, useFormController } from '@/components/ui/primitives';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { Section } from './shared';
import { wait } from './util';

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

/** A form dialog the way every app form dialog works: Form + footer submit, dirty guard, async save. */
function FormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const controller = useFormController();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState(10);
  const [failSave, setFailSave] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add-dialogs start empty each time they open.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName('');
      setGoal(10);
    }
  }

  const form = useUnsavedChanges(open, [name, goal]);
  const cancel = () => form.confirmDiscard(onClose);

  const submit = async () => {
    setSaving(true);
    try {
      await wait(900);
      if (failSave) throw new Error('fail');
      onClose();
    } catch {
      controller.showError('Couldn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      preventClose={saving}
      title="Add goal"
      description="Type something, then press Esc, the backdrop or Cancel: it asks Discard changes?"
      footer={
        <>
          <button type="button" onClick={cancel} disabled={saving} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="gallery-dialog-form" disabled={saving} className="btn-primary">
            {saving && <AscendLoadingIndicator size="sm" />}
            Add goal
          </button>
        </>
      }
    >
      <Form id="gallery-dialog-form" controller={controller} onSubmit={submit} className="space-y-4">
        <Input id="gallery-dialog-name" label="Goal name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="off" />
        <NumberField id="gallery-dialog-goal" label="Target" hint="Saves for a moment; the dialog can’t close while it saves." value={goal} onValueChange={setGoal} required min={1} />
        <label className="flex items-center gap-3 text-sm text-content-secondary">
          <Switch checked={failSave} onChange={() => setFailSave((v) => !v)} label="Make the save fail" />
          Make the save fail (stays open with the reason)
        </label>
      </Form>
    </Dialog>
  );
}

function DialogDemo() {
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [longOpen, setLongOpen] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);
  const [nestedAOpen, setNestedAOpen] = useState(false);
  const [nestedBOpen, setNestedBOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
          Form dialog
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(true)}>
          Confirm delete
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setLongOpen(true)}>
          Long scrolling dialog
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setLockedOpen(true)}>
          preventClose dialog
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setNestedAOpen(true)}>
          Nested dialogs
        </Button>
      </div>

      <FormDialog open={formOpen} onClose={() => setFormOpen(false)} />

      <ConfirmDeleteModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete habit?"
        itemName="Drink 2 litres of water"
        onConfirm={async () => {
          await wait(800);
          setConfirmOpen(false);
        }}
      />

      <Dialog
        open={longOpen}
        onClose={() => setLongOpen(false)}
        title="Long scrolling dialog"
        description="Only the body scrolls; the footer stays pinned."
        footer={
          <button type="button" className="btn-primary" onClick={() => setLongOpen(false)}>
            Close
          </button>
        }
      >
        <div className="space-y-3">
          {Array.from({ length: 40 }, (_, i) => (
            <p key={i} className="text-sm text-content-secondary">
              {`Filler paragraph ${i + 1} - scroll test.`}
            </p>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={lockedOpen}
        onClose={() => setLockedOpen(false)}
        title="preventClose dialog"
        description="No X, no Escape, no backdrop close (used while a save runs)."
        preventClose
        footer={
          <button type="button" className="btn-danger-solid" onClick={() => setLockedOpen(false)}>
            Close me
          </button>
        }
      >
        {null}
      </Dialog>

      <Dialog
        open={nestedAOpen}
        onClose={() => setNestedAOpen(false)}
        title="Nested A"
        description="Nested dialog A is open."
        footer={
          <button type="button" className="btn-primary" onClick={() => setNestedBOpen(true)}>
            Open B
          </button>
        }
      >
        {null}
      </Dialog>

      <Dialog
        open={nestedBOpen}
        onClose={() => setNestedBOpen(false)}
        title="Nested B"
        description="Press Escape: only B should close. Press it again: A closes."
        footer={
          <button type="button" className="btn-secondary" onClick={() => setNestedBOpen(false)}>
            Close B
          </button>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}

export function DialogsGroup() {
  return (
    <>
      <Section id="dialogs">
        <DialogDemo />
      </Section>
    </>
  );
}
