import { LogOut } from 'lucide-react';
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
    <Dialog
      open={open}
      onClose={onClose}
      title="Log out?"
      maxWidth="max-w-md"
      preventClose={isLoggingOut}
      description="You’ll need to sign in again to see your data and partners."
      footer={
        <>
          <button type="button" onClick={onClose} disabled={isLoggingOut} className="btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={isLoggingOut} className="btn-danger-solid">
            {isLoggingOut ? <AscendLoadingIndicator size="sm" /> : <LogOut size={16} />}
            <span>{isLoggingOut ? 'Logging out…' : 'Log out'}</span>
          </button>
        </>
      }
    >
      {null}
    </Dialog>
  );
}
