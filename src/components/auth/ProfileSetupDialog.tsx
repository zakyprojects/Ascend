import { useEffect, useState } from 'react';
import { AppStore } from '@/lib/store/store';
import { EMOJI_AVATARS } from '@/types';
import { clearProfileSetupDue, isUsernameAvailable, updateUsernameWithCooldown, updateUserAvatar } from '@/lib/auth/auth';
import { cx, Dialog, Form, FOCUS_RING, Input, useFormController } from '@/components/ui/primitives';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { useAsyncAction } from '@/lib/actions/useAsyncAction';
import { toUserMessage } from '@/lib/userMessage';
import { USERNAME_TAKEN, usernameFormatProblem } from '@/lib/auth/usernameRules';

type NameCheck = { state: 'idle' } | { state: 'available' } | { state: 'problem'; message: string };

/**
 * Shown once to a new "Continue with Google" account (its name came from the email, its avatar is
 * the default): choose a username and an avatar, or skip. Either way it does not come back; both
 * stay changeable in Settings. A rename here starts the usual 24-hour username cooldown.
 */
export function ProfileSetupDialog({ store, onClose }: { store: AppStore; onClose: () => void }) {
  const currentUser = store.state.currentUser;
  const userId = currentUser?.id || '';
  const savedName = currentUser?.username || '';
  const savedAvatar = currentUser?.avatar || '🧑';

  const [nameInput, setNameInput] = useState(savedName);
  const [avatar, setAvatar] = useState(savedAvatar);
  const [nameCheck, setNameCheck] = useState<NameCheck>({ state: 'idle' });
  const form = useFormController();
  const { isLoading: saving, executeFn } = useAsyncAction();

  const trimmed = nameInput.trim();
  const nameChanged = Boolean(trimmed) && trimmed !== savedName;

  useEffect(() => {
    if (!nameChanged || usernameFormatProblem(trimmed)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await isUsernameAvailable(trimmed, userId).catch(() => ({ available: true, unknown: true }));
      if (cancelled) return;
      // Unknown (offline, server error): no answer here; the server decides on save.
      if ('unknown' in result && result.unknown) setNameCheck({ state: 'idle' });
      else setNameCheck(result.available ? { state: 'available' } : { state: 'problem', message: USERNAME_TAKEN });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, nameChanged, userId]);

  const formatProblem = nameChanged ? usernameFormatProblem(trimmed) : null;
  const shownCheck: NameCheck = !nameChanged ? { state: 'idle' } : formatProblem ? { state: 'problem', message: formatProblem } : nameCheck;
  const nameHint =
    shownCheck.state === 'problem'
      ? shownCheck.message
      : shownCheck.state === 'available'
        ? 'Available.'
        : 'This is how others see you in leagues. After this, you can change it once every 24 hours.';

  const finish = () => {
    clearProfileSetupDue(userId);
    onClose();
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    if (!trimmed) {
      form.showError('Choose a username.', 'profile-setup-username');
      return;
    }
    const problem = formatProblem ?? (shownCheck.state === 'problem' ? shownCheck.message : null);
    if (problem) {
      form.showError(problem, 'profile-setup-username');
      return;
    }
    await executeFn(async () => {
      try {
        if (avatar !== savedAvatar) {
          await updateUserAvatar(userId, avatar);
          store.updateProfileAvatar(avatar);
        }
        if (nameChanged) {
          const nowIso = await updateUsernameWithCooldown(userId, trimmed);
          store.updateProfileUsername(trimmed, nowIso);
        }
        finish();
      } catch (err: unknown) {
        form.showError(toUserMessage(err, "Couldn't save your profile. Try again."), 'profile-setup-username');
      }
    });
  };

  return (
    <Dialog
      open
      onClose={finish}
      preventClose={saving}
      title="Make it yours"
      description="Pick the username and avatar others see in leagues."
      footer={
        <>
          <button type="button" disabled={saving} onClick={finish} className="btn-secondary">
            Skip
          </button>
          <button type="submit" form="profile-setup-form" disabled={saving} className="btn-primary">
            {saving ? <AscendLoadingIndicator size="sm" /> : null}
            <span>{saving ? 'Saving…' : 'Save'}</span>
          </button>
        </>
      }
    >
      <Form id="profile-setup-form" onSubmit={handleSave} controller={form} className="space-y-4">
        <Input
          id="profile-setup-username"
          label="Username"
          required
          disabled={saving}
          value={nameInput}
          onChange={(e) => {
            setNameInput(e.target.value);
            setNameCheck({ state: 'idle' });
          }}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
          maxLength={40}
          hint={nameHint}
        />
        <div className="space-y-2">
          <p className="label" id="profile-setup-avatar-label">
            Avatar
          </p>
          <div role="group" aria-labelledby="profile-setup-avatar-label" className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {EMOJI_AVATARS.map((emoji) => {
              const selected = avatar === emoji;
              return (
                <button
                  key={emoji}
                  type="button"
                  disabled={saving}
                  onClick={() => setAvatar(emoji)}
                  className={cx(
                    'flex aspect-square min-h-11 w-full items-center justify-center rounded-xl text-xl transition-colors sm:min-h-10',
                    selected ? 'bg-primary-500/15 ring-1 ring-primary-500/40' : 'hover:bg-overlay-subtle',
                    FOCUS_RING
                  )}
                  aria-label={`Avatar ${emoji}`}
                  aria-pressed={selected}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </div>
      </Form>
    </Dialog>
  );
}
