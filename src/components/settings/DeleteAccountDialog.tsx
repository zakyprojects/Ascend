import { useEffect, useState } from 'react';
import { Dialog, FieldErrorBubble, Input } from '@/components/ui/primitives';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { CaptchaSlot } from '@/components/ui/CaptchaSlot';

interface DeleteAccountDialogProps {
  open: boolean;
  username: string;
  /** The account's email, for password managers (hidden field before the password). */
  email: string;
  isDeleting: boolean;
  error: string | null;
  /** The error is about the typed password (wrong password): shown under that field, which takes focus. */
  errorOnPassword?: boolean;
  onClose: () => void;
  /** Gets the typed password; empty for a Google account (`confirmWith="google"`). */
  onConfirm: (password: string) => void;
  /** A Google account has no password: it confirms by signing in with Google again. */
  confirmWith?: 'password' | 'google';
  /** The Google check is done (back from Google within the server's 5 minutes). */
  googleConfirmed?: boolean;
}

const PASSWORD_ID = 'delete-account-password';

/**
 * Delete account: the button unlocks only once the exact username and the password are typed
 * (D-S1; the password is checked before the server deletes, Security B1). A Google account types
 * the username, goes to Google to confirm, and back here types it again to delete. The text names
 * what goes with the account, including shared plans and partners.
 */
export function DeleteAccountDialog({
  open,
  username,
  email,
  isDeleting,
  error,
  errorOnPassword = false,
  onClose,
  onConfirm,
  confirmWith = 'password',
  googleConfirmed = false,
}: DeleteAccountDialogProps) {
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
  const usesGoogle = confirmWith === 'google';
  const ready = matches && (usesGoogle || password.length > 0);
  const toGoogle = usesGoogle && !googleConfirmed;
  const passwordError = error && errorOnPassword && !usesGoogle ? error : undefined;

  // A wrong password: back to the field once it is enabled again, ready to retype.
  useEffect(() => {
    if (passwordError && !isDeleting) document.getElementById(PASSWORD_ID)?.focus();
  }, [passwordError, isDeleting]);

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
            <span>{isDeleting ? (toGoogle ? 'Opening Google…' : 'Deleting…') : toGoogle ? 'Continue with Google' : 'Delete account'}</span>
          </button>
        </>
      }
    >
      <form
        id="delete-account-form"
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (ready && !isDeleting) onConfirm(usesGoogle ? '' : password);
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
        {usesGoogle ? (
          <p className="text-xs text-content-muted">
            {googleConfirmed
              ? 'Google confirmed it’s you. Delete within 5 minutes.'
              : 'Your account signs in with Google, so Google confirms it’s you. Pick this same Google account; you come back here to finish.'}
          </p>
        ) : (
          <>
            {/* Tells password managers whose password this is, so they fill the account here and not
                into the "type your username" field above. */}
            <input type="hidden" autoComplete="username" value={email} readOnly />
            <PasswordInput
              id={PASSWORD_ID}
              label="Your password"
              error={passwordError}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isDeleting}
              autoComplete="current-password"
            />
          </>
        )}
        {error && !passwordError ? <FieldErrorBubble message={error} attached={false} /> : null}
        <CaptchaSlot />
      </form>
    </Dialog>
  );
}
