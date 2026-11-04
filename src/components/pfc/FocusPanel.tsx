import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import type { AppStore } from '@/lib/store';
import { Disclosure, PageColumns } from '@/components/ui/primitives';
import { BarChart } from '@/components/ui/charts';
import { CountUp, Reveal } from '@/components/ui/Motion';
import { formatWeekdayDate, formatWeekdayShort } from '@/lib/dates';
import { lastDayKeys, sumPerDay } from '@/lib/weeklyActivity';
import { PFC_POINTS } from '@/lib/pointsConfig';
import {
  FOCUS_FINISH_BONUS,
  FOCUS_FIRST_MILESTONE_POINTS,
  FOCUS_MILESTONES,
  FOCUS_MIN_MINUTES,
  FOCUS_STEP_MINUTES,
  FOCUS_STEP_POINTS,
} from '@/lib/focusPoints';
import { FOCUS_PRESETS, FOCUS_RESUME_WINDOW_MINUTES, focusFinishedPoints } from './focusSession';
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
                <span className="figure text-success-text">{FOCUS_FIRST_MILESTONE_POINTS} pts</span> at{' '}
                <span className="figure">{FOCUS_MIN_MINUTES}</span> min of focus, then{' '}
                <span className="figure text-success-text">+{FOCUS_STEP_POINTS}</span> every{' '}
                <span className="figure">{FOCUS_STEP_MINUTES}</span> min up to {FOCUS_MILESTONES[FOCUS_MILESTONES.length - 1]} min.
              </li>
              <li>
                Finish the length you planned:{' '}
                {FOCUS_FINISH_BONUS.slice()
                  .reverse()
                  .map((b, i) => (
                    <span key={b.minPlanned}>
                      {i > 0 && ', '}
                      <span className="figure text-success-text">+{b.points}</span> for <span className="figure">{b.minPlanned}</span> min or more
                    </span>
                  ))}
                . So {FOCUS_PRESETS.map((p) => p.focus).join(' / ')} min give {FOCUS_PRESETS.map((p) => focusFinishedPoints(p.focus)).join(' / ')} pts.
              </li>
              <li>
                Up to <span className="figure">{PFC_POINTS.focus.dailyCap}</span> pts a day, counted on the day each point is reached.
              </li>
              <li>Paused time does not count. Closing the app or logging out pauses the session too.</li>
              <li>
                Resume within {FOCUS_RESUME_WINDOW_MINUTES} min. After that the session ends at the pause: saved from{' '}
                {FOCUS_MIN_MINUTES} min, dropped below.
              </li>
              <li>From {FOCUS_MIN_MINUTES} min you can Complete early and keep your points. Before that, Discard saves nothing.</li>
              <li>Breaks, decisions and emotions earn no points.</li>
              <li>Only today&apos;s sessions earn points. Deleting today&apos;s session recounts today; earlier days keep theirs.</li>
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
