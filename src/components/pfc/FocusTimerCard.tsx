import { useEffect, useState } from 'react';
import { Bell, BellOff, Coffee, Pause, Play, SkipForward, Square } from 'lucide-react';
import type { AppStore } from '@/lib/store';
import { Dialog, FieldErrorBubble, Input, NumberField, ProgressBar, Select } from '@/components/ui/primitives';
import { cx } from '@/components/ui/primitives/shared';
import { FOCUS_PRESETS, focusAlertsEnabled, focusTierPoints, formatClock, remainingSeconds, type FocusSession } from './focusSession';
import { useFocusCountdown, useFocusSession } from './FocusSessionProvider';
import { notificationPermission, requestNotificationPermission } from './focusNotifications';

/** Projects' "Start focus" hands its task title over once (the page clears it after its first render). */
function pendingTask(): string | null {
  try {
    if (sessionStorage.getItem('ascend_pending_pfc_timer_mode') === 'sync') return null;
    return sessionStorage.getItem('ascend_pending_focus_task');
  } catch {
    return null;
  }
}

const pts = (n: number) => `${n} ${n === 1 ? 'pt' : 'pts'}`;

/** The timer card on the Focus tab (Follow schedule has its own tab: SchedulePanel). */
export function FocusTimerCard({ store }: { store: AppStore }) {
  const { session } = useFocusSession();
  const status = !session ? 'Ready' : session.mode === 'break' ? 'Break' : session.isPaused ? 'Paused' : 'Running';

  return (
    <section className="card p-4 sm:p-6 space-y-5 border border-cyan-500/30" aria-label="Focus timer">
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">Timer</h2>
        <span
          className={cx(
            'badge text-2xs px-2.5 py-1 shrink-0',
            status === 'Ready' ? 'bg-overlay-subtle text-content-tertiary' : status === 'Break' ? 'badge-emerald' : 'badge-cyan'
          )}
        >
          {status}
        </span>
      </div>
      <ManualTimer store={store} />
    </section>
  );
}

/** Follow schedule while the plain timer runs: a reminder line, so its end is no surprise. */
export function RunningTimerStrip({ session, onShow }: { session: FocusSession; onShow: () => void }) {
  const left = useFocusCountdown(session);
  const label = session.mode === 'break' ? 'Break' : session.isPaused ? 'Focus timer paused' : 'Focus timer running';
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-overlay-subtle px-3 py-2 text-xs">
      <span className="text-content-tertiary">
        {label} <span className="figure text-content-primary">{formatClock(left)}</span>
      </span>
      <button type="button" onClick={onShow} className="btn-ghost min-h-10 text-xs">
        Show timer
      </button>
    </div>
  );
}

/** Big countdown; the only part of the card that re-renders every second. */
function TimerDisplay({ session, readySeconds }: { session: FocusSession | null; readySeconds: number }) {
  const left = useFocusCountdown(session);
  const shown = session ? left : readySeconds;
  const total = session
    ? session.mode === 'break'
      ? session.breakMinutes * 60
      : session.focusMinutes * 60
    : readySeconds;
  const done = session && total > 0 ? Math.min(100, Math.max(0, ((total - left) / total) * 100)) : 0;
  return (
    <div className="space-y-3">
      <div
        className={cx('font-mono tabular-nums text-6xl sm:text-7xl text-center', session?.mode === 'break' ? 'text-success-text' : 'text-content-primary')}
        role="timer"
        aria-live="off"
      >
        {formatClock(shown)}
      </div>
      {session && (
        <div className="max-w-sm mx-auto">
          <ProgressBar value={done} label={session.mode === 'break' ? 'Break time passed' : 'Session time passed'} tone={session.mode === 'break' ? 'success' : 'brand'} size="sm" />
        </div>
      )}
    </div>
  );
}

