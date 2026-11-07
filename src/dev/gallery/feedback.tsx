import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { Button, Disclosure, Switch } from '@/components/ui/primitives';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { UpdateBanner } from '@/components/ui/UpdateBanner';
import { TimezoneWaitBanner } from '@/components/ui/TimezoneWaitBanner';
import { GuestSaveBanner } from '@/components/ui/GuestSaveBanner';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { trustedNowMs } from '@/lib/clock';
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

const OTHER_SOUND_COUNT = TICK_SOUNDS.length + SWIPE_SOUNDS.length - 2;

function SoundsDemo() {
  const [volume, setVolume] = useState<SoundVolume>('soft');
  const [last, setLast] = useState('');
  const group = (title: string, sounds: ActionSound[], inUse: string[]) => (
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
              inUse.includes(sound.id) ? 'border-primary-500/60 bg-primary-500/5' : last === sound.id ? 'border-overlay-strong' : 'border-overlay-default'
            }`}
          >
            <span className="text-sm font-medium text-content-primary">
              {sound.id.toUpperCase()} · {sound.name}
              {inUse.includes(sound.id) && (
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
      {group('In use in the app', [...TICK_SOUNDS, ...SWIPE_SOUNDS].filter((sound) => sound.id === TICK_SOUND_ID || sound.id === SWIPE_SOUND_ID), [TICK_SOUND_ID, SWIPE_SOUND_ID])}
      <Disclosure title={`Other candidates (${OTHER_SOUND_COUNT}, not in use)`}>
        <div className="space-y-4">
          {group('Tick sounds (ticking off)', TICK_SOUNDS.filter((sound) => sound.id !== TICK_SOUND_ID), [])}
          {group('Swipe sounds', SWIPE_SOUNDS.filter((sound) => sound.id !== SWIPE_SOUND_ID), [])}
        </div>
      </Disclosure>
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

type BannerKind = 'offline' | 'restored' | 'update' | 'timezone';
const BANNER_KINDS: Array<{ id: BannerKind; label: string }> = [
  { id: 'offline', label: 'Offline' },
  { id: 'restored', label: 'Back online' },
  { id: 'update', label: 'New version' },
  { id: 'timezone', label: 'Timezone wait' },
];

/** BannerStack's slot (same wrapper markup) with the banner picked here instead of the live hooks. */
function BannersDemo() {
  const [kind, setKind] = useState<BannerKind>('offline');
  const { showInfoToast } = useToast();
  // About 3 hours from now, so the resume time reads like a real wait.
  const [resumesAt] = useState(() => new Date(trustedNowMs() + 3 * 60 * 60 * 1000));
  let banner: JSX.Element;
  if (kind === 'offline') banner = <OfflineBanner status="offline" />;
  else if (kind === 'restored') banner = <OfflineBanner status="restored" />;
  else if (kind === 'update') banner = <UpdateBanner />;
  else banner = <TimezoneWaitBanner wait={{ resumesAt }} />;
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Caption>BannerStack shows one at a time, first match wins: Offline, Back online, New version, Timezone wait</Caption>
        <div className="flex flex-wrap gap-2">
          {BANNER_KINDS.map((b) => (
            <Button key={b.id} size="sm" variant={kind === b.id ? 'primary' : 'secondary'} onClick={() => setKind(b.id)}>
              {b.label}
            </Button>
          ))}
        </div>
        <div className="rounded-xl border border-dashed border-overlay-default">
          <div className="flex shrink-0 justify-center px-4 pb-2 pt-2">{banner}</div>
        </div>
        {kind === 'update' && <p className="text-micro text-content-muted">Reload on the real banner reloads this page.</p>}
      </div>
      <div className="space-y-1.5">
        <Caption>GuestSaveBanner (guest pages: turn the guest session into an account)</Caption>
        <GuestSaveBanner
          title={<>You&apos;re using a guest account</>}
          description="Create an account to keep your progress on every device."
          onCreateAccount={() => showInfoToast('Create account', 'The Gallery never opens sign-up.')}
        />
        <GuestSaveBanner title="Without a button" description="onCreateAccount absent: the button is hidden." />
      </div>
    </div>
  );
}

/** Static copy of PushPromptCard's markup. The real card checks this browser's push state on mount
 *  and its Turn on subscribes the browser and saves it to the account, so it never renders here. */
function PushPromptCopy({ offer }: { offer: 'push' | 'home-screen' }) {
  const { showInfoToast } = useToast();
  const stub = () => showInfoToast('Not wired', 'The Gallery copy changes nothing.');
  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-primary-500/20 p-4 sm:flex-row sm:items-center">
      <div className="flex w-full items-start gap-3 sm:w-auto">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/15 text-brand-text">
          <Bell size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-content-secondary">Turn on notifications on this device</p>
          <p className="text-xs text-content-muted">
            {offer === 'home-screen'
              ? 'To get notifications on iPhone, add AscendDay to your Home Screen (Share → Add to Home Screen).'
              : 'Get partner nudges and your evening reminder even when AscendDay is closed.'}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={stub} aria-label="Dismiss" title="Not now" className="-mr-2 -mt-2 sm:hidden">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
      <div className={`w-full shrink-0 items-center gap-1 sm:w-auto ${offer === 'push' ? 'flex' : 'hidden sm:flex'}`}>
        {offer === 'push' && (
          <Button onClick={stub} className="min-h-11 flex-1 text-xs sm:flex-none">
            Turn on
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={stub} aria-label="Dismiss" title="Not now" className="hidden sm:inline-flex">
          <X size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

function Thrower({ message }: { message: string }): JSX.Element {
  throw new Error(message);
}

function ErrorBoundaryDemo() {
  const [run, setRun] = useState(0);
  const [broken, setBroken] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="danger" onClick={() => setBroken(true)}>
          Throw in this section
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setBroken(false);
            setRun((n) => n + 1);
          }}
        >
          Reset
        </Button>
      </div>
      <ErrorBoundary key={run} fallbackTitle="Demo section couldn’t load">
        {broken ? <Thrower message="Gallery demo error (thrown on purpose)" /> : <div className="card p-4 text-sm text-content-secondary">A healthy section.</div>}
      </ErrorBoundary>
      <p className="text-micro text-content-muted">
        Try again re-renders the child (it throws again until Reset). Repair app clears this browser&apos;s cached app files and reloads: leave it.
        In dev nothing is reported (crash reports are production only). The dev overlay may also show the error.
      </p>
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

      <Section id="banners">
        <BannersDemo />
      </Section>

      <Section id="push-prompt">
        <div className="space-y-3">
          <PushPromptCopy offer="push" />
          <PushPromptCopy offer="home-screen" />
        </div>
      </Section>

      <Section id="error-boundary">
        <ErrorBoundaryDemo />
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
