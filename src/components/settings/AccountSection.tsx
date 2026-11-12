import { useEffect, useState } from 'react';
import { LogOut, Trash2 } from 'lucide-react';
import { AppStore } from '@/lib/store/store';
import { accountHasPassword, changeUserPassword, resendConfirmationEmail, startGoogleDeleteReauth, takeGoogleDeleteReauth, WrongCurrentPasswordError } from '@/lib/auth/auth';
import { withCaptcha } from '@/lib/auth/captcha';
import { usePendingGuestEmail } from '@/lib/auth/usePendingGuestEmail';
import { settingsSectionPath } from '@/lib/settingsSections';
import { verifyAccountPassword } from '@/lib/auth/supabase';
import { newPasswordProblem } from '@/lib/auth/passwordRules';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordStaircase } from '@/components/ui/PasswordStaircase';
import { GuestLogoutWarningModal } from '@/components/ui/GuestLogoutWarningModal';
import { LogoutConfirmModal } from '@/components/ui/LogoutConfirmModal';
import { Button, Form, FormAlert, Input, focusStillInForm, useFocusOnRender, useFormController } from '@/components/ui/primitives';
import { AscendLoadingIndicator, AscendLoadingOverlay } from '@/components/ui/AscendLoadingIndicator';
import { useAsyncAction } from '@/lib/actions/useAsyncAction';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';
import { useToast } from '@/components/ui/Toast';
import { SettingRow, SettingsCard } from './SettingRow';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { CaptchaSlot } from '@/components/ui/CaptchaSlot';

interface AccountSectionProps {
  store: AppStore;
  onOpenAuth?: () => void;
}

