import { useState } from 'react';
import { Dialog } from './primitives';
import { Trash2, AlertTriangle } from 'lucide-react';
import { AscendLoadingIndicator } from './AscendLoadingIndicator';
import { useToast } from './Toast';

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
  const { showErrorToast } = useToast();

  const handleConfirmClick = async () => {
    setInternalDeleting(true);
    try {
      await onConfirm();
    } catch (err: any) {
      showErrorToast('Couldn’t delete', err?.message || 'Check your connection and try again.');
    } finally {
      setInternalDeleting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="text-rose-theme shrink-0 mt-0.5" />
          <p className="text-xs text-content-tertiary leading-relaxed">
            {description || (
              <>
                Are you sure you want to delete {itemName ? <strong className="text-content-primary font-medium">"{itemName}"</strong> : 'this item'}? This can’t be undone.
              </>
            )}
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="btn-secondary text-xs px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={isDeleting}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all shadow-sm"
          >
            {isDeleting ? (
              <>
                <AscendLoadingIndicator size="sm" />
                <span>Deleting…</span>
              </>
            ) : (
              <>
                <Trash2 size={14} />
                <span>{confirmText}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
