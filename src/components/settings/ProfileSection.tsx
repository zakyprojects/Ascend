import { useEffect, useRef, useState } from 'react';
import { Check, Clock, Copy } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { EMOJI_AVATARS } from '@/types';
import { isUsernameAvailable, updateUsernameWithCooldown, updateUserAvatar } from '@/lib/auth';
import { cx, FieldErrorBubble, FOCUS_RING, Form, Input, useFormController } from '@/components/ui/primitives';
import { AscendLoadingIndicator } from '@/components/ui/AscendLoadingIndicator';
import { useAsyncAction } from '@/lib/useAsyncAction';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import { toUserMessage } from '@/lib/userMessage';
import { trustedNowMs } from '@/lib/clock';
import { useToast } from '@/components/ui/Toast';
import { SettingsCard } from './SettingRow';
import { USERNAME_TAKEN, usernameFormatProblem } from '@/lib/usernameRules';

const COOLDOWN_MS = 24 * 60 * 60 * 1000;

type NameCheck = { state: 'idle' } | { state: 'available' } | { state: 'problem'; message: string };

function cooldownText(msLeft: number): string {
  const totalMin = Math.max(1, Math.ceil(msLeft / 60000));
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return hours > 0 ? `${hours} h ${mins} min` : `${mins} min`;
}

