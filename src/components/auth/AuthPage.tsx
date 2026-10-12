import { useEffect, useRef } from 'react';
import { AppState } from '@/types';
import { AuthPanel, AuthPanelMode, authPanelTitle } from '@/components/ui/AuthPanel';
import { authPathWithNext, nextFromSearch } from '@/lib/routes';

/** The screens of the sign-in pages: /login, /signup, and /signup for a guest (save progress). */
export type AuthScreen = AuthPanelMode;

const DOCUMENT_TITLES: Record<AuthScreen, string> = {
  login: 'Sign in · Ascend',
  signup: 'Create account · Ascend',
  upgrade: 'Save your progress · Ascend',
};

export interface AuthPageProps {
  screen: AuthScreen;
  /** The address bar's query; its `next` is where the user goes after signing in. */
  search: string;
  guestState: AppState;
  /** Called as the success screen starts; App keeps this page up until onDone. */
  onAuthSuccess: () => void;
  onDone: () => void;
  /** Follows an in-app link (a new history entry). */
  onNavigate: (path: string) => void;
}

/**
 * The /login and /signup pages, outside the app shell. For now they show the same panel the
 * sign-in dialog showed (its visual design comes in a later pass).
 */
export function AuthPage({ screen, search, guestState, onAuthSuccess, onDone, onNavigate }: AuthPageProps) {
  const next = nextFromSearch(search);
  const links = {
    login: authPathWithNext('login', next),
    signup: authPathWithNext('signup', next),
    dismiss: next,
  };

  useEffect(() => {
    document.title = DOCUMENT_TITLES[screen];
  }, [screen]);

  // As the dialog did: with a mouse/keyboard the first text field takes focus so typing can start
  // at once; touch skips it (the on-screen keyboard would cover the page before the user chose).
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.matchMedia('(pointer: fine)').matches) return;
    panelRef.current?.querySelector<HTMLInputElement>('input:not([type="hidden"]):not([type="checkbox"]):not([disabled])')?.focus();
  }, []);

  return (
    <div className="relative isolate min-h-dvh bg-bg-900 flex items-center justify-center p-3 sm:p-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div aria-hidden="true" className="app-atmosphere" />
      <main
        ref={panelRef}
        aria-labelledby="auth-page-title"
        className="modal-panel relative w-full max-w-md bg-bg-800 border border-bg-700 rounded-2xl shadow-xl"
      >
        <div className="border-b border-bg-700">
          <div className="px-4 py-3.5 sm:py-4">
            <h1 id="auth-page-title" className="min-w-0 text-base sm:text-lg font-semibold text-content-primary">
              {authPanelTitle(screen)}
            </h1>
          </div>
        </div>
        <div className="p-4">
          <AuthPanel
            mode={screen}
            onAuthSuccess={onAuthSuccess}
            onDone={onDone}
            guestState={guestState}
            pageLinks={{ ...links, navigate: onNavigate }}
          />
        </div>
      </main>
    </div>
  );
}
