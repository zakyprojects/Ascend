import { Modal } from './Modal';
import { Trash2, AlertTriangle } from 'lucide-react';

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
  title = 'Delete Item?',
  itemName,
  description,
  confirmText = 'Delete',
  isDeleting = false,
}: ConfirmDeleteModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="text-rose-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 leading-relaxed">
            {description || (
              <>
                Are you sure you want to delete {itemName ? <strong className="text-slate-100 font-bold">"{itemName}"</strong> : 'this item'}? This action cannot be undone.
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
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-rose-900/20"
          >
            <Trash2 size={14} />
            <span>{isDeleting ? 'Deleting...' : confirmText}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
