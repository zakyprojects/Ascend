import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/Toast';
import { FocusTimerChip } from '@/components/pfc/FocusTimerChip';
import { FocusSessionContext, type FocusSessionContextValue, type FinishedFocusSession } from '@/components/pfc/FocusSessionProvider';
import { BlockPill } from '@/components/nav/BlockPill';
import { FloatingDock } from '@/components/nav/FloatingDock';
import { setBlockPillHidden, EMPTY_HIDDEN } from '@/lib/timeTracker/blockPill';
import { trustedNow, trustedNowMs } from '@/lib/time/clock';
import { todayKey } from '@/lib/time/dates';
import type { FocusSession } from '@/lib/focus/focusSession';
import type { TimeTrackerState } from '@/types';
import { Caption, Section } from './shared';
import { useGalleryTheme } from './util';

// The dock's two chips with fake inputs. The focus chip gets a hand-made FocusSessionContext value
// (no FocusSessionProvider: nothing is stored, synced, timed or notified). The block pill gets a fake
// Time Tracker day; its X writes hides under a Gallery-only account key, never the user's.

const GALLERY_ACCOUNT = 'gallery-demo';
const noop = () => undefined;

type FocusDemoId = 'focus' | 'paused' | 'break' | 'done';

function fakeSession(id: FocusDemoId): FocusSession | null {
  if (id === 'done') return null;
  const now = trustedNowMs();
  const isBreak = id === 'break';
  const left = isBreak ? 4 * 60 + 12 : 18 * 60 + 40;
  return {
    id: 'gallery-focus',
    mode: isBreak ? 'break' : 'focus',
    taskName: 'Write the Gallery report',
    focusMinutes: 25,
    breakMinutes: 5,
    isCustom: false,
    startTime: now,
    plannedDurationSeconds: left,
    isPaused: id === 'paused',
    pausedRemainingSeconds: id === 'paused' ? left : 0,
    startedAt: now - 6 * 60 * 1000,
    pausedAt: id === 'paused' ? now : null,
    marksAt: [],
    localOnly: true,
  };
}

const FINISHED: FinishedFocusSession = { logId: 'gallery-log', taskName: 'Write the Gallery report', minutes: 25 };

function focusValue(id: FocusDemoId): FocusSessionContextValue {
  return {
    session: fakeSession(id),
    finished: id === 'done' ? FINISHED : null,
    notice: null,
    start: noop,
    pause: noop,
    resume: noop,
    complete: noop,
    stop: noop,
    clearFinished: noop,
    clearNotice: noop,
  };
}

const FOCUS_DEMOS: Array<{ id: FocusDemoId; label: string }> = [
  { id: 'focus', label: 'Focus' },
  { id: 'paused', label: 'Paused' },
  { id: 'break', label: 'Break' },
  { id: 'done', label: 'Done' },
];

function FakeFocusChip({ id, onOpen }: { id: FocusDemoId; onOpen: () => void }) {
  // One value per mount, so the countdown runs from the moment the demo appears.
  const value = useMemo(() => focusValue(id), [id]);
  return (
    <FocusSessionContext.Provider value={value}>
      <FocusTimerChip hidden={false} onOpen={onOpen} />
    </FocusSessionContext.Provider>
  );
}

