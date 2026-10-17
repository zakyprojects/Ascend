import { Dialog } from './primitives';
import { useDiscardRequest } from '@/lib/unsavedChanges';

/** The app's one "Discard changes?" question, raised by `requestDiscard` / `confirmLeave`. */
export function DiscardChangesDialog() {
  const { open, keepEditing, discard } = useDiscardRequest();

  return (
    <Dialog
      open={open}
      onClose={keepEditing}
      title="Discard changes?"
      maxWidth="max-w-sm"
      description="Your changes haven’t been saved and will be lost."
      footer={
        <>
          <button type="button" onClick={keepEditing} className="btn-secondary" data-autofocus>
            Keep editing
          </button>
          <button type="button" onClick={discard} className="btn-danger-solid">
            Discard
          </button>
        </>
      }
    >
      {null}
    </Dialog>
  );
}
