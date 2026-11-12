import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { AppStore } from '@/lib/store/store';
import { PageColumns } from '@/components/ui/primitives';
import { BarChart } from '@/components/ui/charts';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { formatWeekdayDate, formatWeekdayShort } from '@/lib/time/dates';
import { lastDayKeys, sumPerDay } from '@/lib/time/weeklyActivity';
import { FocusTimerCard } from './FocusTimerCard';
import { FocusHistory } from './FocusHistory';
import { AboutFocusDialog } from './AboutFocusDialog';

/** Focus tab: the timer card and the session history; chart and About deep focus on the side (rules: the page's How it works). */
export function FocusPanel({ store, today }: { store: AppStore; today: string }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const logs = store.state.focusLogs;
  const days = lastDayKeys(7, today);
  const minutesByDay = sumPerDay(logs, days, (l) => l.durationMinutes);
  const weekTotal = minutesByDay.reduce((sum, m) => sum + m, 0);

  return (
    <PageColumns
      lead={<FocusTimerCard store={store} />}
      aside={
        <>
          {logs.length > 0 && (
            <Reveal index={1} className="card p-4 space-y-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="section-title">Last 7 days</h2>
                <span className="figure text-xs text-content-muted">
                  <CountUp value={weekTotal} /> min
                </span>
              </div>
              <BarChart
                data={days.map((day, i) => ({ label: formatWeekdayShort(day), value: minutesByDay[i] }))}
                label={`Focus minutes per day, last 7 days: ${weekTotal} total`}
                highlightIndex={days.length - 1}
                formatTooltip={(datum, i) => `${formatWeekdayDate(days[i])}: ${datum.value} min`}
              />
            </Reveal>
          )}
          <button type="button" onClick={() => setAboutOpen(true)} className="btn-ghost min-h-10 text-xs text-content-muted hover:text-content-primary">
            <HelpCircle size={16} aria-hidden="true" />
            <span>About deep focus</span>
          </button>
          <AboutFocusDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />
        </>
      }
    >
      <FocusHistory store={store} today={today} />
    </PageColumns>
  );
}
