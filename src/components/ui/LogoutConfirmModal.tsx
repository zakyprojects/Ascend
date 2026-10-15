import { LogOut, AlertTriangle } from 'lucide-react';
import { Dialog } from './primitives';
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
    <Dialog open={open} onClose={onClose} title="Log out?" maxWidth="max-w-md" preventClose={isLoggingOut}>
      <div className="space-y-4">
        <div className="p-3 bg-warning/10 border border-warning/20 rounded-xl flex items-start gap-3">
          <AlertTriangle size={20} className="text-warning-text shrink-0 mt-0.5" />
          <p className="text-xs text-content-tertiary leading-relaxed">
            You’ll need to sign in again to see your data and partners.
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
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            {isLoggingOut ? (
              <>
                <AscendLoadingIndicator size="sm" />
                <span>Logging out…</span>
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
    </Dialog>
  );
}
