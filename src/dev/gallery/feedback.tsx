import { useState, useEffect } from 'react';
import { Button, Switch } from '@/components/ui/primitives';
import { AscendLoadingIndicator, AscendLoadingOverlay, OVERLAY_EXIT_MS } from '@/components/ui/AscendLoadingIndicator';
import { useToast } from '@/components/ui/Toast';
import { canVibrate, playSoundAt, vibrate, type SoundVolume, type VibrationStrength } from '@/lib/actionFeedback';
import { SWIPE_SOUNDS, SWIPE_SOUND_ID, TICK_SOUNDS, TICK_SOUND_ID, type ActionSound } from '@/lib/actionSounds';
import { Caption, Section } from './shared';
import { useGalleryTheme } from './util';

const LOADER_SIZES: Array<'sm' | 'md' | 'lg' | 'xl'> = ['sm', 'md', 'lg', 'xl'];

const LOADER_SURFACES: Array<{ label: string; className: string }> = [
  { label: 'Primary', className: 'bg-primary-600 text-on-brand' },
  { label: 'Danger', className: 'bg-rose-600 text-white' },
  { label: 'Surface', className: 'bg-bg-800 border border-bg-700 text-content-secondary' },
  { label: 'Page', className: 'bg-bg-900 border border-bg-700 text-content-secondary' },
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
            message={offline ? "Can't reach AscendDay" : 'Starting up…'}
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
              src="/dashboard?splash-preview"
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
          Both should match, so nothing jumps at the handoff: same Streak mark on the same beat, same growth trace along the bottom. Reduced
          motion: the still mark, and only the loading bar moves.
        </p>
      </div>
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
              sound.id === inUse ? 'border-primary-500/60 bg-primary-500/5' : last === sound.id ? 'border-overlay-strong' : 'border-overlay-default'
            }`}
          >
            <span className="text-sm font-medium text-content-primary">
              {sound.id.toUpperCase()} · {sound.name}
              {sound.id === inUse && (
                <span className="ml-2 rounded-full bg-primary-500/15 px-2 py-0.5 text-2xs font-medium text-brand-text">In use in the app</span>
              )}
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

export function FeedbackGroup() {
  const theme = useGalleryTheme();
  return (
    <>
      <Section id="toasts">
        <ToastDemo />
      </Section>

      <Section id="sounds">
        <SoundsDemo />
      </Section>

      <Section id="loaders">
        <LoadersDemo theme={theme} />
      </Section>
    </>
  );
}
