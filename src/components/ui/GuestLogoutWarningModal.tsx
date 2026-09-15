import { Modal } from './Modal';
import { AlertTriangle, Shield, LogOut } from 'lucide-react';
import { AscendLoadingIndicator } from './AscendLoadingIndicator';

interface GuestLogoutWarningModalProps {
  open: boolean;
  onClose: () => void;
  onSaveProgressFirst: () => void;
  onLogoutAnyway: () => Promise<void> | void;
  isLoggingOut?: boolean;
}

export function GuestLogoutWarningModal({
  open,
  onClose,
  onSaveProgressFirst,
  onLogoutAnyway,
  isLoggingOut = false,
}: GuestLogoutWarningModalProps) {
  if (!open) return null;

  return (
    <Modal open={open} onClose={isLoggingOut ? () => {} : onClose} title="Guest Account Warning" maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-warning-text flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle size={20} />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-content-primary">Guest Progress Will Be Lost</h3>
            <p className="text-xs text-content-tertiary leading-relaxed">
              You are currently using a guest account. Logging out will permanently end your guest session and erase your habits, points, and league rank unless you save your progress first.
            </p>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <button
            type="button"
            disabled={isLoggingOut}
            onClick={() => {
              onClose();
              onSaveProgressFirst();
            }}
            className="w-full py-3 bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 disabled:opacity-50 text-on-brand font-bold text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
          >
            <Shield size={16} />
            <span>Save Progress First (Create Account)</span>
          </button>

          <button
            type="button"
            disabled={isLoggingOut}
            onClick={async () => {
              await onLogoutAnyway();
            }}
            className="w-full py-2.5 bg-rose-500/10 hover:bg-rose-500/20 disabled:opacity-50 text-rose-theme border border-rose-500/30 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-2"
          >
            {isLoggingOut ? (
              <>
                <AscendLoadingIndicator size="sm" />
                <span>Logging Out...</span>
              </>
            ) : (
              <>
                <LogOut size={15} />
                <span>Log Out Anyway (Delete Progress)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
