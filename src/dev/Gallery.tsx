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
  Trophy,
  Check,
  Trash2,
  Undo2,
  Flame,
  AlertTriangle,
  Info,
  Settings,
  HelpCircle,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Dialog,
  Disclosure,
  EmptyState,
  FieldErrorBubble,
  FieldGroup,
  FieldRow,
  Form,
  FormAlert,
  Input,
  NavItem,
  NavSection,
  NumberField,
  PageColumns,
  ProgressBar,
  Select,
  Skeleton,
  SlidingPill,
  Switch,
  TabPanel,
  Tabs,
  Textarea,
  cx,
  useFormController,
  type BadgeTone,
  type ProgressTone,
  type TabItem,
} from '../components/ui/primitives';
import { AscendLoaderMark, AscendLoadingIndicator, AscendLoadingOverlay, OVERLAY_EXIT_MS } from '../components/ui/AscendLoadingIndicator';
import { ConfirmDeleteModal } from '../components/ui/ConfirmDeleteModal';
import { DiscardChangesDialog } from '../components/ui/DiscardChangesDialog';
import { ProgressUpdateDialog, UpdateProgressButton } from '../components/ui/ProgressUpdateDialog';
import { PageHero } from '../components/ui/PageHero';
import { CapMeter } from '../components/ui/CapMeter';
import { SwipeRow } from '../components/ui/SwipeRow';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { ToastProvider, useToast } from '../components/ui/Toast';
import { HabitCheck } from '../components/habits/HabitCheck';
import { useUnsavedChanges } from '@/lib/unsavedChanges';
import type { NavStatus } from '@/lib/navStatus';
import type { Habit } from '@/types';
import { canVibrate, playSoundAt, vibrate, type SoundVolume, type VibrationStrength } from '@/lib/actionFeedback';
import { SWIPE_SOUNDS, SWIPE_SOUND_ID, TICK_SOUNDS, TICK_SOUND_ID, type ActionSound } from '@/lib/actionSounds';

// Dev-only test bed for the real UI components with fake data (no store, no Supabase).

interface SectionProps {
  title: string;
  /** One plain line under the title: what the section checks. */
  note?: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, note, children }: SectionProps) {
  return (
    <Card padding="lg" className="space-y-4">
      <div>
        <h2 className="section-title">{title}</h2>
        {note && <p className="mt-0.5 text-xs text-content-muted">{note}</p>}
      </div>
      {children}
    </Card>
  );
}

/** Small caption over a demo row. */
function Caption({ children }: { children: React.ReactNode }) {
  return <p className="stat-label">{children}</p>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const buttonVariants: Array<'primary' | 'secondary' | 'ghost' | 'danger'> = [
  'primary',
  'secondary',
  'ghost',
  'danger',
];

// The CSS button classes in index.css; dialog footers and many pages still use them directly.
const BUTTON_CLASSES = ['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger', 'btn-danger-solid'];

const LOADER_SIZES: Array<'sm' | 'md' | 'lg' | 'xl'> = ['sm', 'md', 'lg', 'xl'];

const LOADER_SURFACES: Array<{ label: string; className: string }> = [
  { label: 'Primary', className: 'bg-primary-600 text-on-brand' },
  { label: 'Danger', className: 'bg-rose-600 text-white' },
  { label: 'Surface', className: 'bg-bg-800 border border-bg-700 text-content-secondary' },
  { label: 'Page', className: 'bg-bg-900 border border-bg-700 text-content-secondary' },
];

const TONES: BadgeTone[] = [
  'neutral',
  'emerald',
  'warning',
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

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

type OverlayDemo = 'idle' | 'exiting' | 'gone';

/** AscendLoadingOverlay in a box: replay the fade entrance and the exit, and the offline buttons. */
function OverlayDemoBox() {
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState<OverlayDemo>('idle');
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (phase !== 'exiting') return;
    const timer = setTimeout(() => setPhase('gone'), OVERLAY_EXIT_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setPhase('idle');
            setRun((n) => n + 1);
          }}
        >
          Replay entrance
        </Button>
        <Button size="sm" variant="secondary" disabled={phase !== 'idle'} onClick={() => setPhase('exiting')}>
          Play exit
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOffline((v) => !v)}>
          {offline ? 'Hide offline buttons' : 'Show offline buttons'}
        </Button>
      </div>
      {/* transform makes the fixed overlay fill this box instead of the viewport */}
      <div className="relative h-[420px] overflow-hidden rounded-xl border border-bg-700 bg-bg-900 [transform:translateZ(0)]">
        {phase === 'gone' ? (
          <p className="flex h-full items-center justify-center text-xs text-content-muted">The app shows here once the overlay has gone.</p>
        ) : (
          <AscendLoadingOverlay
            key={run}
            message={offline ? "Can't reach Ascend" : 'Starting up…'}
            submessage={offline ? "Check your connection. You're still signed in." : 'Checking your account'}
            exiting={phase === 'exiting'}
            actions={
              offline ? (
                <>
                  <Button>Retry</Button>
                  <Button variant="ghost" size="sm">
                    Sign in with another account
                  </Button>
                </>
              ) : undefined
            }
          />
        )}
      </div>
    </div>
  );
}

