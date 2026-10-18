import { useMemo, useState } from 'react';
import type { AppStore } from '@/lib/store';
import type { View } from '@/lib/views';
import { addDays, startOfWeek, todayKey } from '@/lib/dates';
import { isFocusDayEntry } from '@/lib/focusAwards';
import { PFC_POINTS } from '@/lib/pointsConfig';
import { Tabs } from '@/components/ui/primitives';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { PageHero } from '@/components/ui/PageHero';
import { CapMeterConnected } from '@/components/ui/CapMeterConnected';
import { FocusPanel } from '@/components/pfc/FocusPanel';
import { FocusReflectionDialog } from '@/components/pfc/FocusReflectionDialog';
import { DecisionJournal } from '@/components/pfc/DecisionJournal';
import { EmotionLabeler } from '@/components/pfc/EmotionLabeler';
import { dueDecisions, localDayOf } from '@/components/pfc/pfcLists';

type PFCTab = 'focus' | 'decisions' | 'emotions';

/** Prefrontal Cortex page: deep focus timer, decision journal, emotion labeling (components/pfc). */
export function PrefrontalCortex({ store, onNavigate }: { store: AppStore; onNavigate?: (view: View) => void }) {
  const [tab, setTab] = useState<PFCTab>('focus');
  const { focusLogs, decisionLogs, emotionLogs, pointsHistory } = store.state;

  const today = todayKey();
  const weekStart = todayKey(startOfWeek());
  const todayFocus = focusLogs.filter((l) => l.date === today);
  const focusMinutesToday = todayFocus.reduce((sum, l) => sum + l.durationMinutes, 0);
  const focusMinutesWeek = focusLogs.filter((l) => l.date >= weekStart && l.date <= today).reduce((sum, l) => sum + l.durationMinutes, 0);
  // Points from the ledger: the server's row for today (or the app's preview of it).
  const pointsToday = useMemo(
    () => pointsHistory.filter((e) => isFocusDayEntry(e, today)).reduce((sum, e) => sum + (Number(e.amount) || 0), 0),
    [pointsHistory, today]
  );
  const dueCount = useMemo(() => dueDecisions(decisionLogs, today).length, [decisionLogs, today]);
  const emotionsWeek = useMemo(() => {
    const from = addDays(today, -6);
    return emotionLogs.filter((l) => localDayOf(l.date) >= from).length;
  }, [emotionLogs, today]);
  const cap = PFC_POINTS.focus.dailyCap;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Prefrontal Cortex</h1>
        <p className="page-subtitle">Deep focus, a decision journal and emotion labeling.</p>
      </div>

      <Reveal index={0}>
        <PageHero
          ariaLabel="Your focus today"
          ring={{
            value: pointsToday,
            max: cap,
            label: `Focus points today: ${pointsToday} of ${cap}`,
            center: (
              <>
                {pointsToday}
                <span className="text-sm font-medium text-content-muted">/{cap}</span>
              </>
            ),
            caption: 'points today',
            tone: 'cyan',
          }}
          lead={{
            label: 'Focus today',
            value: <CountUp value={focusMinutesToday} />,
            hint: `min · ${todayFocus.length} ${todayFocus.length === 1 ? 'session' : 'sessions'}`,
            valueClassName: 'text-cyan-hierarchy',
          }}
          stats={[
            { label: 'This week', value: <CountUp value={focusMinutesWeek} />, hint: 'min of focus', valueClassName: 'text-cyan-hierarchy' },
            { label: 'To revisit', value: <CountUp value={dueCount} />, hint: 'decisions', valueClassName: 'text-purple-hierarchy' },
            { label: 'Emotions', value: <CountUp value={emotionsWeek} />, hint: 'last 7 days', valueClassName: 'text-rose-theme' },
          ]}
          side={<CapMeterConnected state={store.state} capId="pfc" bare />}
        />
      </Reveal>

      <Tabs
        ariaLabel="Prefrontal cortex sections"
        items={[
          { id: 'focus', label: 'Focus' },
          { id: 'decisions', label: 'Decisions', badge: dueCount },
          { id: 'emotions', label: 'Emotions' },
        ]}
        value={tab}
        onChange={(id) => setTab(id as PFCTab)}
      />

      {tab === 'focus' && <FocusPanel store={store} onNavigate={onNavigate} />}
      {tab === 'decisions' && <DecisionJournal store={store} />}
      {tab === 'emotions' && <EmotionLabeler store={store} />}

      <FocusReflectionDialog store={store} />
    </div>
  );
}
