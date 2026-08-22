import { useState } from 'react';
import { useAppState } from '@/lib/store';
import { AppShell, View } from '@/components/AppShell';
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
import { AscendLoadingOverlay } from '@/components/ui/AscendLoadingIndicator';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ToastProvider } from '@/components/ui/Toast';
import { OfflineBanner } from '@/components/ui/OfflineBanner';

function App() {
  const store = useAppState();
  const [view, setView] = useState<View>('dashboard');
  const [userOpenedAuthModal, setUserOpenedAuthModal] = useState(false);

  if (store.isAuthChecking) {
    return (
      <AscendLoadingOverlay
        message="Verifying session..."
        submessage="Preparing your personal growth workspace"
      />
    );
  }

  const currentUser = store.state.currentUser;
  const isUnauthenticated = !currentUser;
  const authModalOpen = isUnauthenticated || userOpenedAuthModal;

  return (
    <ToastProvider>
      <OfflineBanner />
      <AppShell
        currentView={view}
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
          {(view === 'reading' || view === 'books') && <ReadingHub store={store} />}
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
        guestState={store.state}
      />
    </ToastProvider>
  );
}

export default App;