function LoadersDemo({ theme }: { theme: string }) {
  const [switchOn, setSwitchOn] = useState(true);
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Caption>AscendLoaderMark, the v8 chip on its own (ribbon flies a figure-8 round the A)</Caption>
        <div className="flex flex-wrap items-end gap-6">
          {[
            { className: 'h-24 w-24', ribbonWidth: 5.2, swooshStroke: 1.5, label: '96px' },
            { className: 'h-12 w-12', ribbonWidth: 6, swooshStroke: 3, label: '48px' },
            { className: 'h-6 w-6', ribbonWidth: 9, swooshStroke: 4, label: '24px' },
          ].map((mark) => (
            <div key={mark.label} className="flex flex-col items-center gap-1.5">
              <AscendLoaderMark className={`${mark.className} rounded-xl`} ribbonWidth={mark.ribbonWidth} swooshStroke={mark.swooshStroke} />
              <span className="text-micro text-content-muted">{mark.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>AscendLoadingIndicator sizes (sm is the one used in buttons and rows)</Caption>
        <div className="flex flex-wrap items-end gap-6">
          {LOADER_SIZES.map((size) => (
            <div key={size} className="flex flex-col items-center gap-1.5">
              <AscendLoadingIndicator size={size} />
              <span className="text-micro text-content-muted">{size}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>sm on coloured surfaces, and where it shows up in controls</Caption>
        <div className="flex flex-wrap items-center gap-3">
          {LOADER_SURFACES.map(({ label, className }) => (
            <div key={label} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${className}`}>
              <AscendLoadingIndicator size="sm" />
              {label}
            </div>
          ))}
          <Button size="sm" loading>
            Saving
          </Button>
          <Switch checked={switchOn} onChange={() => setSwitchOn((v) => !v)} loading label="Saving switch" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>Page load: 1) pre-React splash (index.html), then 2) AscendLoadingOverlay while the session is checked</Caption>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <div className="hidden h-[34px] sm:block" aria-hidden="true" />
            <iframe
              key={theme}
              src="/?splash-preview"
              title="Pre-React splash preview"
              className="w-full h-[420px] rounded-xl border border-bg-700"
            />
            <p className="text-micro text-content-muted">1. index.html splash, shown before the JS bundle parses</p>
          </div>
          <div className="space-y-1">
            <OverlayDemoBox />
            <p className="text-micro text-content-muted">2. Overlay (fade entrance here; at boot it continues the splash)</p>
          </div>
        </div>
        <p className="text-micro text-content-muted">
          Both should match, so nothing jumps at the handoff: same chip, same growth trace along the bottom. Reduced motion: the chip shows the
          static logo and only the loading bar moves.
        </p>
      </div>
    </div>
  );
}

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

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

const KINDS = [
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
];

/** The one error look: a bubble under the field, one problem at a time (Form + validate + showError). */
function FormErrorsDemo() {
  const controller = useFormController();
  const [name, setName] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [kind, setKind] = useState('');
  const [failSave, setFailSave] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(0);

  const submit = async () => {
    setSaving(true);
    await wait(700);
    setSaving(false);
    if (failSave) {
      controller.showError('Couldn’t save. Check your connection and try again.');
      return;
    }
    setSaved((n) => n + 1);
  };

  return (
    <Form
      controller={controller}
      alert="manual"
      onSubmit={submit}
      validate={() =>
        name.trim().toLowerCase() === 'read'
          ? { message: 'You already have a habit with this name.', field: 'gallery-form-name' }
          : !kind
            ? { message: 'Choose an option.', field: 'gallery-form-kind' }
            : null
      }
      className="space-y-4"
    >
      <FieldRow>
        <Input
          id="gallery-form-name"
          label="Habit name"
          hint="Try “Read” for a name that is taken."
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={40}
          autoComplete="off"
        />
        <NumberField
          id="gallery-form-minutes"
          label="Minutes"
          value={minutes}
          onValueChange={setMinutes}
          required
          min={1}
          max={600}
        />
      </FieldRow>
      <FieldGroup id="gallery-form-kind" label="How often">
        <div className="relative isolate flex flex-wrap items-center gap-1.5">
          {kind && <SlidingPill active={kind} className="rounded-lg border border-overlay-strong bg-overlay-default" />}
          {KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              data-pill-id={k.id}
              aria-pressed={kind === k.id}
              onClick={() => setKind(k.id)}
              className={cx(
                'rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold transition-colors',
                kind === k.id ? 'text-content-primary' : 'text-content-muted hover:text-content-secondary'
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      </FieldGroup>
      <Textarea id="gallery-form-note" label="Note" optional rows={2} />
      <label className="flex items-center gap-3 text-sm text-content-secondary">
        <Switch checked={failSave} onChange={() => setFailSave((v) => !v)} label="Make the save fail" />
        Make the save fail (form-wide bubble above the button)
      </label>
      <FormAlert />
      <div className="flex items-center gap-3">
        <Button type="submit" loading={saving}>
          Save
        </Button>
        {saved > 0 && <span className="text-xs text-success-text">Saved {saved}×</span>}
      </div>
    </Form>
  );
}

function FieldsDemo() {
  const [count, setCount] = useState(30);
  return (
    <div className="space-y-4">
      <Input label="Username" hint="3–20 letters, numbers, _ or -." defaultValue="ascend_user" />
      <Input label="Email address" error="Enter a valid email address." defaultValue="invalid-email" />
      <Input label="Disabled field" disabled defaultValue="Disabled value" />
      <Input aria-label="Search items" placeholder="Search with aria-label only..." defaultValue="search query" />
      <FieldRow>
        <Select label="Role" defaultValue="member">
          <option value="owner">Owner</option>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </Select>
        <NumberField label="Pages a day" hint="Clear it and type: it keeps your text." value={count} onValueChange={setCount} min={1} />
      </FieldRow>
      <Textarea label="Biography" optional defaultValue="Write a short summary..." />
      <div className="space-y-2">
        <Caption>FieldErrorBubble on its own (outside a form): attached, then form-wide</Caption>
        <FieldErrorBubble message="Pick an avatar." />
        <FieldErrorBubble message="Couldn’t save. Try again." attached={false} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Switch, progress, segmented, disclosure
// ---------------------------------------------------------------------------

function SwitchDemo() {
  const [on, setOn] = useState(true);
  const [off, setOff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingOn, setSavingOn] = useState(false);
  const rows: Array<{ title: string; control: React.ReactNode }> = [
    { title: 'On', control: <Switch checked={on} onChange={() => setOn((v) => !v)} label="On" /> },
    { title: 'Off', control: <Switch checked={off} onChange={() => setOff((v) => !v)} label="Off" /> },
    { title: 'Disabled', control: <Switch checked={false} onChange={() => undefined} disabled label="Disabled" /> },
    {
      title: 'Saves for a second (loading)',
      control: (
        <Switch
          checked={savingOn}
          loading={saving}
          onChange={async () => {
            setSaving(true);
            await wait(1000);
            setSavingOn((v) => !v);
            setSaving(false);
          }}
          label="Saves for a second"
        />
      ),
    },
  ];
  return (
    <div className="divide-y divide-overlay-subtle rounded-xl border border-overlay-subtle">
      {rows.map((row) => (
        <div key={row.title} className="flex items-center justify-between gap-4 px-4 py-3">
          <span className="text-sm font-medium text-content-secondary">{row.title}</span>
          {row.control}
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

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'done', label: 'Done' },
  { id: 'archived', label: 'Archived (12)' },
];

/** Hand-built option rows with SlidingPill (the moving active background). */
function SegmentedDemo() {
  const [fill, setFill] = useState('all');
  const [line, setLine] = useState('active');
  const [mode, setMode] = useState('add');
  const option = (id: string, label: string, active: boolean, onClick: () => void) => (
    <button
      key={id}
      type="button"
      data-pill-id={id}
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'shrink-0 rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold transition-colors',
        active ? 'text-content-primary' : 'text-content-muted hover:text-content-secondary'
      )}
    >
      {label}
    </button>
  );
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Caption>Filter row, fill (neutral active, wraps on phones)</Caption>
        <div role="group" aria-label="Filter" className="relative isolate flex flex-wrap items-center gap-1.5">
          <SlidingPill active={fill} className="rounded-lg border border-overlay-strong bg-overlay-default" />
          {FILTERS.map((f) => option(f.id, f.label, fill === f.id, () => setFill(f.id)))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Caption>Underline variant</Caption>
        <div role="group" aria-label="Filter underline" className="relative isolate flex flex-wrap items-center gap-1.5 border-b border-overlay-subtle">
          <SlidingPill active={line} variant="underline" className="bg-primary-500" />
          {FILTERS.map((f) => option(f.id, f.label, line === f.id, () => setLine(f.id)))}
        </div>
      </div>
      <div className="space-y-1.5">
        <Caption>Two-way switch in a track (as in Update progress)</Caption>
        <div className="relative isolate grid max-w-xs grid-cols-2 gap-1 rounded-xl border border-overlay-default bg-bg-700 p-1">
          <SlidingPill active={mode} className="rounded-lg bg-primary-500/15 border border-primary-500/40" />
          {[
            { id: 'add', label: 'Add' },
            { id: 'set', label: 'Set total' },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              data-pill-id={m.id}
              aria-pressed={mode === m.id}
              onClick={() => setMode(m.id)}
              className={cx(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                mode === m.id ? 'text-brand-text' : 'text-content-muted hover:text-content-secondary'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DisclosureDemo() {
  return (
    <div className="space-y-3">
      <Disclosure title="How points work">
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Preset habits earn their points the first time you tick them each day.</li>
          <li>All habits together earn up to the daily cap.</li>
        </ul>
      </Disclosure>
      <Disclosure title="Missing a habit costs points" icon={AlertTriangle} tone="warning">
        <p>Each missed day in a row costs more than the last, up to a limit.</p>
      </Disclosure>
      <Disclosure title="Opens by default" icon={Info} defaultOpen>
        <p>defaultOpen shows the detail on first render.</p>
      </Disclosure>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page parts: header, hero, points meter, columns
// ---------------------------------------------------------------------------

function PagePartsDemo() {
  const [earned, setEarned] = useState(18);
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
        <Caption>PageHero with ring, lead number, stats and a CapMeter beside it</Caption>
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
              note="Preset habits earn points up to 30 a day. The ones you tick first count first."
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
        <PageHero ariaLabel="Reading" lead={{ label: 'Pages this week', value: '214' }} stats={[{ label: 'Books open', value: '2' }]} />
        <div className="card max-w-sm p-4">
          <CapMeter variant="slots" label="Workouts this week" earned={2} cap={3} slotsUsed={2} slotsTotal={3} note="Up to 3 workouts a week earn points." />
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>PageColumns: one column below 1440px, main + side column from 1440px (lead, aside, children, footer)</Caption>
        <PageColumns
          lead={<div className="card p-4 text-sm text-content-secondary">lead (main column, first)</div>}
          aside={<div className="card p-4 text-sm text-content-secondary">aside (side column; between lead and children on narrow screens)</div>}
          footer={<div className="card p-4 text-sm text-content-secondary">footer (full width)</div>}
        >
          <div className="card p-4 text-sm text-content-secondary">children (main column, after)</div>
        </PageColumns>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Swipe rows (habit row look) and toasts
// ---------------------------------------------------------------------------

function fakeHabit(id: string, name: string, frequency: Habit['frequency'], extra: Partial<Habit> = {}): Habit {
  return {
    id,
    name,
    frequency,
    points: 5,
    isPreset: true,
    createdAt: '2026-09-01T00:00:00.000Z',
    completions: {},
    createdAtPeriod: '2026-09-01',
    ...extra,
  };
}

const SWIPE_HABITS = [
  { habit: fakeHabit('h1', 'Drink 2 litres of water', 'daily'), streak: 12, points: '+5 pts' },
  { habit: fakeHabit('h2', 'Read 20 pages', 'daily', { isSystemLinked: true, linkedModule: 'reading' }), streak: 4, points: 'Tracked by Reading Hub, +5 pts' },
  { habit: fakeHabit('h3', 'Deep clean the room', 'weekly', { isPreset: false, points: 0 }), streak: 0, points: 'No points' },
];

/** SwipeRow around the Habits row look (HabitCheck + name + meta + delete). Drag on a touch screen. */
function SwipeRowDemo() {
  const { showSuccessToast, showInfoToast } = useToast();
  const [done, setDone] = useState<Record<string, boolean>>({ h2: true });
  const [deleted, setDeleted] = useState<string[]>([]);
  const toggle = (id: string, name: string) => {
    setDone((d) => ({ ...d, [id]: !d[id] }));
    showSuccessToast(done[id] ? 'Undone' : 'Done', name);
  };
  const remove = (id: string, name: string) => {
    setDeleted((list) => [...list, id]);
    showInfoToast('Habit deleted', name);
  };
  const rows = SWIPE_HABITS.filter((r) => !deleted.includes(r.habit.id));

  return (
    <div className="space-y-3">
      {rows.map(({ habit, streak, points }) => {
        const isDone = !!done[habit.id];
        const linked = !!habit.isSystemLinked;
        return (
          <SwipeRow
            key={habit.id}
            right={{
              label: isDone ? 'Undo' : 'Done',
              icon: isDone ? Undo2 : Check,
              tone: isDone ? 'bg-bg-600 text-content-secondary' : 'bg-primary-500 text-on-brand',
              onCommit: () => toggle(habit.id, habit.name),
              disabled: linked,
            }}
            left={{ label: 'Delete', icon: Trash2, tone: 'bg-rose-600 text-white', onCommit: () => remove(habit.id, habit.name) }}
          >
            <div className="card card-hover p-3 sm:p-4">
              <div className="flex items-start gap-3">
                <HabitCheck habit={habit} done={isDone} onToggle={() => toggle(habit.id, habit.name)} />
                <div className="min-w-0 flex-1 pt-0.5">
                  <h3
                    className={cx(
                      'item-name break-words line-clamp-2',
                      isDone ? '!text-content-tertiary line-through decoration-overlay-strong' : '!text-content-primary'
                    )}
                  >
                    {habit.name}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-content-muted">
                    {streak > 0 && (
                      <span className="flex items-center gap-1 text-brand-text">
                        <Flame size={13} aria-hidden="true" />
                        <span className="figure">{streak} days</span>
                      </span>
                    )}
                    <span className={cx('figure', habit.isPreset && !linked && 'text-brand-text')}>{points}</span>
                    {habit.frequency === 'weekly' && <span>{isDone ? 'Done this week' : 'Due this week'}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remove(habit.id, habit.name)}
                  aria-label={`Delete ${habit.name}`}
                  className="shrink-0 rounded-lg p-2 text-content-muted hover:bg-error/10 hover:text-error"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </SwipeRow>
        );
      })}
      {deleted.length > 0 && (
        <Button size="sm" variant="secondary" onClick={() => setDeleted([])}>
          Bring rows back
        </Button>
      )}
    </div>
  );
}

function ToastDemo() {
  const { showSuccessToast, showErrorToast, showWarningToast, showInfoToast } = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="secondary" onClick={() => showSuccessToast('Habit added', 'Drink 2 litres of water')}>
        Success
      </Button>
      <Button size="sm" variant="secondary" onClick={() => showErrorToast('Couldn’t delete', 'Check your connection and try again.')}>
        Error (list actions only)
      </Button>
      <Button size="sm" variant="secondary" onClick={() => showWarningToast('Daily cap reached', 'More ticks today earn 0 pts.')}>
        Warning
      </Button>
      <Button size="sm" variant="secondary" onClick={() => showInfoToast('Synced', 'Your changes are saved.')}>
        Info
      </Button>
      <Button size="sm" variant="ghost" onClick={() => showInfoToast('Same key', 'Pressing again replaces it.', 'gallery-dedup')}>
        Deduplicated
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

/** A form dialog the way every app form dialog works: Form + footer submit, dirty guard, async save. */
function FormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const controller = useFormController();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState(10);
  const [failSave, setFailSave] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add-dialogs start empty each time they open.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName('');
      setGoal(10);
    }
  }

  const form = useUnsavedChanges(open, [name, goal]);
  const cancel = () => form.confirmDiscard(onClose);

  const submit = async () => {
    setSaving(true);
    try {
      await wait(900);
      if (failSave) throw new Error('fail');
      onClose();
    } catch {
      controller.showError('Couldn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dirty={form.dirty}
      preventClose={saving}
      title="Add goal"
      description="Type something, then press Esc, the backdrop or Cancel: it asks Discard changes?"
      footer={
        <>
          <button type="button" onClick={cancel} disabled={saving} className="btn-secondary">
            Cancel
          </button>
          <button type="submit" form="gallery-dialog-form" disabled={saving} className="btn-primary">
            {saving && <AscendLoadingIndicator size="sm" />}
            Add goal
          </button>
        </>
      }
    >
      <Form id="gallery-dialog-form" controller={controller} onSubmit={submit} className="space-y-4">
        <Input id="gallery-dialog-name" label="Goal name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="off" />
        <NumberField id="gallery-dialog-goal" label="Target" hint="Saves for a moment; the dialog can’t close while it saves." value={goal} onValueChange={setGoal} required min={1} />
        <label className="flex items-center gap-3 text-sm text-content-secondary">
          <Switch checked={failSave} onChange={() => setFailSave((v) => !v)} label="Make the save fail" />
          Make the save fail (stays open with the reason)
        </label>
      </Form>
    </Dialog>
  );
}

function DialogDemo() {
  const [formOpen, setFormOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [longOpen, setLongOpen] = useState(false);
  const [lockedOpen, setLockedOpen] = useState(false);
  const [nestedAOpen, setNestedAOpen] = useState(false);
  const [nestedBOpen, setNestedBOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" onClick={() => setFormOpen(true)}>
          Form dialog
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(true)}>
          Confirm delete
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

      <FormDialog open={formOpen} onClose={() => setFormOpen(false)} />

      <ConfirmDeleteModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Delete habit?"
        itemName="Drink 2 litres of water"
        onConfirm={async () => {
          await wait(800);
          setConfirmOpen(false);
        }}
      />

      <Dialog
        open={longOpen}
        onClose={() => setLongOpen(false)}
        title="Long scrolling dialog"
        description="Only the body scrolls; the footer stays pinned."
        footer={
          <button type="button" className="btn-primary" onClick={() => setLongOpen(false)}>
            Close
          </button>
        }
      >
        <div className="space-y-3">
          {Array.from({ length: 40 }, (_, i) => (
            <p key={i} className="text-sm text-content-secondary">
              {`Filler paragraph ${i + 1} - scroll test.`}
            </p>
          ))}
        </div>
      </Dialog>

      <Dialog
        open={lockedOpen}
        onClose={() => setLockedOpen(false)}
        title="preventClose dialog"
        description="No X, no Escape, no backdrop close (used while a save runs)."
        preventClose
        footer={
          <button type="button" className="btn-danger-solid" onClick={() => setLockedOpen(false)}>
            Close me
          </button>
        }
      >
        {null}
      </Dialog>

      <Dialog
        open={nestedAOpen}
        onClose={() => setNestedAOpen(false)}
        title="Nested A"
        description="Nested dialog A is open."
        footer={
          <button type="button" className="btn-primary" onClick={() => setNestedBOpen(true)}>
            Open B
          </button>
        }
      >
        {null}
      </Dialog>

      <Dialog
        open={nestedBOpen}
        onClose={() => setNestedBOpen(false)}
        title="Nested B"
        description="Press Escape: only B should close. Press it again: A closes."
        footer={
          <button type="button" className="btn-secondary" onClick={() => setNestedBOpen(false)}>
            Close B
          </button>
        }
      >
        {null}
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

const SWIPE_TABS: TabItem[] = [
  { id: 'chart', label: 'Chart' },
  { id: 'long', label: 'Long list' },
  { id: 'form', label: 'Form' },
];

// Tab swipe test bed (lib/useTabSwipe): a chart that scrubs, a long panel with buttons, text fields.
function TabSwipeDemo() {
  const [tab, setTab] = useState('chart');
  const [presses, setPresses] = useState(0);
  const ids = SWIPE_TABS.map((t) => t.id);

  return (
    <div className="space-y-4">
      <Tabs idBase="gallery-swipe" ariaLabel="Swipe demo" size="sm" scrollable items={SWIPE_TABS} value={tab} onChange={setTab} />
      <TabPanel idBase="gallery-swipe" ids={ids} value={tab} onChange={setTab} className="space-y-3">
        {tab === 'chart' && (
          <div className="card p-4 space-y-2">
            <p className="text-sm text-content-secondary">Swipe here to change tab; scrubbing the chart must not.</p>
            <Sparkline points={CHART_TREND} label="Points, last 14 days" />
          </div>
        )}
        {tab === 'long' &&
          Array.from({ length: 30 }, (_, i) => (
            <div key={i} className="card p-4 flex items-center justify-between">
              <span className="text-sm text-content-secondary">Row {i + 1}</span>
              <Button size="sm" variant="secondary" onClick={() => setPresses((n) => n + 1)}>
                Press ({presses})
              </Button>
            </div>
          ))}
        {tab === 'form' && (
          <div className="card p-4 space-y-3">
            <Input label="Name" placeholder="Dragging in here selects text" />
            <Textarea label="Note" placeholder="Swipes starting here never change tab" />
          </div>
        )}
      </TabPanel>
    </div>
  );
}

// Sound & vibration auditions (lib/actionSounds, lib/actionFeedback). Numbers match the ids Zakria picks from.
const SOUND_VOLUMES: SoundVolume[] = ['soft', 'medium', 'loud'];
const VIBRATION_STRENGTHS: VibrationStrength[] = ['light', 'medium', 'strong'];

function SoundsDemo() {
  const [volume, setVolume] = useState<SoundVolume>('soft');
  const [last, setLast] = useState('');
  const group = (title: string, sounds: ActionSound[], inUse: string) => (
    <div className="space-y-2">
      <p className="text-sm font-medium text-content-primary">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {sounds.map((sound) => (
          <button
            key={sound.id}
            type="button"
            onClick={() => {
              playSoundAt(sound, volume);
              setLast(sound.id);
            }}
            className={`rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-overlay-subtle ${
              last === sound.id ? 'border-primary-500/60' : 'border-overlay-default'
            }`}
          >
            <span className="text-sm font-medium text-content-primary">
              {sound.id.toUpperCase()} · {sound.name}
              {sound.id === inUse && <span className="ml-2 text-xs text-brand-text">in use</span>}
            </span>
            <span className="block text-xs text-content-muted">{sound.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-content-muted">Volume</span>
        {SOUND_VOLUMES.map((v) => (
          <Button key={v} size="sm" variant={v === volume ? 'primary' : 'secondary'} onClick={() => setVolume(v)}>
            {v}
          </Button>
        ))}
      </div>
      {group('Tick sounds (ticking off)', TICK_SOUNDS, TICK_SOUND_ID)}
      {group('Swipe sounds', SWIPE_SOUNDS, SWIPE_SOUND_ID)}
      <div className="space-y-2">
        <p className="text-sm font-medium text-content-primary">Vibration strength</p>
        <div className="flex flex-wrap items-center gap-2">
          {VIBRATION_STRENGTHS.map((strength) => (
            <Button key={strength} size="sm" variant="secondary" disabled={!canVibrate()} onClick={() => vibrate(strength)}>
              {strength}
            </Button>
          ))}
          {!canVibrate() && <span className="text-xs text-content-muted">This device can&apos;t vibrate (open on an Android phone).</span>}
        </div>
      </div>
    </div>
  );
}

const NAV_DEMO_GROUPS: Array<{
  id: string;
  label: string;
  items: Array<{ label: string; icon: typeof Home; status?: NavStatus; badge?: number }>;
}> = [
  {
    id: 'track',
    label: 'Track',
    items: [
      { label: 'Habits', icon: Target, status: { tone: 'pending', meta: '2 left', label: '2 habits left today' } },
      { label: 'Exercise', icon: Activity, status: { tone: 'done', label: 'Done today' } },
      { label: 'Skills', icon: Zap },
    ],
  },
  {
    id: 'mind',
    label: 'Mind',
    items: [
      { label: 'Neuro', icon: Brain, status: { tone: 'risk', meta: '1 left', label: 'Day closes soon' } },
      { label: 'Journal', icon: BookOpen },
    ],
  },
  {
    id: 'play',
    label: 'Play',
    items: [
      { label: 'Leagues', icon: Trophy },
      { label: 'Partner', icon: Clock, badge: 2 },
    ],
  },
];

/** The desktop sidebar's parts: trail rows with today's status, foldable group headers. */
function NavDemo() {
  const [active, setActive] = useState('Dashboard');
  const [closed, setClosed] = useState<string[]>([]);
  const [rowActive, setRowActive] = useState('Settings');

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Caption>Sidebar (layout trail, foldable sections, status marks)</Caption>
        <div className="w-[256px] max-w-full rounded-xl border border-overlay-subtle bg-bg-800 p-2">
          <NavItem icon={Home} label="Dashboard" layout="trail" active={active === 'Dashboard'} onClick={() => setActive('Dashboard')} />
          {NAV_DEMO_GROUPS.map((group) => {
            const open = !closed.includes(group.id);
            const listId = `gallery-nav-${group.id}`;
            return (
              <div key={group.id} className="mt-3">
                <NavSection
                  label={group.label}
                  expanded={open}
                  onToggle={() => setClosed((c) => (c.includes(group.id) ? c.filter((id) => id !== group.id) : [...c, group.id]))}
                  controlsId={listId}
                  badgeCount={group.items.reduce((n, item) => n + (item.badge ?? 0), 0)}
                />
                {open && (
                  <div id={listId} className="space-y-px">
                    {group.items.map((item) => (
                      <NavItem
                        key={item.label}
                        icon={item.icon}
                        label={item.label}
                        layout="trail"
                        status={item.status}
                        badgeCount={item.badge}
                        active={active === item.label}
                        onClick={() => setActive(item.label)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>Row layout (account menu)</Caption>
        <div className="w-[256px] max-w-full space-y-1 rounded-xl border border-overlay-subtle bg-bg-800 p-2">
          {[
            { label: 'Settings', icon: Settings },
            { label: 'Help', icon: HelpCircle },
          ].map((item) => (
            <NavItem
              key={item.label}
              icon={item.icon}
              label={item.label}
              layout="row"
              active={rowActive === item.label}
              onClick={() => setRowActive(item.label)}
            />
          ))}
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

function TypographyDemo() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <Caption>Page title (Instrument Serif, only here, the page’s one hero number and the auth welcome) + subtitle</Caption>
        <h3 className="page-title">Dashboard</h3>
        <p className="page-subtitle">Every summit reveals higher peaks. Consistent daily progress compounds.</p>
      </div>

      <div className="space-y-1.5">
        <Caption>Type roles (Geist)</Caption>
        <div className="space-y-2 rounded-xl border border-overlay-subtle p-4">
          <p className="section-title">.section-title, the heading of a block</p>
          <p className="item-name">.item-name, the name of a thing in a list</p>
          <p className="text-sm text-content-secondary">
            Body text-sm: <span className="figure text-content-primary">.figure 1,247 pts</span> keeps digits even-width.
          </p>
          <p className="stat-label">.stat-label, the small caption over a number</p>
          <p className="label">.label, a form label</p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Caption>Numbers</Caption>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="stat-label">Hero number (font-serif)</p>
            <p className="mt-1 font-serif text-5xl leading-none tabular-nums text-content-primary">1,247</p>
          </div>
          <div>
            <p className="stat-label">Stat (figure)</p>
            <p className="mt-1 figure text-3xl leading-none text-content-primary">82%</p>
          </div>
          <div>
            <p className="stat-label">Live countdown (font-mono, only timers and codes)</p>
            <p className="mt-1 font-mono text-3xl leading-none tabular-nums text-content-primary">04:59</p>
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <Caption>Type scale tokens</Caption>
        {['text-3xs', 'text-2xs', 'text-micro', 'text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl'].map((size) => (
          <p key={size} className={`${size} text-content-secondary`}>
            {size}: The quick brown fox 0123456789
          </p>
        ))}
      </div>
    </div>
  );
}

function GalleryContent() {
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

  useEffect(() => {
    const interval = setInterval(() => {
      setBodyOverflow(document.body.style.overflow || '""');
    }, 300);
    return () => clearInterval(interval);
  }, []);

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
    <div className="min-h-screen text-content-secondary p-4 sm:p-8">
      <div aria-hidden="true" className="app-atmosphere" />
      <div className="mx-auto max-w-5xl space-y-10">
        {/* Top bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-overlay-subtle">
          <h1 className="text-xl font-semibold text-content-primary">Ascend UI gallery (dev only)</h1>
          <div className="flex items-center gap-3">
            <ThemeToggle isDark={theme === 'dark'} onToggle={toggleTheme} />
            <span className="text-xs text-content-muted font-mono">body overflow: {bodyOverflow}</span>
          </div>
        </div>

        <Section title="Buttons" note="The Button primitive: variants, sizes, disabled and loading.">
          <div className="space-y-6">
            {buttonVariants.map((variant) => (
              <div key={variant} className="space-y-1.5">
                <Caption>{variant}</Caption>
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
              <div className="w-[280px] max-w-full">
                <Button fullWidth>fullWidth in w-[280px]</Button>
              </div>
              <div className="w-[200px]">
                <Button>Very long button label that overflows container</Button>
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Button classes"
          note="The .btn-* classes in index.css, used by dialog footers, page headers and many pages. Solid destructive confirms use .btn-danger-solid; .btn-danger is the soft one."
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {BUTTON_CLASSES.map((name) => (
                <button key={name} type="button" className={name}>
                  .{name}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {BUTTON_CLASSES.map((name) => (
                <button key={name} type="button" className={name} disabled>
                  disabled
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-primary">
                <Plus size={16} aria-hidden="true" />
                Icon + text
              </button>
              <button type="button" className="btn-secondary text-xs">
                <Plus size={14} aria-hidden="true" />
                text-xs
              </button>
            </div>
          </div>
        </Section>

        <Section title="Loaders" note="v8 figure-8 chip everywhere; growth trace along the bottom of loading screens.">
          <LoadersDemo theme={theme} />
        </Section>

        <Section title="Skeletons" note="First load of a data region only; actions keep the Ascend spinner.">
          <SkeletonDemo />
        </Section>

        <Section title="Cards">
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card variant="default">
                <p className="text-sm text-content-primary">Variant: default</p>
              </Card>
              <Card variant="subtle">
                <p className="text-sm text-content-primary">Variant: subtle</p>
              </Card>
              <Card variant="interactive" onClick={() => setCardClicks((c) => c + 1)}>
                <p className="text-sm text-content-primary">Variant: interactive (clicked {cardClicks} times)</p>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Card padding="none" className="border border-dashed border-overlay-default">
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
              <div className="card mt-3 p-3">
                <p className="text-sm text-content-secondary">A card inside a card flattens (no second border box).</p>
              </div>
            </Card>

            <ul className="space-y-2">
              {[1, 2, 3].map((n) => (
                <Card key={n} as="li">
                  <span className="text-sm text-content-primary">Card as="li" (item {n})</span>
                </Card>
              ))}
            </ul>
          </div>
        </Section>

        <Section title="Fields" note="Input, Select, Textarea, NumberField, FieldRow (two columns from sm), optional marker, hint, error.">
          <FieldsDemo />
        </Section>

        <Section title="Form errors" note="One problem at a time as a bubble under its field; the field is focused and scrolled to. Press Save with everything empty.">
          <FormErrorsDemo />
        </Section>

        <Section title="Switch">
          <SwitchDemo />
        </Section>

        <Section title="Progress" note="ProgressBar is the one bar; manual progress goes through Update progress.">
          <ProgressDemo />
        </Section>

        <Section title="Segmented and filter rows" note="SlidingPill glides the active background; active is neutral.">
          <SegmentedDemo />
        </Section>

        <Section title="Disclosure">
          <DisclosureDemo />
        </Section>

        <Section title="Page parts" note="Fake numbers; the real pages pass store values.">
          <PagePartsDemo />
        </Section>

        <Section title="Swipe rows" note="On a touch screen: drag right for Done/Undo, left for Delete. The Reading habit can’t be ticked here. Mouse uses the buttons.">
          <SwipeRowDemo />
        </Section>

        <Section title="Toasts" note="For list and page actions and successes; never for a form’s errors.">
          <ToastDemo />
        </Section>

        <Section title="Badges">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Caption>size="xs" shape="pill"</Caption>
              <div className="flex flex-wrap gap-2">
                {TONES.map((tone) => (
                  <Badge key={tone} tone={tone} size="xs" shape="pill">
                    {tone}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Caption>size="sm" shape="pill"</Caption>
              <div className="flex flex-wrap gap-2">
                {TONES.map((tone) => (
                  <Badge key={tone} tone={tone} size="sm" shape="pill">
                    {tone}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Caption>size="sm" shape="tag"</Caption>
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

        <Section title="Dialogs" note="title, description, body and a pinned footer; Discard changes? guard; preventClose while saving.">
          <DialogDemo />
        </Section>

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
            <EmptyState size="sm" title="Nothing to show" description="Small text-only variant." />
            <Card padding="md">
              <EmptyState size="sm" surface={false} title="Empty inside a card" />
            </Card>
          </div>
        </Section>

        <Section title="Tabs" note="Non-scrollable strips are wider than a phone on purpose; this box scrolls sideways instead of the page.">
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <TabsDemo />
          </div>
        </Section>

        <Section title="Tab swipe">
          <TabSwipeDemo />
        </Section>

        <Section title="Sound & vibration">
          <SoundsDemo />
        </Section>

        <Section title="Charts">
          <ChartsDemo />
        </Section>

        <Section title="Navigation">
          <NavDemo />
        </Section>

        <Section title="Typography" note="Geist everywhere; serif and mono only where the rules allow.">
          <TypographyDemo />
        </Section>

        <footer className="pt-6 text-micro text-content-muted">
          ascend-dev-gallery-sentinel-7f3k9q-zx81-do-not-ship
        </footer>
      </div>
      {/* The app renders this once in App; the gallery needs its own for the dialog guard. */}
      <DiscardChangesDialog />
    </div>
  );
}

export function Gallery() {
  return (
    <ToastProvider>
      <GalleryContent />
    </ToastProvider>
  );
}