function ManualTimer({ store }: { store: AppStore }) {
  const { session, start, pause, resume, stop } = useFocusSession();
  const skills = store.state.skills;

  // The last chosen length; a session already running sets it on first render.
  const [preset, setPreset] = useState<{ focus: number; brk: number; custom: boolean }>(() =>
    session && session.mode === 'focus'
      ? { focus: session.focusMinutes, brk: session.breakMinutes, custom: session.isCustom }
      : { focus: 25, brk: 5, custom: false }
  );
  const [customFocus, setCustomFocus] = useState(() => (preset.custom ? preset.focus : 25));
  const [customBreak, setCustomBreak] = useState(() => (preset.custom ? preset.brk : 5));
  const [customError, setCustomError] = useState<string | null>(null);
  const [taskName, setTaskName] = useState(() => pendingTask() || 'Deep Work');
  const [skillId, setSkillId] = useState('');
  const [confirmStop, setConfirmStop] = useState(false);
  const [permission, setPermission] = useState(notificationPermission);

  const focusMinutes = preset.custom ? customFocus : preset.focus;
  const breakMinutes = preset.custom ? customBreak : preset.brk;

  // Re-read alert permission when the page comes back (it may have been changed in the browser).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setPermission(notificationPermission());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const handleStart = () => {
    if (!(focusMinutes >= 1)) {
      setCustomError('Enter 1 or more.');
      return;
    }
    setCustomError(null);
    start({ taskName, skillId: skillId || undefined, focusMinutes, breakMinutes, isCustom: preset.custom });
    // Asked in the same tap, without holding up the start.
    if (permission === 'default') void requestNotificationPermission().then(setPermission);
  };

  const skillName = (id?: string) => skills.find((s) => s.id === id)?.name;
  const isBreak = session?.mode === 'break';

  return (
    <div className="space-y-5">
      {!session && (
        <div className="grid grid-cols-2 min-[480px]:grid-cols-4 gap-2" role="group" aria-label="Session length">
          {FOCUS_PRESETS.map((p) => {
            const active = !preset.custom && preset.focus === p.focus;
            return (
              <button
                key={p.focus}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setPreset({ focus: p.focus, brk: p.break, custom: false });
                  setCustomError(null);
                }}
                className={cx(
                  'min-h-11 rounded-xl border px-2 py-1.5 text-xs transition-colors flex flex-col items-center justify-center',
                  active ? 'badge-cyan border-cyan-500/40 font-semibold' : 'border-overlay-subtle text-content-muted hover:bg-overlay-subtle'
                )}
              >
                <span className="figure text-sm">{p.focus} min</span>
                <span className="text-2xs opacity-80">{pts(focusTierPoints(p.focus))}</span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={preset.custom}
            onClick={() => setPreset({ focus: customFocus, brk: customBreak, custom: true })}
            className={cx(
              'min-h-11 rounded-xl border px-2 py-1.5 text-xs transition-colors flex flex-col items-center justify-center',
              preset.custom ? 'badge-cyan border-cyan-500/40 font-semibold' : 'border-overlay-subtle text-content-muted hover:bg-overlay-subtle'
            )}
          >
            <span className="text-sm">Custom</span>
            <span className="text-2xs opacity-80">{preset.custom ? pts(focusTierPoints(customFocus)) : 'any length'}</span>
          </button>
        </div>
      )}

      {!session && preset.custom && (
        <div className="space-y-2 max-w-md mx-auto">
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              id="pfc-custom-focus-mins"
              label="Focus (min)"
              min={1}
              value={customFocus}
              onValueChange={(v) => {
                const m = Math.floor(v);
                setCustomFocus(m);
                setCustomError(m >= 1 ? null : 'Enter 1 or more.');
              }}
              className="tabular-nums"
            />
            <NumberField
              id="pfc-custom-break-mins"
              label="Break (min)"
              min={1}
              value={customBreak}
              onValueChange={(v) => setCustomBreak(Math.max(1, Math.floor(v)))}
              className="tabular-nums"
            />
          </div>
          <p className="text-2xs text-content-muted">At least 1 min. 25 min earns 2 pts, 50 min 5 pts, 90 min or more 10 pts.</p>
          {customError && <FieldErrorBubble message={customError} attached={false} />}
        </div>
      )}

      <TimerDisplay session={session} readySeconds={Math.max(0, focusMinutes) * 60} />

      {session ? (
        <p className="text-center text-xs text-content-muted break-words [overflow-wrap:anywhere]">
          {isBreak ? (
            <>Break after {session.focusMinutes} min on {session.taskName}. Breaks earn no points.</>
          ) : (
            <>
              <span className="text-content-secondary font-medium">{session.taskName}</span>
              {skillName(session.skillId) ? ` · ${skillName(session.skillId)}` : ''} · {session.focusMinutes} min ·{' '}
              {pts(focusTierPoints(session.focusMinutes))}
            </>
          )}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
          <Input
            id="pfc-task-name"
            label="Task"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            placeholder="What are you working on?"
            maxLength={120}
            autoComplete="off"
          />
          <Select id="pfc-tag-skill" label="Skill" optional value={skillId} onChange={(e) => setSkillId(e.target.value)}>
            <option value="">No skill</option>
            {skills.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      <div className="flex flex-col min-[420px]:flex-row items-center justify-center gap-2.5">
        {!session ? (
          <button type="button" onClick={handleStart} className="btn-primary w-full min-[420px]:w-auto min-h-11 px-6">
            <Play size={18} aria-hidden="true" />
            <span>Start focus</span>
          </button>
        ) : isBreak ? (
          <button type="button" onClick={stop} className="btn-primary w-full min-[420px]:w-auto min-h-11 px-6">
            <SkipForward size={18} aria-hidden="true" />
            <span>Skip break</span>
          </button>
        ) : (
          <>
            {session.isPaused ? (
              <button type="button" onClick={resume} className="btn-primary w-full min-[420px]:w-auto min-h-11 px-6">
                <Play size={18} aria-hidden="true" />
                <span>Resume</span>
              </button>
            ) : (
              <button type="button" onClick={pause} className="btn-primary w-full min-[420px]:w-auto min-h-11 px-6">
                <Pause size={18} aria-hidden="true" />
                <span>Pause</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmStop(true)}
              className="btn-ghost w-full min-[420px]:w-auto min-h-11 text-xs text-content-muted hover:text-rose-theme"
            >
              <Square size={14} aria-hidden="true" />
              <span>Discard session</span>
            </button>
          </>
        )}
      </div>

      <div className="space-y-1 text-center text-2xs text-content-muted">
        {session && !isBreak && <p>Keeps running if you switch pages, reload or close the app.</p>}
        {isBreak && session && <p className="inline-flex items-center gap-1"><Coffee size={12} aria-hidden="true" /> Back to the timer when the break ends.</p>}
        <AlertsLine permission={permission} onAsk={() => void requestNotificationPermission().then(setPermission)} />
      </div>

      <Dialog
        open={confirmStop}
        onClose={() => setConfirmStop(false)}
        title="Discard focus session?"
        description="The timer stops. Nothing is saved and no points are earned."
        footer={
          <>
            <button type="button" onClick={() => setConfirmStop(false)} className="btn-secondary">
              Keep going
            </button>
            <button
              type="button"
              onClick={() => {
                // A session that already ran out is ended (and logged) by the provider, not discarded.
                if (session && remainingSeconds(session) > 0) stop();
                setConfirmStop(false);
              }}
              className="btn-danger-solid"
            >
              Discard session
            </button>
          </>
        }
      >
        {null}
      </Dialog>
    </div>
  );
}

function AlertsLine({ permission, onAsk }: { permission: NotificationPermission | 'unsupported'; onAsk: () => void }) {
  if (permission === 'unsupported') return null;
  if (permission === 'denied') {
    return (
      <p className="inline-flex items-center gap-1">
        <BellOff size={12} aria-hidden="true" /> Alerts are blocked. Allow notifications for this site in your browser settings.
      </p>
    );
  }
  if (permission === 'default') {
    return (
      <button type="button" onClick={onAsk} className="btn-ghost min-h-10 text-2xs text-cyan-hierarchy">
        <Bell size={12} aria-hidden="true" /> Turn on alerts for when a session ends
      </button>
    );
  }
  if (!focusAlertsEnabled()) return <p>Focus alerts are off in Settings.</p>;
  return (
    <p className="inline-flex items-center gap-1">
      <Bell size={12} aria-hidden="true" /> Alerts on this device, while the app is open.
    </p>
  );
}
