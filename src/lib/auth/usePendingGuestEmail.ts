import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from './supabase';

/**
 * The email a guest added with "Save progress" that still waits for its link (Supabase keeps it
 * in `new_email` and the account a guest until the link is opened). Null for anyone else.
 */
export function pendingGuestEmailOf(user: Pick<User, 'is_anonymous' | 'new_email'> | null | undefined): string | null {
  if (!user?.is_anonymous) return null;
  const email = user.new_email?.trim();
  return email ? email : null;
}

/**
 * The signed-in guest's pending email, kept current with the session: it shows right after
 * "Save progress" (USER_UPDATED), after a reload (INITIAL_SESSION) and clears once the link made the
 * account a member (TOKEN_REFRESHED). Read on a guest only.
 */
export function usePendingGuestEmail(isGuest: boolean): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    if (!isGuest || !isSupabaseConfigured) return;
    // Subscribing replays the current session (INITIAL_SESSION), so no separate read is needed.
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setEmail(pendingGuestEmailOf(session?.user)));
    return () => data.subscription.unsubscribe();
  }, [isGuest]);
  return isGuest ? email : null;
}
