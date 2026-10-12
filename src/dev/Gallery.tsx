import React, { useState, useEffect } from 'react';
import { BarChart, Heatmap, ProgressRing, Sparkline } from '@/components/ui/charts';
import { IntroMotionContext } from '@/lib/motion';
import {
  Plus,
  Inbox,
  Home,
  Target,
  BookOpen,
  Activity,
  Zap,
  Brain,
  Clock,
  Users,
  Trophy,
  Settings,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Input,
  NavItem,
  NavSection,
  Select,
  Tabs,
  Textarea,
  type BadgeTone,
  type TabItem,
} from '../components/ui/primitives';
import { AscendLoadingIndicator, AscendLoadingOverlay } from '../components/ui/AscendLoadingIndicator';

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <Card padding="lg" className="space-y-4">
      <h2 className="text-lg font-display font-bold text-content-primary">
        {title}
      </h2>
      {children}
    </Card>
  );
}

const buttonVariants: Array<'primary' | 'secondary' | 'ghost' | 'danger'> = [
  'primary',
  'secondary',
  'ghost',
  'danger',
];

const LOADER_SIZES: Array<'sm' | 'md' | 'lg' | 'xl'> = ['sm', 'md', 'lg', 'xl'];

const LOADER_SURFACES: Array<{ label: string; className: string }> = [
  { label: 'primary', className: 'bg-primary-500 text-on-brand' },
  { label: 'danger', className: 'bg-rose-600 text-white' },
  { label: 'surface', className: 'bg-bg-800 border border-bg-700 text-content-secondary' },
  { label: 'page', className: 'bg-bg-900 border border-bg-700 text-content-secondary' },
];

const TONES: BadgeTone[] = [
  'neutral',
  'emerald',
  'amber',
  'purple',
  'cyan',
  'rose',
  'blue',
  'sky',
  'teal',
  'orange',
  'indigo',
  'violet',
  'season',
  'beta',
];

function DialogDemo() {
  const [basicOpen, setBasicOpen] = useState(false);
  const [longOpen, setLongOpen] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);
  const [nestedAOpen, setNestedAOpen] = useState(false);
  const [nestedBOpen, setNestedBOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setBasicOpen(true)}>
          Basic dialog
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setLongOpen(true)}>
          Long scrolling dialog
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setLockedOpen(true)}>
          preventClose dialog
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setNestedAOpen(true)}>
          Nested dialogs
        </Button>
      </div>

      {/* Basic */}
      <Dialog
        open={basicOpen}
        onClose={() => setBasicOpen(false)}
        title="Basic dialog"
      >
        <div className="space-y-4">
          <p className="text-sm text-content-secondary">
            This is a standard dialog with autofocus on the input below.
          </p>
          <Input label="Autofocus field" data-autofocus />
          <Button size="sm" onClick={() => setBasicOpen(false)}>
            Done
          </Button>
        </div>
      </Dialog>

      {/* Long */}
      <Dialog
        open={longOpen}
        onClose={() => setLongOpen(false)}
        title="Long scrolling dialog"
      >
        <div className="space-y-3">
          {Array.from({ length: 40 }, (_, i) => (
            <p key={i} className="text-sm text-content-secondary">
              {`Filler paragraph ${i + 1} - scroll test.`}
            </p>
          ))}
          <Button size="sm" onClick={() => setLongOpen(false)}>
            Close
          </Button>
        </div>
      </Dialog>

      {/* Locked */}
      <Dialog
        open={lockedOpen}
        onClose={() => setLockedOpen(false)}
        title="preventClose dialog"
        preventClose
      >
        <div className="space-y-4">
          <p className="text-sm text-content-secondary">
            No X, no Escape, no backdrop close.
          </p>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setLockedOpen(false)}
          >
            Close me
          </Button>
        </div>
      </Dialog>

      {/* Nested A */}
      <Dialog
        open={nestedAOpen}
        onClose={() => setNestedAOpen(false)}
        title="Nested A"
      >
        <div className="space-y-4">
          <p className="text-sm text-content-secondary">
            Nested Dialog A is open.
          </p>
          <Button size="sm" onClick={() => setNestedBOpen(true)}>
            Open B
          </Button>
        </div>
      </Dialog>

      {/* Nested B */}
      <Dialog
        open={nestedBOpen}
        onClose={() => setNestedBOpen(false)}
        title="Nested B"
      >
        <div className="space-y-4">
          <p className="text-sm text-content-secondary">
            Press Escape: only B should close. Press it again: A closes.
          </p>
          <Button size="sm" onClick={() => setNestedBOpen(false)}>
            Close B
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

