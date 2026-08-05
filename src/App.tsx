import { useState } from 'react';
import { useAppState } from '@/lib/store';
import { AppShell, View } from '@/components/AppShell';
import { Dashboard } from '@/components/views/Dashboard';
import { HabitTracker } from '@/components/views/HabitTracker';
import { Journal } from '@/components/views/Journal';
import { ExerciseTracker } from '@/components/views/ExerciseTracker';
import { ReadingTracker } from '@/components/views/ReadingTracker';
import { SelfImprovementBooks } from '@/components/views/SelfImprovementBooks';
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

import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

function App() {
  const store = useAppState();
  const [view, setView] = useState<View>('dashboard');
  const [userOpenedAuthModal, setUserOpenedAuthModal] = useState(false);

  const currentUser = store.state.currentUser;
  const isUnauthenticated = !currentUser;
  const authModalOpen = isUnauthenticated || userOpenedAuthModal;

  return (
    <>
      <AppShell
        currentView={view}
        onViewChange={setView}
        store={store}
        onOpenAuthModal={() => setUserOpenedAuthModal(true)}
      >
        <ErrorBoundary fallbackTitle="Section Error">
          {view === 'dashboard' && <Dashboard store={store} onViewChange={setView} onOpenAuthModal={() => setUserOpenedAuthModal(true)} />}
          {view === 'habits' && <HabitTracker store={store} />}
          {view === 'journal' && <Journal store={store} />}
          {view === 'exercise' && <ExerciseTracker store={store} />}
          {view === 'reading' && <ReadingTracker store={store} />}
          {view === 'books' && <SelfImprovementBooks store={store} />}
          {view === 'skills' && <SkillTracker store={store} />}
          {view === 'bad-habits' && <BadHabitTracker store={store} />}
          {view === 'recovery' && <AddictionRecovery store={store} />}
          {view === 'prefrontal' && <PrefrontalCortex store={store} />}
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
    </>
  );
}

export default App;

