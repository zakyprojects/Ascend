import { useState } from 'react';
import { LogOut, Trash2 } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { changeUserPassword, deleteOwnAccount, WrongCurrentPasswordError } from '@/lib/auth';
import { verifyAccountPassword } from '@/lib/supabase';
import { newPasswordProblem } from '@/lib/passwordRules';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordStaircase } from '@/components/ui/PasswordStaircase';
import { GuestLogoutWarningModal } from '@/components/ui/GuestLogoutWarningModal';
import { LogoutConfirmModal } from '@/components/ui/LogoutConfirmModal';
import { Button, Form, FormAlert, Input, focusStillInForm, useFocusOnRender, useFormController } from '@/components/ui/primitives';
import { AscendLoadingIndicator, AscendLoadingOverlay } from '@/components/ui/AscendLoadingIndicator';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';
import { useToast } from '@/components/ui/Toast';
import { SettingRow, SettingsCard } from './SettingRow';
import { DeleteAccountDialog } from './DeleteAccountDialog';

interface AccountSectionProps {
  store: AppStore;
  onOpenAuth?: () => void;
}

export function AccountSection({ store, onOpenAuth }: AccountSectionProps) {
  const currentUser = store.state.currentUser;
  const isGuest = Boolean(currentUser?.isAnonymous);
  const userId = currentUser?.id || '';
  const { showSuccessToast } = useToast();

  // ── Password (asks for the current one first, D-S3) ──
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const passwordForm = useFormController();
  const { isLoading: isPasswordSaving, executeFn: executePasswordSave } = useAsyncAction();
  const { confirmDiscard } = useUnsavedChanges(showPasswordForm, { currentPassword, newPassword, confirmPassword });
  // The button goes away as the form opens: its first field takes focus instead of the page.
  // Cancel/Save close the form and focus returns to the button.
  const focusNext = useFocusOnRender();

  const closePasswordForm = () => {
    setShowPasswordForm(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  const validatePassword = () => {
    const problem = newPasswordProblem(newPassword);
    if (problem) return { message: `${problem}.`, field: 'settings-new-password' };
    if (newPassword === currentPassword) {
      return { message: 'Use a password different from your current one.', field: 'settings-new-password' };
    }
    if (newPassword !== confirmPassword) return { message: 'Passwords don’t match.', field: 'settings-confirm-password' };
    return null;
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPasswordSaving) return;
    await executePasswordSave(async () => {
      try {
        if (!currentUser?.email) throw new Error("Couldn't check your password. Try again.");
        await changeUserPassword(newPassword, { email: currentUser.email, password: currentPassword });
        showSuccessToast('Password changed');
        if (focusStillInForm('settings-current-password')) focusNext('settings-change-password');
        closePasswordForm();
      } catch (err: unknown) {
        if (err instanceof WrongCurrentPasswordError) {
          passwordForm.showError(err.message, 'settings-current-password');
        } else {
          passwordForm.showError(toUserMessage(err, "Couldn't change your password. Try again."));
        }
      }
    });
  };

  // ── Log out ──
  const [showGuestLogoutWarning, setShowGuestLogoutWarning] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { isLoading: isLoggingOut, executeFn: executeLogout } = useAsyncAction();

  const handleConfirmLogout = async () => {
    await executeLogout(async () => {
      try {
        await store.logout();
      } catch (err) {
        console.error('Logout error in Settings:', err);
      } finally {
        setShowLogoutConfirm(false);
      }
    });
  };

  const handleGuestLogoutAnyway = async () => {
    await executeLogout(async () => {
      try {
        if (await store.logoutGuest()) setShowGuestLogoutWarning(false);
      } catch (err) {
        console.error('Guest logout error in Settings:', err);
      }
    });
  };

  // ── Delete account (not for guests: their Log out already deletes the guest account, D-S4) ──
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const {
    isLoading: isDeletingAccount,
    error: deleteAccountError,
    executeFn: executeDeleteAccount,
    resetError: resetDeleteAccountError,
  } = useAsyncAction();

  // The password is checked first: the server deletes only right after a password sign-in
  // (Security B1). On failure the account still exists, so the user stays signed in and the
  // dialog stays open with the error; on success the session is cleared locally.
  const handleDeleteAccount = async (password: string) => {
    try {
      await executeDeleteAccount(async () => {
        if (!currentUser?.email) throw new Error("Couldn't check your password. Try again.");
        if ((await verifyAccountPassword(currentUser.email, password)) === 'wrong') {
          throw new WrongCurrentPasswordError();
        }
        await deleteOwnAccount(userId);
      });
    } catch (err) {
      console.error('Account deletion failed in Settings:', err);
      return;
    }
    setShowDeleteConfirm(false);
    await store.logout({ accountDeleted: true });
  };

  return (
    <SettingsCard title="Account">
      <Input id="settings-email" label="Email" readOnly value={currentUser?.email || (isGuest ? 'Guest (no email)' : '')} className="text-content-muted" />

      {!isGuest && (
        <div className="border-t border-overlay-subtle pt-2">
          <SettingRow
            title="Password"
            description="Change the password you log in with."
            control={
              !showPasswordForm && (
                <Button
                  id="settings-change-password"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowPasswordForm(true);
                    focusNext('settings-current-password');
                  }}
                >
                  Change password
                </Button>
              )
            }
          />
          {showPasswordForm && (
            <Form
              onSubmit={handleChangePassword}
              validate={validatePassword}
              controller={passwordForm}
              alert="manual"
              className="space-y-3 pb-2"
            >
              <PasswordInput
                id="settings-current-password"
                label="Current password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
              <PasswordInput
                id="settings-new-password"
                label="New password"
                required
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <PasswordStaircase password={newPassword} />
              <PasswordInput
                id="settings-confirm-password"
                label="Confirm new password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              <FormAlert />
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={isPasswordSaving}
                  onClick={() =>
                    confirmDiscard(() => {
                      closePasswordForm();
                      focusNext('settings-change-password');
                    })
                  }
                  className="btn-secondary min-h-11 sm:min-h-10"
                >
                  Cancel
                </button>
                <button type="submit" disabled={isPasswordSaving} className="btn-primary min-h-11 sm:min-h-10">
                  {isPasswordSaving ? (
                    <>
                      <AscendLoadingIndicator size="sm" />
                      <span>Saving…</span>
                    </>
                  ) : (
                    'Save new password'
                  )}
                </button>
              </div>
            </Form>
          )}
        </div>
      )}

      <div className="border-t border-overlay-subtle pt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="secondary"
          onClick={() => (isGuest ? setShowGuestLogoutWarning(true) : setShowLogoutConfirm(true))}
          className="min-h-11 sm:min-h-10"
        >
          <LogOut size={16} aria-hidden="true" />
          Log out
        </Button>
        {!isGuest && (
          <button
            type="button"
            onClick={() => {
              resetDeleteAccountError();
              setShowDeleteConfirm(true);
            }}
            className="btn-danger min-h-11 sm:min-h-10 inline-flex items-center justify-center gap-2"
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete account
          </button>
        )}
      </div>

      <GuestLogoutWarningModal
        open={showGuestLogoutWarning}
        onClose={() => setShowGuestLogoutWarning(false)}
        onSaveProgressFirst={() => {
          if (onOpenAuth) onOpenAuth();
        }}
        onLogoutAnyway={handleGuestLogoutAnyway}
        isLoggingOut={isLoggingOut}
      />
      <LogoutConfirmModal
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleConfirmLogout}
        isLoggingOut={isLoggingOut}
      />
      {!isGuest && (
        <DeleteAccountDialog
          open={showDeleteConfirm}
          username={currentUser?.username || ''}
          isDeleting={isDeletingAccount}
          error={deleteAccountError ? toUserMessage(deleteAccountError, "Couldn't delete your account. Try again.") : null}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteAccount}
        />
      )}
      {isDeletingAccount && <AscendLoadingOverlay message="Deleting your account…" submessage="Removing all your data" />}
      {isLoggingOut && <AscendLoadingOverlay message="Logging out…" submessage="Just a moment" />}
    </SettingsCard>
  );
}
