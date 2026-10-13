import { Button, Dialog } from './primitives';
import { useDiscardRequest } from '@/lib/unsavedChanges';

/** The app's one "Discard changes?" question, raised by `requestDiscard` / `confirmLeave`. */
export function DiscardChangesDialog() {
  const { open, keepEditing, discard } = useDiscardRequest();

  return (
    <Dialog open={open} onClose={keepEditing} title="Discard changes?" maxWidth="max-w-sm">
      <div className="space-y-4">
        <p className="text-sm text-content-secondary">Your changes haven’t been saved and will be lost.</p>
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={keepEditing} data-autofocus>
            Keep editing
          </Button>
          <Button variant="danger" size="sm" onClick={discard}>
            Discard
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
