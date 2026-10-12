import type { CSSProperties } from 'react';
import { ClimbPhase, ClimbRoute, ClimbTrail } from './ClimbTrail';
import { LeaguePreviewCard } from './LeaguePreviewCard';

export type ClimbPanelMode = 'login' | 'signup' | 'signup-choice' | 'upgrade';
export type ClimbPanelSide = 'left' | 'right';

export interface ClimbPanelProps {
  mode: ClimbPanelMode;
  /** Valid fields so far, 0..steps: the climber's step. */
  progress: number;
  /** Fields the form needs (the climb's step count). */
  steps: number;
  phase: ClimbPhase;
  /** Signup choice: the route the pointer or focus is on. */
  hoverTrail?: ClimbRoute | null;
  /** Signup: what the user has typed so far, shown as a leaderboard row (desktop only). */
  preview?: { username: string; avatar: string };
  /** The side of the page the panel sits on; its slanted edge faces the form on the other side. */
  side: ClimbPanelSide;
  className?: string;
}

/** Brand emerald: the panel keeps it in both themes (the logo chip's dark colour). */
export const CLIMB_PANEL_BG = '#112725';

const COPY: Record<ClimbPanelMode, { headline: string; line: string }> = {
  login: { headline: 'Welcome back.', line: 'Pick up your climb where you left it.' },
  signup: { headline: 'Start your climb.', line: 'Every habit you log is a step up.' },
  'signup-choice': { headline: 'Start your climb.', line: 'Save it to an account, or try it as a guest.' },
  upgrade: { headline: 'Keep your progress.', line: 'Your guest climb moves to your new account.' },
};

// The slope (desktop split only; below lg the panel is a plain band). Facets break it like a ridge.
// Both sides use the same eight points in the same order: each slope corner on one side pairs with a
// point on the straight edge of the other, so when the panel swaps sides (AuthPage) the clip-path
// morphs one edge straight while the other one breaks into the ridge.
const SLOPE: Record<ClimbPanelSide, string> = {
  left:
    'lg:pr-28 lg:[clip-path:polygon(0_0,100%_0,calc(100%_-_1.5rem)_38%,calc(100%_-_3rem)_62%,calc(100%_-_5rem)_100%,0_100%,0_62%,0_38%)]',
  right:
    'lg:pl-28 lg:[clip-path:polygon(0_0,100%_0,100%_38%,100%_62%,100%_100%,5rem_100%,3rem_62%,1.5rem_38%)]',
};

// Static contour lines: the app background's contour map, in pale emerald, fading away from one corner.
const CONTOUR_MASK =
  "url('/atmosphere-contours.svg'), radial-gradient(ellipse 120% 95% at 100% 0%, #000 25%, transparent 78%)";
const CONTOURS: CSSProperties = {
  backgroundColor: 'rgb(110 231 183 / 0.1)',
  WebkitMaskImage: CONTOUR_MASK,
  WebkitMaskSize: 'cover, 100% 100%',
  WebkitMaskPosition: 'right top, center',
  WebkitMaskRepeat: 'no-repeat',
  WebkitMaskComposite: 'source-in',
  maskImage: CONTOUR_MASK,
  maskSize: 'cover, 100% 100%',
  maskPosition: 'right top, center',
  maskRepeat: 'no-repeat',
  maskComposite: 'intersect',
};

/**
 * The brand side of the sign-in pages ("The Climb"): dark emerald with contour lines, the torch
 * chip, a serif headline and the climb, which rises one step per valid field. Size and placement
 * come from the page (`className`); the panel fills the box it is given. Everything here repeats
 * or decorates the form, so none of it is needed to sign in.
 */
export function ClimbPanel({
  mode,
  progress,
  steps,
  phase,
  hoverTrail = null,
  preview,
  side,
  className = '',
}: ClimbPanelProps) {
  const { headline, line } = COPY[mode];
  const style = { backgroundColor: CLIMB_PANEL_BG, '--climb-panel-bg': CLIMB_PANEL_BG } as CSSProperties;

  return (
    <div
      data-side={side}
      className={`relative isolate overflow-hidden flex flex-col text-primary-50 px-6 py-6 sm:px-8 lg:pl-12 lg:pr-12 lg:py-10 ${SLOPE[side]} ${className}`}
      style={style}
    >
      <div
        aria-hidden="true"
        className={`absolute inset-0 -z-10 pointer-events-none ${side === 'right' ? '-scale-x-100' : ''}`}
        style={CONTOURS}
      />

      <div className="flex items-center gap-2.5">
        <img src="/logo-torch.svg" alt="" width={36} height={36} className="w-9 h-9 shrink-0" />
        <span className="text-sm font-semibold tracking-tight">Ascend</span>
      </div>

      <div className="flex-1 flex flex-col justify-center py-4 sm:py-6 lg:py-10">
        <p key={headline} className="font-serif font-normal text-4xl lg:text-6xl leading-none tracking-tight animate-enter-up">
          {headline}
        </p>
        <p key={line} className="mt-3 lg:mt-4 max-w-sm text-sm lg:text-base text-primary-100/70 animate-enter-fade">
          {line}
        </p>
      </div>

      {mode === 'signup' && preview && (
        <LeaguePreviewCard
          username={preview.username}
          avatar={preview.avatar}
          className="hidden lg:block w-full max-w-sm mb-8"
        />
      )}

      <ClimbTrail
        steps={steps}
        progress={progress}
        phase={phase}
        variant={mode === 'signup-choice' ? 'routes' : 'climb'}
        hoverTrail={hoverTrail}
        className="max-w-xl max-h-20 sm:max-h-28 lg:max-h-none"
      />
    </div>
  );
}
