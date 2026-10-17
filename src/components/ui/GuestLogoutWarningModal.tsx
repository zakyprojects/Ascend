import { AlertTriangle, LogOut } from 'lucide-react';
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
    <Dialog open={open} onClose={onClose} title="Before you log out" maxWidth="max-w-md" preventClose={isLoggingOut}>
      <div className="space-y-4">
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-4 flex gap-3">
          <AlertTriangle size={18} className="text-warning-text shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h3 className="text-base font-semibold leading-tight text-warning-text">Your guest progress will be lost</h3>
            <p className="text-xs text-content-tertiary leading-relaxed">
              Logging out as a guest erases your habits, points, and league rank for good. Create an account first to keep them.
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
            className="btn-primary w-full min-h-11"
          >
            <span>Create an account first</span>
          </button>

          <button
            type="button"
            disabled={isLoggingOut}
            onClick={async () => {
              await onLogoutAnyway();
            }}
            className="btn-danger w-full min-h-11"
          >
            {isLoggingOut ? (
              <>
                <AscendLoadingIndicator size="sm" />
                <span>Logging out…</span>
              </>
            ) : (
              <>
                <LogOut size={15} />
                <span>Log out and lose progress</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
