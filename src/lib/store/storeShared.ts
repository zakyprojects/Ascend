// Two small pieces of useAppState that its action hooks also use, moved out of store.ts unchanged
// (only `export` added) so a hook can import them without importing store.ts.
import type { NotificationPreferenceKey } from '@/types';

/** The on/off UserProfile settings the Settings switches write to the profile row. */
export type ProfileSwitchKey = NotificationPreferenceKey | 'isProfilePublic' | 'acceptPartnerInvites';

export function dispatchToastError(title: string, message?: string) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app-toast-error', {
        detail: { title, message },
      })
    );
  }
}
