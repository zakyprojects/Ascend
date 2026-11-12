// Profile and settings actions of useAppState (username, avatar, theme pick, rank-up and release-note
// marks, profile switches), moved out of store.ts unchanged. useAppState calls this hook once, at the same
// place, and destructures the members (their places in its return object are not side by side).
import { useCallback } from 'react';
import type { AppState, NotificationPreferenceKey, RankCelebrated } from '@/types';
import { mergeRankCelebrated } from '../leagues/rankCelebration';
import { mergeLastSeenRelease } from '../content/whatsNew';
import { dispatchToastError } from '../store/storeShared';
import type { ProfileSwitchKey } from '../store/storeShared';
import { updateProfilePrivacy, updateProfileAcceptPartnerInvites, updateProfileNotificationPreferences } from '../auth/auth';
import { trustedNow } from '../time/clock';
import { toUserMessage } from '../userMessage';
import { applyTheme, resolveTheme, setLocalThemePreference } from '../theme';
import type { ThemePreference } from '../theme';
import type { StoreSetState } from '../store/storeSetState';

export function useProfileActions(setState: StoreSetState, get: () => AppState, stateRef: { current: AppState }) {
  const setUsername = useCallback((username: string) => {
    setState((prev) => ({
      ...prev,
      username,
      currentUser: prev.currentUser ? { ...prev.currentUser, username } : null,
    }));
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateProfileUsername = useCallback((newUsername: string, lastChangedAt?: string) => {
    const timestamp = lastChangedAt || trustedNow().toISOString();
    setState(
      (prev) => {
        if (!prev.currentUser) return prev;
        const updatedUser = {
          ...prev.currentUser,
          username: newUsername,
          lastUsernameChangeAt: timestamp,
        };
        return {
          ...prev,
          currentUser: updatedUser,
          username: newUsername,
        };
      },
      { immediate: true }
    );
  }, [setState]);

  const updateProfileAvatar = useCallback((newAvatar: string) => {
    setState((prev) => {
      if (!prev.currentUser) return prev;
      const updatedUser = {
        ...prev.currentUser,
        avatar: newAvatar,
      };
      return {
        ...prev,
        currentUser: updatedUser,
      };
    });
    // False positive: setState/enqueuePersist/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The user's own pick ('system' = follow the device again), stamped so it syncs to every device. */
  const setThemePreference = useCallback((theme: ThemePreference) => {
    setLocalThemePreference(theme);
    applyTheme(resolveTheme(theme));
    setState(
      (prev) => ({
        ...prev,
        themePreference: theme,
        themeUpdatedAt: trustedNow().toISOString(),
      }),
      { immediate: true }
    );
  }, [setState]);

  /** Header / account menu switch: the other theme than the one on screen, as the user's pick. */
  const toggleThemePreference = useCallback(() => {
    setThemePreference(resolveTheme(stateRef.current.themePreference) === 'light' ? 'dark' : 'light');
  }, [setThemePreference]);

  /** Rank-up memory (lib/rankCelebration), saved at once so a reload or another device never shows it again. */
  const setRankCelebrated = useCallback(
    (memory: RankCelebrated) => {
      setState((prev) => ({ ...prev, rankCelebrated: mergeRankCelebrated(prev.rankCelebrated, memory) }), { immediate: true });
    },
    [setState]
  );

  /** Release-note seen mark (lib/whatsNew), saved at once so a reload or another device never pops it up again. */
  const setLastSeenRelease = useCallback(
    (id: number) => {
      setState((prev) => ({ ...prev, lastSeenRelease: mergeLastSeenRelease(prev.lastSeenRelease, id) }), { immediate: true });
    },
    [setState]
  );

  // Flips one on/off profile setting: the switch moves at once, and if the profile write fails
  // it moves back and says so, so a switch never shows a setting the server does not hold.
  const flipProfileSwitch = useCallback(
    async (key: ProfileSwitchKey, write: (userId: string, value: boolean) => Promise<void>) => {
      const current = get().currentUser;
      if (!current?.id) return;
      const nextSetting = !(current[key] ?? true);
      const apply = (value: boolean) =>
        setState(
          (prev) => ({
            ...prev,
            currentUser: prev.currentUser ? { ...prev.currentUser, [key]: value } : null,
          }),
          { immediate: true }
        );

      apply(nextSetting);
      try {
        await write(current.id, nextSetting);
      } catch (err) {
        apply(!nextSetting);
        dispatchToastError("Couldn't change this setting", toUserMessage(err, 'Check your connection and try again.'));
      }
    },
    // False positive: setState/get are stable (useCallback with empty deps array)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const toggleProfilePrivacy = useCallback(
    () => flipProfileSwitch('isProfilePublic', updateProfilePrivacy),
    [flipProfileSwitch]
  );

  const toggleAcceptPartnerInvites = useCallback(
    () => flipProfileSwitch('acceptPartnerInvites', updateProfileAcceptPartnerInvites),
    [flipProfileSwitch]
  );

  const toggleNotificationPreference = useCallback(
    (key: NotificationPreferenceKey) =>
      flipProfileSwitch(key, (userId, value) => updateProfileNotificationPreferences(userId, { [key]: value })),
    [flipProfileSwitch]
  );

  return {
    setRankCelebrated,
    setLastSeenRelease,
    setUsername,
    updateProfileUsername,
    updateProfileAvatar,
    setThemePreference,
    toggleThemePreference,
    toggleProfilePrivacy,
    toggleAcceptPartnerInvites,
    toggleNotificationPreference,
  };
}
