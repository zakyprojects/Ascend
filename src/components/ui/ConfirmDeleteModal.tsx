import { useState } from 'react';
import { Dialog, FieldErrorBubble } from './primitives';
import { Trash2 } from 'lucide-react';
import { AscendLoadingIndicator } from './AscendLoadingIndicator';
import { toUserMessage } from '@/lib/userMessage';

interface ConfirmDeleteModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title?: string;
  itemName?: string;
  description?: string;
  confirmText?: string;
  isDeleting?: boolean;
}

export function ConfirmDeleteModal({
  open,
  onClose,
  onConfirm,
  title = 'Delete item?',
  itemName,
  description,
  confirmText = 'Delete',
  isDeleting: externalIsDeleting = false,
}: ConfirmDeleteModalProps) {
  const [internalDeleting, setInternalDeleting] = useState(false);
  const isDeleting = externalIsDeleting || internalDeleting;
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Each time it opens it starts without the last attempt's message.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDeleteError(null);
  }

  const handleConfirmClick = async () => {
    setInternalDeleting(true);
    setDeleteError(null);
    try {
      await onConfirm();
    } catch (err: any) {
      console.error('Delete failed:', err);
      setDeleteError(toUserMessage(err, 'Couldn’t delete. Try again.'));
    } finally {
      setInternalDeleting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      maxWidth="max-w-md"
      preventClose={isDeleting}
      description={
        description || (
          <>
            Delete {itemName ? <strong className="text-content-primary font-medium">"{itemName}"</strong> : 'this item'}? This can’t be undone.
          </>
        )
      }
      footer={
        <>
          <button type="button" onClick={onClose} disabled={isDeleting} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={handleConfirmClick} disabled={isDeleting} className="btn-danger-solid">
            {isDeleting ? <AscendLoadingIndicator size="sm" /> : <Trash2 size={16} />}
            <span>{isDeleting ? 'Deleting…' : confirmText}</span>
          </button>
        </>
      }
    >
      {deleteError ? <FieldErrorBubble message={deleteError} attached={false} /> : null}
    </Dialog>
  );
}