const setA: TabItem[] = [
  { id: 'a1', label: 'Overview' },
  { id: 'a2', label: 'Activity' },
  { id: 'a3', label: 'Stats' },
  { id: 'a4', label: 'Settings' },
];

const setB: TabItem[] = [
  { id: 'b1', label: 'Habits', icon: Zap },
  { id: 'b2', label: 'Bad Habits', icon: Target, badge: 3 },
  { id: 'b3', label: 'Exercise', icon: Activity },
  { id: 'b4', label: 'Reading', icon: BookOpen },
  { id: 'b5', label: 'Skills', icon: Brain },
  { id: 'b6', label: 'Time' },
  { id: 'b7', label: 'Weekly', badge: 12 },
  { id: 'b8', label: 'Projects' },
  { id: 'b9', label: 'Journal' },
  { id: 'b10', label: 'Plans' },
];

function TabsDemo() {
  const [tab1, setTab1] = useState('a1');
  const [tab2, setTab2] = useState('a1');
  const [tab3, setTab3] = useState('a1');
  const [tab4, setTab4] = useState('b1');
  const [tab5, setTab5] = useState('b1');

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <p className="text-xs text-content-muted">segmented md</p>
        <Tabs
          ariaLabel="Segmented md tabs"
          variant="segmented"
          size="md"
          items={setA}
          value={tab1}
          onChange={setTab1}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-content-muted">underline md</p>
        <Tabs
          ariaLabel="Underline md tabs"
          variant="underline"
          size="md"
          items={setA}
          value={tab2}
          onChange={setTab2}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-content-muted">segmented sm</p>
        <Tabs
          ariaLabel="Segmented sm tabs"
          variant="segmented"
          size="sm"
          items={setA}
          value={tab3}
          onChange={setTab3}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-content-muted">segmented md scrollable</p>
        <div className="w-[320px]">
          <Tabs
            ariaLabel="Segmented md scrollable tabs"
            variant="segmented"
            size="md"
            scrollable
            items={setB}
            value={tab4}
            onChange={setTab4}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-content-muted">underline md scrollable</p>
        <div className="w-[320px]">
          <Tabs
            ariaLabel="Underline md scrollable tabs"
            variant="underline"
            size="md"
            scrollable
            items={setB}
            value={tab5}
            onChange={setTab5}
          />
        </div>
      </div>
    </div>
  );
}

function NavDemo() {
  const [frame1Active, setFrame1Active] = useState('Dashboard');
  const [frame2Active, setFrame2Active] = useState('Dashboard');

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <p className="text-xs text-content-muted">row layout (desktop sidebar)</p>
        <div className="w-[256px] space-y-1 rounded-xl border border-overlay-subtle bg-bg-800 p-2">
          <NavSection label="Track" />
          <NavItem
            icon={Home}
            label="Dashboard"
            active={frame1Active === 'Dashboard'}
            onClick={() => setFrame1Active('Dashboard')}
          />
          <NavItem
            icon={Target}
            label="Habits"
            badgeCount={3}
            active={frame1Active === 'Habits'}
            onClick={() => setFrame1Active('Habits')}
          />
          <NavItem
            icon={Zap}
            label="Skills"
            active={frame1Active === 'Skills'}
            onClick={() => setFrame1Active('Skills')}
          />
          <NavSection label="Mind" />
          <NavItem
            icon={Brain}
            label="Neuro"
            active={frame1Active === 'Neuro'}
            onClick={() => setFrame1Active('Neuro')}
          />
          <NavItem
            icon={BookOpen}
            label="Journal"
            active={frame1Active === 'Journal'}
            onClick={() => setFrame1Active('Journal')}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs text-content-muted">stack layout (mobile bottom bar)</p>
        <div className="w-[390px] max-w-full rounded-xl border border-overlay-subtle bg-bg-800 px-1 py-1.5 flex items-center justify-around">
          <NavItem
            layout="stack"
            icon={Home}
            label="Dashboard"
            active={frame2Active === 'Dashboard'}
            onClick={() => setFrame2Active('Dashboard')}
          />
          <NavItem
            layout="stack"
            icon={Activity}
            label="Track"
            active={frame2Active === 'Track'}
            onClick={() => setFrame2Active('Track')}
          />
          <NavItem
            layout="stack"
            icon={Brain}
            label="Mind"
            active={frame2Active === 'Mind'}
            onClick={() => setFrame2Active('Mind')}
          />
          <NavItem
            layout="stack"
            icon={Clock}
            label="Plan"
            badgeCount={1}
            active={frame2Active === 'Plan'}
            onClick={() => setFrame2Active('Plan')}
          />
          <NavItem
            layout="stack"
            icon={Trophy}
            label="Play"
            active={frame2Active === 'Play'}
            onClick={() => setFrame2Active('Play')}
          />
        </div>
      </div>
    </div>
  );
}

