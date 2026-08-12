import { Modal } from './Modal';
import { LogOut, AlertTriangle } from 'lucide-react';
import { AscendLoadingIndicator } from './AscendLoadingIndicator';

interface LogoutConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isLoggingOut?: boolean;
}

export function LogoutConfirmModal({
  open,
  onClose,
  onConfirm,
  isLoggingOut = false,
}: LogoutConfirmModalProps) {
  return (
    <Modal open={open} onClose={onClose} title="Confirm Logout" maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-slate-300 leading-relaxed">
            Are you sure you want to log out of your Ascend account? You will need to sign back in to access your growth data and partner sync.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoggingOut}
            className="btn-secondary text-xs px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoggingOut}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-rose-900/20"
          >
            {isLoggingOut ? (
              <>
                <AscendLoadingIndicator size="sm" />
                <span>Logging Out...</span>
              </>
            ) : (
              <>
                <LogOut size={15} />
                <span>Log Out</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
