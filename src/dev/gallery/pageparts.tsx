import { useState } from 'react';
import { IntroMotionContext } from '@/lib/motion';
import { Plus, Inbox } from 'lucide-react';
import { Button, Card, EmptyState, ProgressBar, Skeleton, type ProgressTone } from '@/components/ui/primitives';
import { WeekActivityCard } from '@/components/views/WeekActivityCard';
import { PageSkeleton } from '@/components/views/PageSkeleton';
import { lastDayKeys } from '@/lib/time/weeklyActivity';
import { ProgressUpdateDialog, UpdateProgressButton } from '@/components/ui/ProgressUpdateDialog';
import { PageHero } from '@/components/ui/PageHero';
import { CapMeter } from '@/components/ui/CapMeter';
import { Gain, HowItWorksButton, HowItWorksDialog, useHowItWorks, type HowItWorksGuide } from '@/components/ui/HowItWorks';
import { Caption, Section } from './shared';
import { wait } from './util';

function SkeletonDemo() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {[0, 1].map((i) => (
        <div key={i} className="card p-4 space-y-3">
          <Skeleton className="h-5 w-24 rounded-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-8 w-32 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

const PROGRESS_TONES: ProgressTone[] = ['brand', 'success', 'warning', 'purple', 'cyan'];

function ProgressDemo() {
  const [pages, setPages] = useState(120);
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState(0);
  const target = 320;
  return (
    <div className="space-y-6">
      <IntroMotionContext.Provider value={true}>
        <div key={run} className="space-y-4">
          <div className="space-y-2">
            <Caption>Tones (md)</Caption>
            {PROGRESS_TONES.map((tone, i) => (
              <ProgressBar key={tone} value={20 + i * 18} label={`Tone ${tone}`} tone={tone} />
            ))}
          </div>
          <div className="space-y-2">
            <Caption>Sizes sm, md, lg, and a marker at 60%</Caption>
            <ProgressBar value={45} label="Small" size="sm" />
            <ProgressBar value={45} label="Medium" size="md" />
            <ProgressBar value={45} label="Large" size="lg" marker={{ at: 60, label: 'Where you should be today' }} />
          </div>
        </div>
      </IntroMotionContext.Provider>
      <Button size="sm" variant="secondary" onClick={() => setRun((n) => n + 1)}>
        Replay fill
      </Button>

      <div className="card p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="item-name">Atomic Habits</p>
            <p className="text-xs text-content-muted">
              <span className="figure">{pages}</span> of <span className="figure">{target}</span> pages
            </p>
          </div>
          <UpdateProgressButton onClick={() => setOpen(true)} />
        </div>
        <ProgressBar value={pages} max={target} label="Pages read" tone={pages >= target ? 'success' : 'brand'} />
      </div>
      <ProgressUpdateDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Update progress"
        description="Atomic Habits"
        current={pages}
        target={target}
        format={(n) => `${n} ${n === 1 ? 'page' : 'pages'}`}
        addLabel="Pages read since last time"
        setLabel="Total pages read"
        onSave={async (next) => {
          await wait(500);
          setPages(next);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page parts: header, hero, points meter, columns
// ---------------------------------------------------------------------------

function PagePartsDemo() {
  const [earned, setEarned] = useState(18);
  const guide = useHowItWorks();
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Caption>Page header (.page-header, .page-title, one .page-subtitle, actions drop under the title on phones)</Caption>
        <div className="page-header">
          <div>
            <h1 className="page-title">Habits</h1>
            <p className="page-subtitle">Tick off today’s habits and keep your streaks going.</p>
          </div>
          <div className="page-header-actions">
            <button type="button" className="btn-secondary">
              Library
            </button>
            <button type="button" className="btn-primary">
              <Plus size={16} aria-hidden="true" />
              Add habit
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>
          PageHero with ring, lead number, stats and a CapMeter beside it. Pages pass CapMeterConnected bare (it reads the store); this is the
          same CapMeter with fake numbers. How points work opens How it works at Points.
        </Caption>
        <PageHero
          ariaLabel="Today’s habits"
          ring={{ value: 4, max: 6, label: 'Habits done today', center: '4/6', caption: 'today' }}
          lead={{ label: 'Current streak', value: '12 days', hint: 'Best 21 days' }}
          stats={[
            { label: 'This week', value: '82%', hint: '23 of 28' },
            { label: 'Points today', value: `+${earned}`, valueClassName: 'text-brand-text' },
            { label: 'Missed', value: '1', hint: 'yesterday' },
          ]}
          side={
            <CapMeter
              variant="bar"
              label="Habit points today"
              earned={earned}
              cap={30}
              onExplain={guide.showPoints}
            />
          }
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEarned((n) => Math.min(30, n + 4))}>
            Earn 4 pts (pop, cap celebrates)
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEarned(18)}>
            Reset
          </Button>
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>PageHero without ring or side; CapMeter slots variant</Caption>
        <HowItWorksDialog open={guide.open} onClose={guide.close} guide={DEMO_GUIDE} focus={guide.focus} />
        <PageHero ariaLabel="Reading" lead={{ label: 'Pages this week', value: '214' }} stats={[{ label: 'Books open', value: '2' }]} />
        <div className="card max-w-sm p-4">
          <CapMeter variant="slots" label="Workouts this week" earned={2} cap={3} slotsUsed={2} slotsTotal={3} />
        </div>
      </div>
    </div>
  );
}

const DEMO_GUIDE: HowItWorksGuide = {
  title: 'How this page works',
  intro: 'One plain line on what the page is for.',
  steps: [
    { title: 'First part', text: 'What it does, in one or two short lines, like a real page.' },
    { title: 'Second part', text: 'How it links to another page, with at most two short examples.' },
    { title: 'Third part', text: 'A rule the user has to know before they start.' },
  ],
  notes: ['Deleting today’s entry takes its points back. Earlier days keep theirs.'],
  points: [
    <>Every 12 min = <Gain>1 pt</Gain>, up to 10 pts a day.</>,
    'Numbers come from the points constants, never typed by hand.',
  ],
};

function HowItWorksDemo() {
  const guide = useHowItWorks();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Skills</h1>
        <p className="page-subtitle">Practice what you’re learning. Your hours build each skill’s level.</p>
        <HowItWorksButton onClick={guide.show} />
      </div>
      <div className="card max-w-sm p-4">
        <CapMeter variant="bar" label="Skill points today" earned={4} cap={10} onExplain={guide.showPoints} />
      </div>
      <HowItWorksDialog open={guide.open} onClose={guide.close} guide={DEMO_GUIDE} focus={guide.focus} />
    </div>
  );
}

// Seven fake days ending today: points earned and lost, habits done of due.
function WeekActivityDemo() {
  const days = lastDayKeys(7);
  const earned = [12, 30, 8, 0, 22, 41, 17];
  const lost = [0, 4, 0, 6, 0, 0, 2];
  const done = [3, 5, 2, 0, 4, 6, 3];
  return (
    <div className="max-w-xl">
      <WeekActivityCard
        points={days.map((day, i) => ({ day, earned: earned[i], lost: lost[i] }))}
        habits={days.map((day, i) => ({ day, done: done[i], total: 6 }))}
      />
    </div>
  );
}

export function PagePartsGroup() {
  return (
    <>
      <Section id="page-parts">
        <PagePartsDemo />
      </Section>

      <Section id="how-it-works">
        <HowItWorksDemo />
      </Section>

      <Section id="progress">
        <ProgressDemo />
      </Section>

      <Section id="week-activity">
        <WeekActivityDemo />
      </Section>

      <Section id="empty-states">
        <div className="space-y-6">
          <EmptyState
            icon={Inbox}
            title="No items yet"
            description="Items you add will appear here."
            action={<Button size="sm">Add item</Button>}
          />
          <div className="rounded-xl border border-overlay-subtle p-6">
            <EmptyState
              surface={false}
              icon={Inbox}
              title="No items yet"
              description="Items you add will appear here."
              action={<Button size="sm">Add item</Button>}
            />
          </div>
          <EmptyState size="sm" title="Nothing to show" description="Small text-only variant." />
          <Card padding="md">
            <EmptyState size="sm" surface={false} title="Empty inside a card" />
          </Card>
        </div>
      </Section>

      <Section id="skeletons">
        <div className="space-y-6">
          <SkeletonDemo />
          <div className="space-y-1.5">
            <Caption>PageSkeleton (views/PageSkeleton): the lazy page fallback, shaped like a page</Caption>
            <div className="rounded-xl border border-dashed border-overlay-default p-4">
              <PageSkeleton />
            </div>
          </div>
        </div>
      </Section>
    </>
  );
}