// Charts kit demo. Intro motion is forced on so the draw-in can be replayed here.
const CHART_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => ({
  label,
  value: [3, 5, 2, 6, 4, 0, 1][i],
}));
const CHART_TREND = [120, 135, 128, 150, 170, 165, 190, 210, 205, 230, 250, 245, 270, 300].map((value, i) => ({
  label: `Day ${i + 1}`,
  value,
}));
// 12 weeks, starting mid-week (two empty leading cells), deterministic values.
const CHART_HEAT = [null, null, ...Array.from({ length: 82 }, (_, i) => {
  const value = (i * 7) % 11 < 3 ? 0 : ((i * 5) % 6) + 1;
  return { label: `Day ${i + 1}: ${value}`, value };
})];

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
            <p className="text-micro text-content-muted">Sparkline</p>
            <Sparkline points={CHART_TREND} label="Points, last 14 days" />
          </div>
          <div className="card p-4 space-y-2">
            <p className="text-micro text-content-muted">Bar week (today = Sun)</p>
            <BarChart data={CHART_WEEK} label="Habits per day this week" highlightIndex={6} />
          </div>
          <div className="card p-4 space-y-2">
            <p className="text-micro text-content-muted">12-week heatmap</p>
            <Heatmap cells={CHART_HEAT} label="Activity, last 12 weeks" />
          </div>
          <div className="card p-4 flex items-center gap-4">
            <ProgressRing value={64} label="Ring brand" />
            <ProgressRing value={9} max={30} label="Ring success" tone="success">
              <span className="font-display text-sm font-bold text-content-primary">9d</span>
            </ProgressRing>
            <ProgressRing value={0} label="Ring empty" tone="purple" size={56} thickness={5} />
          </div>
        </div>
      </IntroMotionContext.Provider>
    </div>
  );
}