function FocusChipDemo() {
  const { showInfoToast } = useToast();
  const open = () => showInfoToast('Open focus timer', 'In the app this opens PFC.');
  return (
    <div className="flex flex-wrap items-end gap-6">
      {FOCUS_DEMOS.map((d) => (
        <div key={d.id} className="flex flex-col items-start gap-1.5">
          <Caption>{d.label}</Caption>
          <FakeFocusChip id={d.id} onOpen={open} />
        </div>
      ))}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
/** "HH:mm" for minutes after local midnight, kept inside today. */
function hhmm(minutes: number): string {
  const m = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

type DayDemo = 'block' | 'free' | 'plan';

function fakeDay(kind: DayDemo): TimeTrackerState {
  const now = trustedNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const today = todayKey();
  const activities = [
    { id: 'gallery-deep', name: 'Deep work', color: '#10b981', icon: 'Brain', isSystemDefault: false },
    { id: 'gallery-gym', name: 'Gym', color: '#f59e0b', icon: 'Dumbbell', isSystemDefault: false },
  ];
  if (kind === 'plan') return { activities, templates: [], dailyLogs: {} };
  const blocks =
    kind === 'block'
      ? [
          { id: 'gb1', startTime: hhmm(nowMin - 30), endTime: hhmm(nowMin + 45), activityId: 'gallery-deep' },
          { id: 'gb2', startTime: hhmm(nowMin + 60), endTime: hhmm(nowMin + 120), activityId: 'gallery-gym' },
        ]
      : [{ id: 'gb3', startTime: hhmm(nowMin + 90), endTime: hhmm(nowMin + 150), activityId: 'gallery-gym' }];
  return { activities, templates: [], dailyLogs: { [today]: blocks } };
}

const DAY_DEMOS: Array<{ id: DayDemo; label: string }> = [
  { id: 'block', label: 'A block now' },
  { id: 'free', label: 'Free until the next block' },
  { id: 'plan', label: 'Nothing planned' },
];

/** The three pills; remounted (fresh fake days) by Show hidden pills again. */
function BlockPillRow() {
  const theme = useGalleryTheme();
  const { showInfoToast } = useToast();
  const [days] = useState(() => DAY_DEMOS.map((d) => ({ ...d, state: fakeDay(d.id) })));
  return (
    <div className="flex flex-wrap items-end gap-6">
      {days.map((d) => (
        <div key={d.id} className="flex flex-col items-start gap-1.5">
          <Caption>{d.label}</Caption>
          <BlockPill
            timeTracker={d.state}
            theme={theme}
            account={`${GALLERY_ACCOUNT}-${d.id}`}
            onTimeTrackerPage={false}
            onOpen={() => showInfoToast('Open Time Tracker', 'In the app this opens Time Tracker.')}
          />
        </div>
      ))}
    </div>
  );
}

function BlockPillDemo() {
  const [run, setRun] = useState(0);
  return (
    <div className="space-y-3">
      <BlockPillRow key={run} />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          DAY_DEMOS.forEach((d) => setBlockPillHidden(`${GALLERY_ACCOUNT}-${d.id}`, EMPTY_HIDDEN));
          setRun((n) => n + 1);
        }}
      >
        Show hidden pills again
      </Button>
      <p className="text-micro text-content-muted">
        Times are built around now (blocks never cross midnight here, so close to midnight a demo can read differently). The pill
        shows nothing when it is turned off in Settings › Appearance.
      </p>
    </div>
  );
}

function FloatingDockDemo() {
  const [on, setOn] = useState(false);
  const theme = useGalleryTheme();
  const { showInfoToast } = useToast();
  const [day] = useState(() => fakeDay('block'));
  return (
    <div className="space-y-2">
      <Button size="sm" variant="secondary" onClick={() => setOn((v) => !v)}>
        {on ? 'Hide the dock' : 'Show the dock'}
      </Button>
      <p className="text-micro text-content-muted">
        Fixed at the bottom of the screen like the app. Drag it to the other side: its side is saved in this browser (the same
        setting the app uses).
      </p>
      {on && (
        <FloatingDock>
          <FakeFocusChip id="focus" onOpen={() => showInfoToast('Open focus timer', 'In the app this opens PFC.')} />
          <BlockPill
            timeTracker={day}
            theme={theme}
            account={`${GALLERY_ACCOUNT}-dock`}
            onTimeTrackerPage={false}
            onOpen={() => showInfoToast('Open Time Tracker', 'In the app this opens Time Tracker.')}
          />
        </FloatingDock>
      )}
    </div>
  );
}

export function DockGroup() {
  return (
    <>
      <Section id="focus-chip">
        <FocusChipDemo />
      </Section>

      <Section id="block-pill">
        <BlockPillDemo />
      </Section>

      <Section id="floating-dock">
        <FloatingDockDemo />
      </Section>
    </>
  );
}