export function AccountSection({ store, onOpenAuth }: AccountSectionProps) {
  const currentUser = store.state.currentUser;
  const isGuest = Boolean(currentUser?.isAnonymous);
  const userId = currentUser?.id;
  const { showSuccessToast, showErrorToast, showWarningToast } = useToast();

  // A Google-only account has no password: no Change password, and Delete confirms through Google.
  // Unknown (null) until read for this account, so neither shows the wrong way in the meantime.
  const [passwordCheck, setPasswordCheck] = useState<{ userId: string | undefined; hasPassword: boolean } | null>(null);
  const hasPassword = passwordCheck && passwordCheck.userId === userId ? passwordCheck.hasPassword : null;
  useEffect(() => {
    let cancelled = false;
    void accountHasPassword().then((yes) => {
      if (!cancelled) setPasswordCheck({ userId, hasPassword: yes });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // ── Guest with a "Save progress" email waiting for its link ──
  const pendingEmail = usePendingGuestEmail(isGuest);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const resendLink = async () => {
    if (!pendingEmail || resendState !== 'idle') return;
    setResendState('sending');
    try {
      await withCaptcha('sign_up', (captchaToken) => resendConfirmationEmail(pendingEmail, 'email_change', captchaToken));
      setResendState('sent');
      showSuccessToast('Link sent again', `Check ${pendingEmail} (and spam).`);
    } catch (err) {
      console.error('Save-progress link resend failed:', err);
      setResendState('idle');
      const authErr = err as { code?: string; status?: number; message?: string };
      const limited = authErr.code === 'over_email_send_rate_limit' || authErr.status === 429 || authErr.message?.includes('rate limit');
      showErrorToast("Couldn't send the link", limited ? 'Too many emails right now. Try again in about an hour.' : toUserMessage(err, 'Try again.'));
    }
  };

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
  // Back from Google's check for this account: the dialog reopens ready to delete.
  const [googleConfirmed, setGoogleConfirmed] = useState(false);
  // Back without a finished check (cancelled at Google, Back, or reopened later): the dialog says so.
  const [googleNotice, setGoogleNotice] = useState<string | null>(null);
  // Supabase starts the trip to Google with location.assign and returns at once, so the button
  // stays busy until the page leaves; a Back from Google (page restored from cache) frees it.
  const [openingGoogle, setOpeningGoogle] = useState(false);
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setOpeningGoogle(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);
  useEffect(() => {
    if (!userId) return;
    // Not cancelled on cleanup: the mark is read once, and a second effect run would find it gone.
    void takeGoogleDeleteReauth(userId).then((result) => {
      if (result === 'confirmed') {
        setGoogleNotice(null);
        setGoogleConfirmed(true);
        setShowDeleteConfirm(true);
      } else if (result === 'not-finished') {
        setGoogleNotice('The Google check didn’t finish. Continue with Google again.');
        setShowDeleteConfirm(true);
      } else if (result === 'other-account') {
        // Another Google account was picked at Google: this is that account, so nothing was deleted.
        showWarningToast(
          'Signed in with a different Google account',
          'Nothing was deleted. To delete your other account, log out and sign in to it first.'
        );
      }
    });
  }, [userId, showWarningToast]);

  const handleDeleteAccount = async (password: string) => {
    setGoogleNotice(null);
    if (hasPassword === null) return;
    if (!hasPassword) {
      try {
        await executeDeleteAccount(async () => {
          if (!googleConfirmed) {
            if (!userId) throw new Error("Couldn't start the Google check. Try again.");
            setOpeningGoogle(true);
            try {
              await startGoogleDeleteReauth(userId, settingsSectionPath('account'));
            } catch (err) {
              setOpeningGoogle(false);
              throw err;
            }
            return;
          }
          try {
            await store.deleteAccount();
          } catch (err) {
            // Past the server's 5 minutes: the Google check has to be done again.
            setGoogleConfirmed(false);
            if (err instanceof Error && err.message.includes('password again')) {
              throw new Error('The Google check expired. Continue with Google again.');
            }
            throw err;
          }
        });
      } catch (err) {
        console.error('Account deletion failed in Settings:', err);
        return;
      }
      if (googleConfirmed) setShowDeleteConfirm(false);
      return;
    }
    try {
      await executeDeleteAccount(async () => {
        if (!currentUser?.email) throw new Error("Couldn't check your password. Try again.");
        if ((await verifyAccountPassword(currentUser.email, password)) === 'wrong') {
          throw new WrongCurrentPasswordError();
        }
        // The password check stays outside the delete: a wrong password must not hold back saves.
        await store.deleteAccount();
      });
    } catch (err) {
      console.error('Account deletion failed in Settings:', err);
      return;
    }
    setShowDeleteConfirm(false);
  };

  return (
    <SettingsCard title="Account">
      <Input id="settings-email" label="Email" readOnly value={currentUser?.email || (isGuest ? 'Guest (no email)' : '')} className="text-content-muted" />
      {pendingEmail && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-content-muted">
            Waiting for you to open the link sent to <span className="break-words font-medium text-content-secondary">{pendingEmail}</span>. Your progress is saved to it once you do.
          </p>
          <Button variant="secondary" size="sm" onClick={resendLink} disabled={resendState !== 'idle'} className="shrink-0">
            {resendState === 'sending' ? (
              <>
                <AscendLoadingIndicator size="sm" />
                <span>Sending…</span>
              </>
            ) : resendState === 'sent' ? (
              'Sent'
            ) : (
              'Resend link'
            )}
          </Button>
          <CaptchaSlot />
        </div>
      )}

      {!isGuest && hasPassword === true && (
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
              {/* Tells password managers which saved login this password change is for. */}
              <input type="hidden" autoComplete="username" value={currentUser?.email || ''} readOnly />
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
              <CaptchaSlot />
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
        {!isGuest && hasPassword !== null && (
          <button
            type="button"
            onClick={() => {
              resetDeleteAccountError();
              setGoogleNotice(null);
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
      {!isGuest && hasPassword !== null && (
        <DeleteAccountDialog
          open={showDeleteConfirm}
          username={currentUser?.username || ''}
          email={currentUser?.email || ''}
          isDeleting={isDeletingAccount || openingGoogle}
          error={deleteAccountError ? toUserMessage(deleteAccountError, "Couldn't delete your account. Try again.") : googleNotice}
          errorOnPassword={deleteAccountError instanceof WrongCurrentPasswordError}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDeleteAccount}
          confirmWith={hasPassword ? 'password' : 'google'}
          googleConfirmed={googleConfirmed}
        />
      )}
      {isDeletingAccount && (hasPassword || googleConfirmed) && <AscendLoadingOverlay message="Deleting your account…" submessage="Removing all your data" />}
      {isLoggingOut && <AscendLoadingOverlay message="Logging out…" submessage="Just a moment" />}
    </SettingsCard>
  );
}
