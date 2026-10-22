import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { AppStore } from '@/lib/store';
import { Disclosure, PageColumns } from '@/components/ui/primitives';
import { BarChart } from '@/components/ui/charts';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { formatWeekdayDate, formatWeekdayShort } from '@/lib/dates';
import { lastDayKeys, sumPerDay } from '@/lib/weeklyActivity';
import { PFC_POINTS } from '@/lib/pointsConfig';
import { FocusTimerCard } from './FocusTimerCard';
import { FocusHistory } from './FocusHistory';
import { AboutFocusDialog } from './AboutFocusDialog';

/** Focus tab: the timer card and the session history; chart and rules on the side. */
export function FocusPanel({ store, today }: { store: AppStore; today: string }) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const logs = store.state.focusLogs;
  const days = lastDayKeys(7, today);
  const minutesByDay = sumPerDay(logs, days, (l) => l.durationMinutes);
  const weekTotal = minutesByDay.reduce((sum, m) => sum + m, 0);
  const tiers = [...PFC_POINTS.focus.tiers].reverse();

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
          <Disclosure title="How points work">
            <ul className="list-disc pl-4 space-y-0.5">
              <li>
                {tiers.map((t, i) => (
                  <span key={t.minMinutes}>
                    {i > 0 && ', '}
                    <span className="figure">{t.minMinutes}</span> min = <span className="figure text-success-text">{t.points} pts</span>
                  </span>
                ))}
                , up to <span className="figure">{PFC_POINTS.focus.dailyCap}</span> pts a day.
              </li>
              <li>A session counts when its timer runs out. A discarded session saves nothing.</li>
              <li>Breaks, decisions and emotions earn no points.</li>
              <li>A session that ends while the app is closed is saved for the day it ended. Only today&apos;s sessions earn points.</li>
              <li>Deleting today&apos;s session recounts today&apos;s points. Earlier days keep theirs.</li>
            </ul>
          </Disclosure>
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