export function ProfileSection({ store }: { store: AppStore }) {
  const currentUser = store.state.currentUser;
  const userId = currentUser?.id || '';
  const savedName = currentUser?.username || '';
  const savedAvatar = currentUser?.avatar || '🧑';
  const { showErrorToast } = useToast();

  // ── Your ID ──
  const [copied, setCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyUid = async () => {
    if (!currentUser?.uid) return;
    try {
      await navigator.clipboard.writeText(currentUser.uid);
      setCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      showErrorToast("Couldn't copy", 'Select the ID instead.');
    }
  };

  // ── Username ──
  // Follows the saved name only when it changes (a rename here or elsewhere), so a switch or a
  // sync refresh never wipes what is being typed (S1).
  const [nameInput, setNameInput] = useState(savedName);
  const [syncedName, setSyncedName] = useState(savedName);
  if (savedName !== syncedName) {
    setSyncedName(savedName);
    setNameInput(savedName);
  }
  const [nameCheck, setNameCheck] = useState<NameCheck>({ state: 'idle' });
  const [nameSaved, setNameSaved] = useState(false);
  const usernameForm = useFormController();
  const { isLoading: isNameSaving, executeFn: executeNameSave } = useAsyncAction();
  useUnsavedChanges(`username:${savedName}`, nameInput.trim());

  const trimmed = nameInput.trim();
  const nameChanged = Boolean(trimmed) && trimmed !== savedName;

  useEffect(() => {
    if (!nameChanged) return;
    const problem = usernameFormatProblem(trimmed);
    if (problem) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await isUsernameAvailable(trimmed, userId).catch(() => ({ available: true, unknown: true }));
      if (cancelled) return;
      // Unknown (offline, server error): no answer here; the server decides on save (S3).
      if ('unknown' in result && result.unknown) setNameCheck({ state: 'idle' });
      else setNameCheck(result.available ? { state: 'available' } : { state: 'problem', message: USERNAME_TAKEN });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmed, nameChanged, userId]);

  // The line under the field: the format rule at once, then the server's answer (S2).
  const formatProblem = nameChanged ? usernameFormatProblem(trimmed) : null;
  const shownCheck: NameCheck = !nameChanged
    ? { state: 'idle' }
    : formatProblem
      ? { state: 'problem', message: formatProblem }
      : nameCheck;

  const lastChangedMs = currentUser?.lastUsernameChangeAt ? new Date(currentUser.lastUsernameChangeAt).getTime() : 0;
  const [nowMs, setNowMs] = useState(() => trustedNowMs());
  const cooldownLeft = lastChangedMs > 0 ? COOLDOWN_MS - (nowMs - lastChangedMs) : 0;
  const isCooldownActive = cooldownLeft > 0;
  // The cooldown counts down while the page is open and frees the field when it ends (S11).
  useEffect(() => {
    if (!isCooldownActive) return;
    const timer = setInterval(() => setNowMs(trustedNowMs()), 30_000);
    return () => clearInterval(timer);
  }, [isCooldownActive]);
  useEffect(() => {
    setNowMs(trustedNowMs());
  }, [lastChangedMs]);

  const handleSaveUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isNameSaving || !nameChanged) return;
    setNameSaved(false);
    if (isCooldownActive) {
      usernameForm.showError(`You can change it again in ${cooldownText(cooldownLeft)}.`, 'settings-username');
      return;
    }
    const problem = usernameFormatProblem(trimmed) ?? (shownCheck.state === 'problem' ? shownCheck.message : null);
    if (problem) {
      usernameForm.showError(problem, 'settings-username');
      return;
    }
    await executeNameSave(async () => {
      try {
        const nowIso = await updateUsernameWithCooldown(userId, trimmed);
        store.updateProfileUsername(trimmed, nowIso);
        setNameSaved(true);
        setNameCheck({ state: 'idle' });
      } catch (err: unknown) {
        usernameForm.showError(toUserMessage(err, "Couldn't change your username. Try again."), 'settings-username');
      }
    });
  };

  const nameHint =
    shownCheck.state === 'problem'
      ? shownCheck.message
      : shownCheck.state === 'available'
        ? 'Available.'
        : nameSaved
          ? 'Username updated.'
          : 'You can change it once every 24 hours.';

  // ── Avatar ──
  const [selectedAvatar, setSelectedAvatar] = useState(savedAvatar);
  const [syncedAvatar, setSyncedAvatar] = useState(savedAvatar);
  const [avatarSaving, setAvatarSaving] = useState(false);
  if (savedAvatar !== syncedAvatar && !avatarSaving) {
    setSyncedAvatar(savedAvatar);
    setSelectedAvatar(savedAvatar);
  }
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (avatarTimer.current) clearTimeout(avatarTimer.current);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    },
    []
  );

  const handleSelectAvatar = async (emoji: string) => {
    if (emoji === savedAvatar || avatarSaving) return;
    const previous = selectedAvatar;
    setSelectedAvatar(emoji);
    setAvatarMsg(null);
    setAvatarError(null);
    // One change at a time: a second tap during the save would race it.
    setAvatarSaving(true);
    try {
      await updateUserAvatar(userId, emoji);
      store.updateProfileAvatar(emoji);
      setAvatarMsg('Avatar updated.');
      if (avatarTimer.current) clearTimeout(avatarTimer.current);
      avatarTimer.current = setTimeout(() => setAvatarMsg(null), 3000);
    } catch (err: unknown) {
      console.error('Failed to update avatar:', err);
      // Not saved: show the avatar that is really on the account, and say why.
      setSelectedAvatar(previous);
      setAvatarError(toUserMessage(err, "Couldn't change your avatar. Try again."));
    } finally {
      setAvatarSaving(false);
    }
  };

  return (
    <SettingsCard title="Profile">
      <div className="flex flex-col gap-3 rounded-xl border border-overlay-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="label">Your ID</p>
          <p className="mt-0.5 text-xs text-content-muted">Share it with friends so they can send you a partner invite.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {currentUser?.uid ? (
            <>
              <span className="font-mono text-sm tracking-widest text-brand-text bg-primary-500/10 px-3 py-1 rounded-lg border border-primary-500/20 select-all">
                {currentUser.uid}
              </span>
              <button
                type="button"
                onClick={copyUid}
                aria-label={copied ? 'ID copied' : 'Copy your ID'}
                className={cx(
                  'inline-flex min-h-9 items-center gap-1 rounded-lg border border-overlay-default px-2.5 py-1 text-xs font-medium text-content-secondary hover:bg-overlay-subtle transition-colors',
                  FOCUS_RING
                )}
              >
                {copied ? <Check size={14} className="text-success-text" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </>
          ) : (
            <span className="font-mono text-sm text-content-muted" aria-label="Your ID is not ready yet">
              —
            </span>
          )}
        </div>
      </div>

      <Form onSubmit={handleSaveUsername} controller={usernameForm} className="space-y-3 border-t border-overlay-subtle pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label id="settings-username-label" htmlFor="settings-username" className="label">
            Username
          </label>
          {isCooldownActive && (
            <span className="badge-neutral inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-micro font-medium">
              <Clock size={12} aria-hidden="true" />
              Next change in {cooldownText(cooldownLeft)}
            </span>
          )}
        </div>
        <Input
          id="settings-username"
          aria-labelledby="settings-username-label"
          required
          disabled={isCooldownActive || isNameSaving}
          value={nameInput}
          onChange={(e) => {
            setNameInput(e.target.value);
            setNameSaved(false);
            setNameCheck({ state: 'idle' });
          }}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
          maxLength={40}
          hint={nameHint}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isCooldownActive || isNameSaving || !nameChanged}
            className="btn-primary min-h-11 sm:min-h-10 w-full sm:w-auto"
          >
            {isNameSaving ? (
              <>
                <AscendLoadingIndicator size="sm" />
                <span>Saving…</span>
              </>
            ) : (
              'Save username'
            )}
          </button>
        </div>
      </Form>

      <div className="space-y-3 border-t border-overlay-subtle pt-4">
        <div className="flex items-center justify-between gap-2">
          <p className="label" id="settings-avatar-label">
            Avatar
          </p>
          {avatarMsg && (
            <span role="status" className="inline-flex items-center gap-1 text-xs font-medium text-success-text">
              <Check size={13} aria-hidden="true" /> {avatarMsg}
            </span>
          )}
        </div>
        <div role="group" aria-labelledby="settings-avatar-label" className="grid grid-cols-6 gap-2 sm:grid-cols-8">
          {EMOJI_AVATARS.map((emoji) => {
            const selected = selectedAvatar === emoji;
            return (
              <button
                key={emoji}
                type="button"
                disabled={avatarSaving}
                onClick={() => handleSelectAvatar(emoji)}
                className={cx(
                  'flex aspect-square min-h-11 w-full items-center justify-center rounded-xl text-xl transition-colors sm:min-h-10',
                  'disabled:cursor-wait',
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
        {avatarError ? (
          <FieldErrorBubble message={avatarError} attached={false} />
        ) : (
          <p className="text-xs text-content-muted">Tap one to use it. It changes everywhere right away.</p>
        )}
      </div>
    </SettingsCard>
  );
}
