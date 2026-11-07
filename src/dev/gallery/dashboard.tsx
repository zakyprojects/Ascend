import { Activity, BookMarked, Clock, HeartPulse, ShieldAlert, Timer, Zap } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { LeagueRow, ModuleLink } from './appCopies';
import { AscentProfile } from '@/components/views/AscentProfile';
import { exerciseAmountText, minutesText } from '@/lib/exerciseSummary';
import { TIERS } from '@/lib/tiers';
import type { View } from '@/lib/views';
import { Caption, Section } from './shared';

// Dashboard parts with fake values. ModuleLink and LeagueRow are copies of the Dashboard's own
// (unexported) components, see appCopies.tsx.

function useFakeNavigate() {
  const { showInfoToast } = useToast();
  return (view: View) => showInfoToast('Open page', `In the app this opens ${view}.`);
}

function ModuleTilesDemo() {
  const navigate = useFakeNavigate();
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Caption>Every tone, with this week&apos;s values (one line under sm, a tile from sm)</Caption>
        <div className="grid gap-2 sm:gap-3 sm:[grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
          <ModuleLink
            tone="emerald"
            icon={Activity}
            title="Exercise"
            view="exercise"
            navigate={navigate}
            value={4}
            unit="workouts this week"
            sub={`Running · ${exerciseAmountText(7.5, 'km')} · +2 more`}
          />
          <ModuleLink tone="amber" icon={BookMarked} title="Reading" view="reading" navigate={navigate} value={2} unit="books in progress" sub="5 finished" />
          <ModuleLink tone="purple" icon={Zap} title="Skills" view="skills" navigate={navigate} value={12.5} unit="hrs total" sub="3 skills tracked" />
          <ModuleLink tone="rose" icon={ShieldAlert} title="Bad habits" view="bad-habits" navigate={navigate} value={2} unit="resisted today" sub="3 tracked" />
          <ModuleLink tone="red" icon={HeartPulse} title="Recovery" view="recovery" navigate={navigate} value={41} unit="days clean" sub="No sugar" />
          <ModuleLink tone="cyan" icon={Timer} title="Focus" view="prefrontal" navigate={navigate} value={145} unit="min this week" sub="6 sessions this week" />
          <ModuleLink tone="indigo" icon={Clock} title="Time Tracker" view="time-tracker" navigate={navigate} value="6h 30m" unit="planned today" sub="3 done, 1 skipped of 7" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Caption>Empty and long values: no workouts, not started, a long sub line, a long exercise amount</Caption>
        <div className="grid gap-2 sm:gap-3 sm:[grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))]">
          <ModuleLink tone="emerald" icon={Activity} title="Exercise" view="exercise" navigate={navigate} value="No workouts" unit="this week" sub="Log a workout to see your week" />
          <ModuleLink tone="red" icon={HeartPulse} title="Recovery" view="recovery" navigate={navigate} value="Not started" sub="Start a clean streak" />
          <ModuleLink
            tone="rose"
            icon={ShieldAlert}
            title="Bad habits"
            view="bad-habits"
            navigate={navigate}
            value={0}
            unit="resisted today"
            sub="No bad habits tracked"
          />
          <ModuleLink
            tone="emerald"
            icon={Activity}
            title="Exercise"
            view="exercise"
            navigate={navigate}
            value={12}
            unit="workouts this week"
            sub={`A very long exercise name for the tile · ${exerciseAmountText(1250, 'reps')} · ${minutesText(135)} · +4 more`}
          />
        </div>
      </div>
    </div>
  );
}

function LeagueSummaryDemo() {
  const navigate = useFakeNavigate();
  return (
    <div className="max-w-md space-y-1.5">
      <Caption>Weekly ready (#2), Monthly loading, Season failed; then no points yet</Caption>
      <div className="card overflow-hidden p-0">
        <ul className="divide-y divide-overlay-subtle">
          <LeagueRow type="weekly" rank={2} points={412} status="ready" navigate={navigate} />
          <LeagueRow type="monthly" rank={0} points={1240} status="loading" navigate={navigate} />
          <LeagueRow type="ninetyDay" rank={0} points={1840} status="failed" navigate={navigate} />
          <LeagueRow type="weekly" rank={0} points={0} status="ready" navigate={navigate} />
        </ul>
      </div>
    </div>
  );
}

function AscentProfileDemo() {
  const points = [0, TIERS[2].minPoints + 120, TIERS[TIERS.length - 1].minPoints + 500];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {points.map((p) => (
        <div key={p} className="space-y-1.5">
          <Caption>{p.toLocaleString()} season points</Caption>
          <div className="card p-4">
            <AscentProfile totalPoints={p} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardGroup() {
  return (
    <>
      <Section id="module-tiles">
        <ModuleTilesDemo />
      </Section>

      <Section id="league-summary">
        <LeagueSummaryDemo />
      </Section>

      <Section id="ascent-profile">
        <AscentProfileDemo />
      </Section>
    </>
  );
}
