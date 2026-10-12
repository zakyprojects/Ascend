import { LogOut } from 'lucide-react';
import { Dialog } from './primitives';
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
    <Dialog open={open} onClose={isLoggingOut ? () => {} : onClose} title="Guest Account Warning" maxWidth="max-w-md">
      <div className="space-y-4">
        <div className="p-4 border border-overlay-default rounded-xl">
          <div className="space-y-1">
            <h3 className="font-serif text-xl leading-tight text-warning-text">Guest Progress Will Be Lost</h3>
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
            className="w-full py-3 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-on-brand font-semibold text-xs sm:text-sm rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <span>Save Progress First (Create Account)</span>
          </button>

          <button
            type="button"
            disabled={isLoggingOut}
            onClick={async () => {
              await onLogoutAnyway();
            }}
            className="w-full py-2.5 hover:bg-overlay-subtle disabled:opacity-50 text-rose-theme border border-overlay-default font-medium text-xs rounded-xl transition-colors flex items-center justify-center gap-2"
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
    </Dialog>
  );
}
