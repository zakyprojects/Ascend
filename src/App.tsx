import { useEffect, useState } from 'react';
import { useAppState } from '@/lib/store';
import { useViewRoute } from '@/lib/useViewRoute';
import { AppShell } from '@/components/AppShell';
import { Dashboard } from '@/components/views/Dashboard';
import { HabitTracker } from '@/components/views/HabitTracker';
import { TimeTrackerView } from '@/components/views/TimeTrackerView';
import { WeeklyGoalsView } from '@/components/views/WeeklyGoalsView';
import { ProjectsGoalsView } from '@/components/views/ProjectsGoalsView';
import { Journal } from '@/components/views/Journal';
import { ExerciseTracker } from '@/components/views/ExerciseTracker';
import { ReadingHub } from '@/components/views/ReadingHub';
import { SkillTracker } from '@/components/views/SkillTracker';
import { BadHabitTracker } from '@/components/views/BadHabitTracker';
import { AddictionRecovery } from '@/components/views/AddictionRecovery';
import { PrefrontalCortex } from '@/components/views/PrefrontalCortex';
import { TierView } from '@/components/views/TierView';
import { Leagues } from '@/components/views/Leagues';
import { Lessons } from '@/components/views/Lessons';
import { Neuroplasticity } from '@/components/views/Neuroplasticity';
import { ImprovementPlans } from '@/components/views/ImprovementPlans';
import { AccountabilityPartner } from '@/components/views/AccountabilityPartner';
import { SettingsView } from '@/components/views/SettingsView';
import { AuthModal } from '@/components/ui/AuthModal';
import { ConfirmDeleteModal } from '@/components/ui/ConfirmDeleteModal';
import { AscendLoadingOverlay, OVERLAY_EXIT_MS } from '@/components/ui/AscendLoadingIndicator';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { UpdateBanner } from '@/components/ui/UpdateBanner';

function App() {
  const store = useAppState();
  const { view, navigationKind, navigate: setView } = useViewRoute();
  const [userOpenedAuthModal, setUserOpenedAuthModal] = useState(false);

  // Blocking loader: the initial session check, then any later sign-in that is still loading
  // the user's data once the auth modal's success screen is done (never an empty guest view).
  // It stays mounted for its exit animation, revealing the app beneath; state is derived
  // during render so the app never shows a frame without it.
  const showLoader = store.isAuthChecking || (store.isSessionLoading && !userOpenedAuthModal);
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

  // Rendered beside the app (not instead of it), so it is not remounted when it starts exiting.
  const loaderOverlay = (showLoader || loaderExiting) && (
    <AscendLoadingOverlay
      message={loaderKind === 'boot' ? 'Verifying session...' : 'Loading your workspace...'}
      submessage={loaderKind === 'boot' ? 'Checking your account' : 'Syncing your data'}
      entrance={loaderKind === 'boot' ? 'boot' : 'fade'}
      exiting={!showLoader}
    />
  );

  const currentUser = store.state.currentUser;
  const isUnauthenticated = !currentUser;
  const authModalOpen = isUnauthenticated || userOpenedAuthModal;

  return (
    <>
      {!store.isAuthChecking && (
        <ToastProvider>
          <UpdateBanner />
          <OfflineBanner />
          <AppShell
            currentView={view}
            navigationKind={navigationKind}
            onViewChange={setView}
            store={store}
            onOpenAuthModal={() => setUserOpenedAuthModal(true)}
          >
            <ErrorBoundary fallbackTitle="Section Error">
              {view === 'dashboard' && <Dashboard store={store} onViewChange={setView} onOpenAuthModal={() => setUserOpenedAuthModal(true)} />}
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
              {view === 'leagues' && <Leagues store={store} onOpenAuthModal={() => setUserOpenedAuthModal(true)} />}
              {view === 'lessons' && <Lessons store={store} />}
              {view === 'neuroplasticity' && <Neuroplasticity onViewChange={setView} />}
              {view === 'settings' && <SettingsView store={store} onOpenAuthModal={() => setUserOpenedAuthModal(true)} />}
            </ErrorBoundary>
          </AppShell>

          <AuthModal
            open={authModalOpen}
            onClose={() => setUserOpenedAuthModal(false)}
            onAuthSuccess={() => setUserOpenedAuthModal(true)}
            guestState={store.state}
          />

          <ConfirmDeleteModal
            open={Boolean(store.destructiveWipeModal?.open)}
            onClose={store.handleCancelDestructiveWipe}
            onConfirm={store.handleConfirmDestructiveWipe}
            title={store.destructiveWipeModal?.title || 'Confirm Data Removal'}
            description={store.destructiveWipeModal?.description}
            confirmText="Yes, Save Changes"
            isDeleting={store.isSavingDestructiveWipe}
          />
        </ToastProvider>
      )}
      {loaderOverlay}
    </>
  );
}

export default App;