export function Gallery() {
  const [theme, setTheme] = useState<string>(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') || 'dark';
    }
    return 'dark';
  });

  const [bodyOverflow, setBodyOverflow] = useState<string>(() => {
    if (typeof document !== 'undefined') {
      return document.body.style.overflow || '""';
    }
    return '""';
  });

  const [cardClicks, setCardClicks] = useState<number>(0);
  const [bodyFont, setBodyFont] = useState<'inter' | 'geist'>('inter');

  useEffect(() => {
    const interval = setInterval(() => {
      setBodyOverflow(document.body.style.overflow || '""');
    }, 300);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (bodyFont === 'geist') {
      const link = document.createElement('link');
      link.id = 'gallery-geist-font';
      link.rel = 'stylesheet';
      link.href =
        'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap';
      document.head.appendChild(link);
      return () => {
        const existing = document.getElementById('gallery-geist-font');
        if (existing) {
          existing.remove();
        }
      };
    }
  }, [bodyFont]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('ascend_theme_preference', next);
    } catch {
      // ignore
    }
    setTheme(next);
  };

  return (
    <div className="min-h-screen bg-bg-900 text-content-secondary p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-10">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-overlay-subtle">
          <h1 className="text-xl font-display font-bold text-content-primary">
            Ascend primitives gallery (DEV only)
          </h1>
          <div className="flex items-center gap-4">
            <Button variant="secondary" size="sm" onClick={toggleTheme}>
              Toggle theme ({theme})
            </Button>
            <span className="text-xs text-content-muted font-mono">
              body overflow: {bodyOverflow}
            </span>
          </div>
        </div>

        {/* Section 1: Buttons */}
        <Section title="Buttons">
          <div className="space-y-6">
            {buttonVariants.map((variant) => (
              <div key={variant} className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                  {variant}
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant={variant} size="sm">
                    sm default
                  </Button>
                  <Button variant={variant} size="sm" disabled>
                    sm disabled
                  </Button>
                  <Button variant={variant} size="sm" loading>
                    sm loading
                  </Button>
                  <Button variant={variant} size="md">
                    md default
                  </Button>
                  <Button variant={variant} size="md" disabled>
                    md disabled
                  </Button>
                  <Button variant={variant} size="md" loading>
                    md loading
                  </Button>
                  <Button variant={variant} size="icon" aria-label="Add">
                    <Plus size={16} />
                  </Button>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-4 pt-4 border-t border-overlay-subtle">
              <div className="w-[280px]">
                <Button fullWidth>fullWidth in w-[280px]</Button>
              </div>
              <div className="w-[200px]">
                <Button>Very long button label that overflows container</Button>
              </div>
            </div>
          </div>
        </Section>

        {/* Section: Loaders */}
        <Section title="Loaders">
          <div className="space-y-6">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                AscendLoadingIndicator sizes (sm is used everywhere today)
              </p>
              <div className="flex flex-wrap items-end gap-6">
                {LOADER_SIZES.map((size) => (
                  <div key={size} className="flex flex-col items-center gap-1.5">
                    <AscendLoadingIndicator size={size} />
                    <span className="text-micro text-content-muted font-mono">{size}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                sm on coloured surfaces
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {LOADER_SURFACES.map(({ label, className }) => (
                  <div key={label} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${className}`}>
                    <AscendLoadingIndicator size="sm" />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                Page load: 1) pre-React splash (index.html) then 2) Verifying session (React)
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <iframe
                    key={theme}
                    src="/?splash-preview"
                    title="Pre-React splash preview"
                    className="w-full h-[420px] rounded-xl border border-bg-700"
                  />
                  <p className="text-micro text-content-muted">
                    1. index.html shell, shown before the JS bundle parses
                  </p>
                </div>
                <div className="space-y-1">
                  {/* transform makes the fixed overlay fill this box instead of the viewport */}
                  <div className="relative h-[420px] overflow-hidden rounded-xl border border-bg-700 [transform:translateZ(0)]">
                    <AscendLoadingOverlay
                      message="Verifying session..."
                      submessage="Checking your account"
                    />
                  </div>
                  <p className="text-micro text-content-muted">
                    2. AscendLoadingOverlay while the session is checked
                  </p>
                </div>
              </div>
              <p className="text-micro text-content-muted">
                Both should look identical, so there is no jump between them. Reduced motion: glint stops, swoosh pulses.
              </p>
            </div>
          </div>
        </Section>

        {/* Section: Button vs .btn-* comparison */}
        <Section title="Button vs .btn-* (legacy left / Button right)">
          <div className="space-y-6">
            {/* 1. Default md */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                1. Default md (.btn-* vs Button)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle">
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">Legacy .btn-*</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="btn-primary">Primary</button>
                    <button className="btn-secondary">Secondary</button>
                    <button className="btn-ghost">Ghost</button>
                    <button className="btn-danger">Danger</button>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">Primitive &lt;Button&gt;</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary">Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="danger">Danger</Button>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Small */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                2. Small (.btn-* text-xs py-1.5 px-3 vs Button size="sm")
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle">
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">Legacy .btn-* text-xs py-1.5 px-3</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button className="btn-primary text-xs py-1.5 px-3">Primary</button>
                    <button className="btn-secondary text-xs py-1.5 px-3">Secondary</button>
                    <button className="btn-ghost text-xs py-1.5 px-3">Ghost</button>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">Primitive &lt;Button size="sm"&gt;</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="primary" size="sm">Primary</Button>
                    <Button variant="secondary" size="sm">Secondary</Button>
                    <Button variant="ghost" size="sm">Ghost</Button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Header pattern */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                3. Header pattern (Icon + text)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle">
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">Legacy "btn-primary flex items-center gap-2"</span>
                  <button className="btn-primary flex items-center gap-2">
                    <Plus size={18} />
                    <span>Add Item</span>
                  </button>
                </div>
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">Primitive &lt;Button variant="primary"&gt;</span>
                  <Button variant="primary">
                    <Plus size={18} />
                    <span>Add Item</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* 4. Disabled */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                4. Disabled state
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle">
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">Legacy disabled</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button disabled className="btn-primary">Disabled Primary</button>
                    <button disabled className="btn-secondary">Disabled Secondary</button>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">Primitive &lt;Button disabled&gt;</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button disabled variant="primary">Disabled Primary</Button>
                    <Button disabled variant="secondary">Disabled Secondary</Button>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Override REAL PATTERN A */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                5. Override REAL PATTERN A: "text-xs py-1.5 px-3"
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle">
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">Legacy "btn-secondary text-xs py-1.5 px-3"</span>
                  <button className="btn-secondary text-xs py-1.5 px-3">Pattern A</button>
                </div>
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">&lt;Button variant="secondary" className="text-xs py-1.5 px-3"&gt;</span>
                  <Button variant="secondary" className="text-xs py-1.5 px-3">Pattern A</Button>
                </div>
              </div>
            </div>

            {/* 6. Override REAL PATTERN B */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                6. Override REAL PATTERN B: "text-xs flex items-center gap-2"
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle">
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">Legacy "btn-secondary text-xs flex items-center gap-2"</span>
                  <button className="btn-secondary text-xs flex items-center gap-2">
                    <Plus size={16} />
                    <span>Pattern B</span>
                  </button>
                </div>
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">&lt;Button variant="secondary" className="text-xs"&gt;</span>
                  <Button variant="secondary" className="text-xs">
                    <Plus size={16} />
                    <span>Pattern B</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* 7. Override REAL PATTERN C */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                7. Override REAL PATTERN C: "text-2xs py-0.5 px-2"
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle">
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">Legacy "btn-secondary text-2xs py-0.5 px-2"</span>
                  <button className="btn-secondary text-2xs py-0.5 px-2">Micro C</button>
                </div>
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">&lt;Button variant="secondary" className="text-2xs py-0.5 px-2"&gt;</span>
                  <Button variant="secondary" className="text-2xs py-0.5 px-2">Micro C</Button>
                </div>
              </div>
            </div>

            <p className="text-xs text-warning-text italic">
              If right is bigger than left, Button's default padding/size is beating the override.
            </p>

            {/* 8. Modal pair */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                8. Modal pair (w-80 flex gap-2)
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 bg-bg-800/50 rounded-xl border border-overlay-subtle">
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">Legacy "btn-secondary flex-1" / "btn-primary flex-1"</span>
                  <div className="w-80 flex gap-2">
                    <button className="btn-secondary flex-1">Cancel</button>
                    <button className="btn-primary flex-1">Save</button>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-micro text-content-disabled font-mono block">Primitive &lt;Button className="flex-1"&gt;</span>
                  <div className="w-80 flex gap-2">
                    <Button variant="secondary" className="flex-1">Cancel</Button>
                    <Button variant="primary" className="flex-1">Save</Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Section>

        {/* Section 2: Cards */}
        <Section title="Cards">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card variant="default">
                <p className="text-sm text-content-primary">Variant: default</p>
              </Card>
              <Card variant="subtle">
                <p className="text-sm text-content-primary">Variant: subtle</p>
              </Card>
              <Card
                variant="interactive"
                onClick={() => setCardClicks((c) => c + 1)}
              >
                <p className="text-sm text-content-primary">
                  Variant: interactive (clicked {cardClicks} times)
                </p>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Card
                padding="none"
                className="border border-dashed border-overlay-default"
              >
                <p className="text-sm text-content-primary">padding="none"</p>
              </Card>
              <Card padding="sm">
                <p className="text-sm text-content-primary">padding="sm"</p>
              </Card>
              <Card padding="md">
                <p className="text-sm text-content-primary">padding="md"</p>
              </Card>
              <Card padding="lg">
                <p className="text-sm text-content-primary">padding="lg"</p>
              </Card>
            </div>

            <Card as="section">
              <p className="text-sm text-content-primary">Card as="section"</p>
            </Card>

            <ul className="space-y-2">
              <Card as="li">
                <span className="text-sm text-content-primary">
                  Card as="li" (item 1)
                </span>
              </Card>
              <Card as="li">
                <span className="text-sm text-content-primary">
                  Card as="li" (item 2)
                </span>
              </Card>
              <Card as="li">
                <span className="text-sm text-content-primary">
                  Card as="li" (item 3)
                </span>
              </Card>
            </ul>
          </div>
        </Section>

        {/* Section 3: Fields */}
        <Section title="Fields">
          <div className="space-y-4">
            <Input
              label="Username"
              hint="Must be unique across the platform"
              defaultValue="ascend_user"
            />
            <Input
              label="Email address"
              error="Please enter a valid email"
              defaultValue="invalid-email"
            />
            <Input
              label="Disabled field"
              disabled
              defaultValue="Disabled value"
            />
            <Input
              aria-label="Search items"
              placeholder="Search with aria-label only..."
              defaultValue="search query"
            />
            <Select label="Role" defaultValue="member">
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </Select>
            <Textarea
              label="Biography"
              defaultValue="Write a short summary..."
            />
            <div className="w-[360px]">
              <Input
                label="Username"
                hint="Must be unique across the platform"
                defaultValue="ascend_user"
              />
            </div>
          </div>
        </Section>

        {/* Section 4: Badges */}
        <Section title="Badges">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                size="xs" shape="pill"
              </p>
              <div className="flex flex-wrap gap-2">
                {TONES.map((tone) => (
                  <Badge key={tone} tone={tone} size="xs" shape="pill">
                    {tone}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                size="sm" shape="pill"
              </p>
              <div className="flex flex-wrap gap-2">
                {TONES.map((tone) => (
                  <Badge key={tone} tone={tone} size="sm" shape="pill">
                    {tone}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-content-muted">
                size="sm" shape="tag"
              </p>
              <div className="flex flex-wrap gap-2">
                {TONES.map((tone) => (
                  <Badge key={tone} tone={tone} size="sm" shape="tag">
                    {tone}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Section 5: Dialogs */}
        <Section title="Dialogs">
          <DialogDemo />
        </Section>

        {/* Section 6: Empty states */}
        <Section title="Empty states">
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
            <EmptyState
              size="sm"
              title="Nothing to show"
              description="Small text-only variant."
            />
            <Card padding="md">
              <EmptyState
                size="sm"
                surface={false}
                title="Empty inside a card"
              />
            </Card>
          </div>
        </Section>

        {/* Section 7: Tabs */}
        <Section title="Tabs">
          <TabsDemo />
        </Section>

        <Section title="Charts">
          <ChartsDemo />
        </Section>

        {/* Section 8: Navigation */}
        <Section title="Navigation">
          <NavDemo />
        </Section>

        {/* Section 9: Typography */}
        <Section title="Typography">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setBodyFont('inter')}
              >
                Inter
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setBodyFont('geist')}
              >
                Geist
              </Button>
            </div>

            <div
              style={{
                fontFamily:
                  bodyFont === 'geist'
                    ? "'Geist', system-ui, sans-serif"
                    : undefined,
              }}
              className="space-y-6"
            >
              <h3 className="text-2xl font-display font-bold text-content-primary">
                Display heading sample
              </h3>
              <p className="text-sm text-content-secondary">
                Every summit achieved reveals higher peaks yet to be conquered.
                Consistent daily progress compounds into profound personal
                transformation over time.
              </p>

              <div className="space-y-1">
                <p className="text-micro text-content-secondary">
                  text-micro - The quick brown fox 0123456789
                </p>
                <p className="text-xs text-content-secondary">
                  text-xs - The quick brown fox 0123456789
                </p>
                <p className="text-sm text-content-secondary">
                  text-sm - The quick brown fox 0123456789
                </p>
                <p className="text-base text-content-secondary">
                  text-base - The quick brown fox 0123456789
                </p>
              </div>

              <div className="space-y-3 pt-4 border-t border-overlay-subtle">
                <div className="space-y-1">
                  <p className="text-xs text-content-muted">
                    font-display (no tabular-nums):
                  </p>
                  <p className="text-xl font-display text-content-primary">
                    1,247 pts | 04:59 | 0123456789
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-content-muted">
                    font-display (tabular-nums):
                  </p>
                  <p className="text-xl font-display tabular-nums text-content-primary">
                    1,247 pts | 04:59 | 0123456789
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-content-muted">
                    body font (no tabular-nums):
                  </p>
                  <p className="text-xl text-content-primary">
                    1,247 pts | 04:59 | 0123456789
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-content-muted">
                    body font (tabular-nums):
                  </p>
                  <p className="text-xl tabular-nums text-content-primary">
                    1,247 pts | 04:59 | 0123456789
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Section>

        <footer className="pt-6 text-micro text-content-muted">
          ascend-dev-gallery-sentinel-7f3k9q-zx81-do-not-ship
        </footer>
      </div>
    </div>
  );
}
