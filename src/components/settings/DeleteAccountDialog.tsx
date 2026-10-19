import { useState } from 'react';
import { Dialog, FieldErrorBubble, Input } from '@/components/ui/primitives';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { PasswordInput } from '@/components/ui/PasswordInput';

interface DeleteAccountDialogProps {
  open: boolean;
  username: string;
  isDeleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (password: string) => void;
}

/**
 * Delete account: the button unlocks only once the exact username and the password are typed
 * (D-S1; the password is checked before the server deletes, Security B1). The text names what
 * goes with the account, including shared plans and partners.
 */
export function DeleteAccountDialog({ open, username, isDeleting, error, onClose, onConfirm }: DeleteAccountDialogProps) {
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  // Every open starts empty.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setTyped('');
      setPassword('');
    }
  }
  const matches = Boolean(username) && typed.trim() === username;
  const ready = matches && password.length > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete account?"
      maxWidth="max-w-md"
      preventClose={isDeleting}
      description="This deletes your account and everything in it: habits, logs, points, league history, plans and partners. This can't be undone."
      footer={
        <>
          <button type="button" disabled={isDeleting} onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="delete-account-form" disabled={isDeleting || !ready} className="btn-danger-solid">
            {isDeleting ? <AscendLoadingIndicator size="sm" /> : null}
            <span>{isDeleting ? 'Deleting…' : 'Delete account'}</span>
          </button>
        </>
      }
    >
      <form
        id="delete-account-form"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !isDeleting) onConfirm(password);
        }}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-content-secondary">
          <li>Plans you shared leave Discover. People who copied them keep their copies.</li>
          <li>Your partners lose the partnership and your shared challenges.</li>
          <li>Push notifications stop on every device.</li>
        </ul>
        <Input
          id="delete-account-confirm"
          label={`Type ${username} to confirm`}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={isDeleting}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <PasswordInput
          id="delete-account-password"
          label="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={isDeleting}
          autoComplete="current-password"
        />
        {error ? <FieldErrorBubble message={error} attached={false} /> : null}
      </form>
    </Dialog>
  );
}
