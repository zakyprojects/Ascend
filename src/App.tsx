import { Suspense, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { useAppState } from '@/lib/store';
import { useViewRoute } from '@/lib/useViewRoute';
import { confirmLeave } from '@/lib/unsavedChanges';
import { authPathWithNext, nextFromSearch, pathForAuthRoute, pathForView } from '@/lib/routes';
import { consumeSignOutByUser, logoutUser } from '@/lib/auth';
import type { View } from '@/lib/views';
import { isSupabaseConfigured, storedAuthSession } from '@/lib/supabase';
import { reloadOnceForStaleChunk } from '@/lib/chunkReload';
import { AppShell } from '@/components/AppShell';
import {
  AccountabilityPartner,
  AddictionRecovery,
  BadHabitTracker,
  Dashboard,
  ExerciseTracker,
  HabitTracker,
  ImprovementPlans,
  Journal,
  Leagues,
  Lessons,
  Neuroplasticity,
  PrefrontalCortex,
  ProjectsGoalsView,
  ReadingHub,
  ReportBugView,
  SettingsView,
  SkillTracker,
  SuggestIdeaView,
  TierView,
  TimeTrackerView,
  WeeklyGoalsView,
  prefetchAllViewsWhenIdle,
  preloadView,
} from '@/components/views/lazyViews';
import { PageSkeleton } from '@/components/views/PageSkeleton';
import type { AuthPageProps, AuthScreen } from '@/components/auth/AuthPage';
import { loadedAuthPage, preloadAuthPage } from '@/components/auth/lazyAuthPage';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { Button } from '@/components/ui/primitives';
import { AscendLoadingOverlay, OVERLAY_EXIT_MS } from '@/components/ui/AscendLoadingIndicator';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { TimezoneWaitBanner } from '@/components/ui/TimezoneWaitBanner';
import { DiscardChangesDialog } from '@/components/ui/DiscardChangesDialog';
import { UpdateBanner } from '@/components/ui/UpdateBanner';

function App() {
  const store = useAppState();
  // Page changes wait for the page's code first, so the view transition never shows a fallback.
  const { view, pendingView, auth, search, navigationKind, navigate: setView, goToPath } = useViewRoute(preloadView);

  // The last ordinary page: a bug report or idea starts out about it ("Which page?").
  const [feedbackFromView, setFeedbackFromView] = useState<View>(view);
  if (view !== 'report-bug' && view !== 'suggest-idea' && view !== feedbackFromView) setFeedbackFromView(view);

  // ---- Sign-in pages (/login, /signup) ------------------------------------------------------
  // Signed out: every page goes to /login?next=<page>. A guest (anonymous account) on /login or
  // /signup gets /signup in save-progress mode. Signed in: the sign-in pages go to `next`.
  // Without Supabase (local-only mode) there is no sign-in at all: the app opens on local data.
  const currentUser = store.state.currentUser;
  const isGuest = Boolean(currentUser?.isAnonymous);
  const authReady = !store.isAuthChecking;
  const authGate = isSupabaseConfigured;

  // The success screen holds the page it started on (the user changes under it) until it is done.
  const [authHold, setAuthHold] = useState<AuthScreen | null>(null);
  // Set when a sign-in, sign-up or guest start finishes: the page goes to `next` as soon as the
  // account is loaded (a new guest too, who would otherwise get the save-progress page).
  const [leavingAuth, setLeavingAuth] = useState(false);
  if (leavingAuth && !auth) setLeavingAuth(false);
  let routeScreen: AuthScreen | null = null;
  if (authReady && authGate) {
    if (auth) routeScreen = !currentUser ? auth : isGuest && !leavingAuth ? 'upgrade' : null;
    // A sign-in still loading its data shows the session loader, not the sign-in page.
    else if (!currentUser && !store.isSessionLoading) routeScreen = 'login';
  }
  const authScreen = authHold ?? routeScreen;

  // Redirects, before paint (the page shown above already matches where they go).
  const hadUserRef = useRef(false);
  useLayoutEffect(() => {
    if (!authReady) return;
    const wasSignedIn = hadUserRef.current;
    hadUserRef.current = Boolean(currentUser);
    if (authHold) return;
    let target: string | null = null;
    // A Supabase hash (#access_token=…, #error=…) rides along on redirects to the sign-in pages.
    const authHash = window.location.hash.startsWith('#/') ? '' : window.location.hash;
    if (!authGate) {
      if (auth) target = '/';
    } else if (auth) {
      if (currentUser && (!isGuest || leavingAuth)) target = nextFromSearch(search);
      else if (isGuest && auth === 'login') target = pathForAuthRoute('signup') + search + authHash;
    } else if (!currentUser && !store.isSessionLoading) {
      // Logging out lands on a plain /login; a signed-out visit or an expired session returns to
      // its page after signing in.
      const plain = wasSignedIn && consumeSignOutByUser();
      target = plain ? pathForAuthRoute('login') : authPathWithNext('login', pathForView(view) + search) + authHash;
    }
    if (target) goToPath(target, { replace: true });
  }, [authReady, authGate, authHold, leavingAuth, auth, currentUser, isGuest, search, view, store.isSessionLoading, goToPath]);

  // The sign-in page's code (preloaded behind the splash by main.tsx).
  const [AuthPageView, setAuthPageView] = useState<ComponentType<AuthPageProps> | null>(() => loadedAuthPage());
  const needsAuthPage = authScreen !== null;
  // Set when that code could not load and no reload was started (offline, or already reloaded once):
  // the loader then says so and offers Retry instead of waiting forever.
  const [authPageFailed, setAuthPageFailed] = useState(false);
  useEffect(() => {
    if (!needsAuthPage || AuthPageView) return;
    let cancelled = false;
    preloadAuthPage().then(
      (component) => {
        if (!cancelled) setAuthPageView(() => component);
      },
      () => {
        if (!reloadOnceForStaleChunk() && !cancelled) setAuthPageFailed(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [needsAuthPage, AuthPageView]);

  // Blocking loader: the initial session check (and the sign-in page's code if it is somehow not
  // here yet), then any later sign-in that is still loading the user's data once the success
  // screen is done (never an empty guest view). It stays mounted for its exit animation,
  // revealing the app beneath; state is derived during render so the app never shows a frame
  // without it.
  const showLoader =
    store.isAuthChecking ||
    (needsAuthPage && !AuthPageView) ||
    (store.isSessionLoading && !authHold);
  const [loaderShown, setLoaderShown] = useState(showLoader);
  const [loaderExiting, setLoaderExiting] = useState(false);
  const [loaderKind, setLoaderKind] = useState<'boot' | 'session'>('boot');
  if (loaderShown !== showLoader) {
    setLoaderShown(showLoader);
    setLoaderExiting(loaderShown);
    if (showLoader) setLoaderKind(store.isAuthChecking ? 'boot' : 'session');
  }
  useEffect(() => {
    if (!loaderExiting) return;
    const timer = setTimeout(() => setLoaderExiting(false), OVERLAY_EXIT_MS);
    return () => clearTimeout(timer);
  }, [loaderExiting]);

  // The boot check is still waiting on this device's saved sign-in and the network is not answering:
  // offer a fresh try (a reload starts a new attempt) or, for a real account, signing in afresh.
  // A guest is never offered that: dropping its sign-in would lose the guest account.
  const bootOffline = store.storedSessionWait === 'failed';
  const authPageOffline = !bootOffline && authPageFailed && needsAuthPage && !AuthPageView;
  const offlineActions = authPageOffline ? (
    <Button onClick={() => window.location.reload()}>Retry</Button>
  ) : bootOffline && (
    <>
      <Button onClick={() => window.location.reload()}>Retry</Button>
      {!storedAuthSession()?.isAnonymous && (
        <Button variant="ghost" size="sm" onClick={() => logoutUser({ scope: 'local' }).catch(() => undefined)}>
          Sign in with another account
        </Button>
      )}
    </>
  );

  // Rendered beside the app (not instead of it), so it is not remounted when it starts exiting.
  const loaderOverlay = (showLoader || loaderExiting) && (
    <AscendLoadingOverlay
      message={
        bootOffline || authPageOffline ? "Can't reach Ascend" : loaderKind === 'boot' ? 'Starting up...' : 'Loading your workspace...'
      }
      submessage={
        bootOffline
          ? "Check your connection. You're still signed in."
          : authPageOffline
            ? 'Check your connection and try again.'
            : loaderKind === 'boot'
              ? 'Checking your account'
              : 'Loading your data'
      }
      entrance={loaderKind === 'boot' ? 'boot' : 'fade'}
      exiting={!showLoader}
      actions={offlineActions || undefined}
    />
  );

  // Once the app is on screen, fetch the other pages' code in idle moments. Not behind a sign-in
  // page: a signed-out visitor may never get in, so the download would be wasted.
  const appVisible = !store.isAuthChecking && authScreen === null && !auth;
  useEffect(() => {
    if (appVisible) prefetchAllViewsWhenIdle();
  }, [appVisible]);

  // In-app sign-in buttons: a guest saves progress on /signup, anyone else signs in on /login;
  // both come back to this page afterwards. Unsaved typing asks "Discard changes?" first, like any
  // page change. Local-only mode has no sign-in, so no buttons.
  const openAuth = authGate
    ? () =>
        confirmLeave(() => goToPath(authPathWithNext(currentUser ? 'signup' : 'login', pathForView(view) + search)))
    : undefined;

  // The app itself: not while a sign-in page is up, nor for the one frame a redirect away from
  // a sign-in page takes (signed in, or local-only mode).
  const showApp = authReady && !authScreen && !auth;

  return (
    <>
      {authReady && (
        <ToastProvider>
          <UpdateBanner />
          <OfflineBanner />
          <TimezoneWaitBanner />
          <DiscardChangesDialog />
          {authScreen && AuthPageView && (
            <AuthPageView
              screen={authScreen}
              search={search}
              guestState={store.state}
              onAuthSuccess={() => setAuthHold(authScreen)}
              onDone={() => {
                setAuthHold(null);
                setLeavingAuth(true);
              }}
              onNavigate={(path) => goToPath(path)}
            />
          )}
          {showApp && (
            <AppShell
              currentView={view}
              navigationKind={navigationKind}
              pendingView={pendingView}
              onViewChange={setView}
              store={store}
              onOpenAuth={openAuth}
            >
              <ErrorBoundary fallbackTitle="Section Error">
                <Suspense fallback={<PageSkeleton />}>
                  {view === 'dashboard' && <Dashboard store={store} onViewChange={setView} onOpenAuth={openAuth} />}
                  {view === 'habits' && <HabitTracker store={store} />}
                  {view === 'time-tracker' && <TimeTrackerView store={store} onNavigate={setView} />}
                  {view === 'weekly-goals' && <WeeklyGoalsView store={store} />}
                  {view === 'projects-goals' && (
                    <ProjectsGoalsView
                      store={store}
                      onStartFocusSession={(taskTitle) => {
                        sessionStorage.setItem('ascend_pending_focus_task', taskTitle);
                        setView('prefrontal');
                      }}
                    />
                  )}
                  {view === 'journal' && <Journal store={store} />}
                  {view === 'exercise' && <ExerciseTracker store={store} />}
                  {view === 'reading' && <ReadingHub store={store} />}
                  {view === 'skills' && <SkillTracker store={store} />}
                  {view === 'bad-habits' && <BadHabitTracker store={store} />}
                  {view === 'recovery' && <AddictionRecovery store={store} />}
                  {view === 'prefrontal' && <PrefrontalCortex store={store} onNavigate={setView} />}
                  {view === 'plans' && <ImprovementPlans store={store} />}
                  {view === 'partner' && <AccountabilityPartner store={store} />}
                  {view === 'tiers' && <TierView store={store} />}
                  {view === 'leagues' && <Leagues store={store} onOpenAuth={openAuth} />}
                  {view === 'lessons' && <Lessons store={store} />}
                  {view === 'neuroplasticity' && <Neuroplasticity store={store} onViewChange={setView} />}
                  {view === 'settings' && <SettingsView store={store} onOpenAuth={openAuth} onNavigate={setView} />}
                  {view === 'report-bug' && (
                    <ReportBugView key="bug" kind="bug" store={store} fromView={feedbackFromView} onNavigate={setView} />
                  )}
                  {view === 'suggest-idea' && (
                    <SuggestIdeaView key="idea" kind="idea" store={store} fromView={feedbackFromView} onNavigate={setView} />
                  )}
                </Suspense>
              </ErrorBoundary>
            </AppShell>
          )}

          <ConfirmDeleteModal
            open={Boolean(store.destructiveWipeModal?.open)}
            onClose={store.handleCancelDestructiveWipe}
            onConfirm={store.handleConfirmDestructiveWipe}
            title={store.destructiveWipeModal?.title || 'Confirm data removal'}
            description={store.destructiveWipeModal?.description}
            confirmText="Yes, save changes"
            isDeleting={store.isSavingDestructiveWipe}
          />
        </ToastProvider>
      )}
      {loaderOverlay}
    </>
  );
}

export default App;

