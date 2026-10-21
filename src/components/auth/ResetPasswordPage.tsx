import { useEffect, useState } from 'react';
import { Check, KeyRound } from 'lucide-react';
import { setRecoveredPassword } from '@/lib/auth';
import { endPasswordRecoverySession, isPasswordRecoverySession, passwordRecoveryLinkError } from '@/lib/supabase';
import { newPasswordProblem } from '@/lib/passwordRules';
import { toUserMessage } from '@/lib/userMessage';
import { settingsSectionPath } from '@/lib/settingsSections';
import { DASHBOARD_PATH } from '@/lib/routes';
import { PasswordInput } from '@/components/ui/PasswordInput';
import { PasswordStaircase } from '@/components/ui/PasswordStaircase';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { AppLockup } from '@/components/ui/AppLogo';
import { Form, FormAlert, focusField, isFinePointer, useFormController } from '@/components/ui/primitives';

export interface ResetPasswordPageProps {
  /** A real (not guest) account is signed in: the reset link's session, or one from before. */
  signedIn: boolean;
  /** Goes to an address on this site; `replace` swaps the history entry. */
  onNavigate: (path: string, replace?: boolean) => void;
}

/** How long "Password changed" shows before the app opens. */
const DONE_MS = 1500;

/**
 * `/reset-password`: where a password-reset email lands. The link signs the user in for this one
 * purpose (Supabase PASSWORD_RECOVERY), so the form asks only for the new password. Without such a
 * session (expired link, opened by hand) it explains and offers a new link instead.
 */
export function ResetPasswordPage({ signedIn, onNavigate }: ResetPasswordPageProps) {
  const [recovery] = useState(() => isPasswordRecoverySession());
  const [linkError] = useState(() => passwordRecoveryLinkError());
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const form = useFormController();

  useEffect(() => {
    const previous = document.title;
    document.title = 'Set a new password · Ascend';
    return () => {
      document.title = previous;
    };
  }, []);

  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => onNavigate(DASHBOARD_PATH, true), DONE_MS);
    return () => clearTimeout(timer);
  }, [done, onNavigate]);

  const validate = () => {
    const problem = newPasswordProblem(password);
    if (problem) return { message: `${problem}.`, field: 'reset-new-password' };
    if (password !== confirm) return { message: 'Passwords don’t match.', field: 'reset-confirm-password' };
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await setRecoveredPassword(password);
      endPasswordRecoverySession();
      setDone(true);
    } catch (err: unknown) {
      console.error('Setting the new password failed:', err);
      const authErr = err as { code?: string; name?: string; message?: string };
      if (authErr.code === 'same_password') {
        form.showError('Use a password different from your current one.', 'reset-new-password');
      } else if (authErr.code === 'weak_password') {
        form.showError(toUserMessage(err, 'Pick a stronger password.'), 'reset-new-password');
      } else if (authErr.code === 'session_not_found' || authErr.name === 'AuthSessionMissingError') {
        form.showError('This reset link has expired. Ask for a new one from the sign-in page.');
      } else {
        form.showError(toUserMessage(err, 'Couldn’t save your new password. Try again.'));
      }
    } finally {
      setSaving(false);
    }
  };

  const canSetPassword = recovery && signedIn && !linkError;
  // When the form appears, a mouse/trackpad user can type the new password at once (touch skips it).
  useEffect(() => {
    if (!canSetPassword || !isFinePointer()) return;
    const field = document.getElementById('reset-new-password');
    if (field) focusField(field);
  }, [canSetPassword]);

  return (
    <main className="relative isolate flex-1 bg-bg-900 flex items-center justify-center px-4 py-10">
      <div aria-hidden="true" className="app-atmosphere" />
      <div className="card w-full max-w-md p-6 sm:p-8 space-y-5">
        <div className="flex">
          <AppLockup className="h-6 w-auto shrink-0 text-content-primary" />
        </div>

        {done ? (
          <div role="status" className="flex flex-col items-center text-center py-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center animate-pop">
              <Check size={26} aria-hidden="true" className="text-success-text" />
            </div>
            <h1 className="mt-4 font-serif text-2xl leading-tight text-content-primary">Password changed</h1>
            <p className="mt-1 text-sm text-content-muted">You’re signed in. Opening Ascend…</p>
          </div>
        ) : canSetPassword ? (
          <>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight text-content-primary">Set a new password</h1>
              <p className="text-sm text-content-muted">Choose a new password for your account. You stay signed in on this device.</p>
            </div>
            <Form onSubmit={handleSubmit} validate={validate} controller={form} alert="manual" className="space-y-3">
              <PasswordInput
                id="reset-new-password"
                label="New password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <PasswordStaircase password={password} />
              <PasswordInput
                id="reset-confirm-password"
                label="Confirm new password"
                required
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              <FormAlert />
              <button type="submit" disabled={saving} className="btn-primary w-full min-h-11">
                {saving ? (
                  <>
                    <AscendLoadingIndicator size="sm" />
                    <span>Saving…</span>
                  </>
                ) : (
                  'Save new password'
                )}
              </button>
            </Form>
          </>
        ) : (
          <>
            <div className="space-y-2">
              <div className="w-11 h-11 rounded-xl bg-overlay-subtle text-content-secondary flex items-center justify-center">
                <KeyRound size={20} aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-content-primary">
                {linkError ? 'This link has expired' : signedIn ? 'You’re already signed in' : 'Open the link from your email'}
              </h1>
              <p className="text-sm text-content-muted">
                {signedIn
                  ? 'To change your password, go to Settings, then Account.'
                  : linkError
                    ? 'Reset links work once and only for a short time. Ask for a new one and use the newest email.'
                    : 'To set a new password, open the reset link from your email. No email? Ask for a new link.'}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {signedIn ? (
                <>
                  <button type="button" onClick={() => onNavigate(settingsSectionPath('account'))} className="btn-primary w-full min-h-11">
                    Open Settings
                  </button>
                  <button type="button" onClick={() => onNavigate(DASHBOARD_PATH)} className="btn-ghost w-full min-h-11 text-xs">
                    Back to Ascend
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={() => onNavigate('/login?forgot=1')} className="btn-primary w-full min-h-11">
                    Send a new link
                  </button>
                  <button type="button" onClick={() => onNavigate('/login')} className="btn-ghost w-full min-h-11 text-xs">
                    Back to sign in
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
