import { useState } from 'react';
import { Tabs } from '@/components/ui/primitives';
import { BarChart } from '@/components/ui/charts';
import { CountUp } from '@/components/ui/Motion';
import { formatWeekdayDate as fullDay, formatWeekdayShort as weekday } from '@/lib/dates';
import type { DayHabits, DayPoints } from '@/lib/weeklyActivity';

type Metric = 'points' | 'habits';

const METRIC_TABS = [
  { id: 'points', label: 'Points' },
  { id: 'habits', label: 'Habits' },
];

interface WeekActivityCardProps {
  /** Last 7 days, oldest first, today last. */
  points: DayPoints[];
  habits: DayHabits[];
}

/**
 * The last seven days at a glance: points (everything that earns, across modules) or daily
 * habits (consistency). Today is the highlighted bar.
 */
export function WeekActivityCard({ points, habits }: WeekActivityCardProps) {
  const [metric, setMetric] = useState<Metric>('points');
  const todayIndex = points.length - 1;

  const earned = points.reduce((sum, d) => sum + d.earned, 0);
  const lost = points.reduce((sum, d) => sum + d.lost, 0);
  const habitsDone = habits.reduce((sum, d) => sum + d.done, 0);
  const habitsTotal = habits.reduce((sum, d) => sum + d.total, 0);
  const habitRate = habitsTotal > 0 ? Math.round((habitsDone / habitsTotal) * 100) : 0;

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">Last 7 days</h2>
        <Tabs
          items={METRIC_TABS}
          value={metric}
          onChange={(id) => setMetric(id as Metric)}
          size="sm"
          ariaLabel="Last 7 days chart"
        />
      </div>

      {metric === 'points' ? (
        <>
          <div className="flex items-baseline gap-1.5">
            <CountUp value={earned} className="text-4xl font-medium leading-none text-content-primary tabular-nums" />
            <span className="text-sm text-content-muted">pts earned</span>
            {lost > 0 && (
              <span className="figure ml-auto text-xs text-warning-text">−{lost.toLocaleString()} penalties</span>
            )}
          </div>
          <BarChart
            data={points.map((d) => ({ label: weekday(d.day), value: d.earned }))}
            label={`Points earned per day, last 7 days: ${earned} total`}
            highlightIndex={todayIndex}
            formatTooltip={(datum, i) => {
              const penalty = points[i].lost > 0 ? ` · −${points[i].lost} penalty` : '';
              return `${fullDay(points[i].day)}: +${datum.value} pts${penalty}`;
            }}
          />
        </>
      ) : habitsTotal === 0 ? (
        <p className="py-8 text-center text-sm text-content-muted">Add a daily habit to see your week here.</p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <CountUp value={habitRate} className="text-4xl font-medium leading-none text-content-primary tabular-nums" />
            <span className="text-sm text-content-muted">% of daily habits done</span>
          </div>
          <BarChart
            data={habits.map((d) => ({ label: weekday(d.day), value: d.done }))}
            label={`Daily habits done per day, last 7 days: ${habitRate}% overall`}
            tone="success"
            highlightIndex={todayIndex}
            max={Math.max(...habits.map((d) => d.total))}
            formatTooltip={(_, i) => `${fullDay(habits[i].day)}: ${habits[i].done}/${habits[i].total} habits`}
          />
        </>
      )}
    </div>
  );
}
