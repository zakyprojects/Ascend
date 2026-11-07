import { useState } from 'react';
import { BarChart, Heatmap, ProgressRing, Sparkline } from '@/components/ui/charts';
import { IntroMotionContext } from '@/lib/motion';
import { Button } from '@/components/ui/primitives';
import { Caption, Section } from './shared';
import { CHART_HEAT, CHART_TREND, CHART_WEEK } from './fixtures';

function ChartsDemo() {
  const [run, setRun] = useState(0);
  return (
    <div className="space-y-4">
      <Button size="sm" variant="secondary" onClick={() => setRun((n) => n + 1)}>
        Replay draw-in
      </Button>
      <IntroMotionContext.Provider value={true}>
        <div key={run} className="grid gap-4 md:grid-cols-2">
          <div className="card p-4 space-y-2">
            <Caption>Sparkline</Caption>
            <Sparkline points={CHART_TREND} label="Points, last 14 days" />
          </div>
          <div className="card p-4 space-y-2">
            <Caption>Bar week (today = Sun)</Caption>
            <BarChart data={CHART_WEEK} label="Habits per day this week" highlightIndex={6} />
          </div>
          <div className="card p-4 space-y-2">
            <Caption>12-week heatmap</Caption>
            <Heatmap cells={CHART_HEAT} label="Activity, last 12 weeks" />
          </div>
          <div className="card p-4 flex items-center gap-4">
            <ProgressRing value={64} label="Ring brand" />
            <ProgressRing value={9} max={30} label="Ring success" tone="success">
              <span className="figure text-sm text-content-primary">9d</span>
            </ProgressRing>
            <ProgressRing value={0} label="Ring empty" tone="purple" size={56} thickness={5} />
          </div>
        </div>
      </IntroMotionContext.Provider>
    </div>
  );
}

export function ChartsGroup() {
  return (
    <>
      <Section id="charts">
        <ChartsDemo />
      </Section>
    </>
  );
}
