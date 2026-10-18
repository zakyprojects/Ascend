import React from 'react';
import { BRAND_MARK } from './brandPaths';
import { growthTraceFirstFrame, runGrowthTrace } from './growthTrace';

/** One loop of the Streak loader; KEEP IN SYNC with the .streak-loader rules in index.html. */
const STREAK_LOOP_MS = 1600;

/**
 * The Streak loader: the A's left-leg segments light up bottom to top (the gaps "closing"), then
 * the whole A brightens, on a 1.6 s loop. CSS only (`.streak-loader` in index.html, shared with the
 * pre-React splash, so the splash runs before this bundle loads). Every instance is phased to the
 * page clock, so loaders on screen together, and the splash → overlay handoff, never jump.
 * Theme colour comes from the CSS; reduced motion shows the still mark.
 *
 * `small` is the two-segment mark for 32px and below.
 */
export function AscendLoaderMark({ className, variant = 'full' }: { className: string; variant?: 'full' | 'small' }) {
  const [phase] = React.useState(() => `${-(performance.now() % STREAK_LOOP_MS)}ms`);
  const mark = BRAND_MARK[variant];
  // The small mark's two segments take the last two beats, so the body still lights on time.
  const firstBeat = 3 - mark.segments.length;
  return (
    <svg
      viewBox={mark.viewBox}
      className={`streak-loader ${className}`}
      style={{ '--streak-phase': phase } as React.CSSProperties}
      aria-hidden="true"
      focusable="false"
    >
      <path className="sk-body" d={mark.body} />
      {mark.segments.map((d, i) => (
        <path key={d} className={`sk-seg-${firstBeat + i}`} d={d} />
      ))}
    </svg>
  );
}

export interface AscendLoadingIndicatorProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const AscendLoadingIndicator: React.FC<AscendLoadingIndicatorProps> = ({
  size = 'sm',
  className = '',
}) => {
  const sizeMap = {
    sm: { container: 'w-4 h-4', icon: 'w-3 h-3', ring: 'border-2', variant: 'small' },
    md: { container: 'w-6 h-6', icon: 'w-4 h-4', ring: 'border-2', variant: 'small' },
    lg: { container: 'w-8 h-8', icon: 'w-6 h-6', ring: 'border-2', variant: 'small' },
    xl: { container: 'w-12 h-12', icon: 'w-9 h-9', ring: 'border-3', variant: 'full' },
  } as const;

  const currentSize = sizeMap[size];

  return (
    <span
      className={`inline-flex items-center justify-center relative shrink-0 ${currentSize.container} ${className}`}
      role="status"
      aria-label="Loading..."
    >
      {/* Outer spinning gradient ring */}
      <span className={`absolute inset-0 rounded-full border-t-emerald-400 border-r-transparent border-b-primary-500 border-l-transparent animate-spin ${currentSize.ring}`} />
      
      {/* Centre: the Streak mark, animating on its own */}
      <span className="relative flex items-center justify-center">
        <AscendLoaderMark className={currentSize.icon} variant={currentSize.variant} />
      </span>
    </span>
  );
};

/** How long the overlay takes to fade out when `exiting` (callers unmount it after this). */
export const OVERLAY_EXIT_MS = 450;

/** Delay that resumes index.html's splash entrance (.sp-enter) on the page-load clock. */
function bootEntranceDelay(): string {
  const firstPaint = performance.getEntriesByType('paint')[0]?.startTime ?? 0;
  return `${firstPaint - performance.now()}ms`;
}

export interface AscendLoadingOverlayProps {
  message?: string;
  submessage?: string;
  /**
   * 'boot': continues the pre-React splash's entrance, so the handoff never replays it.
   * 'fade' (default): fades in over the app (logout, account purge).
   */
  entrance?: 'boot' | 'fade';
  /** Fades the overlay out and lifts its content, revealing the app beneath. */
  exiting?: boolean;
  /** Buttons for a wait that stopped (offline boot); they take the loading bar's place. */
  actions?: React.ReactNode;
}

/** The growth line along the bottom of the overlay (growthTrace.ts; styles in index.html). */
const GrowthTrace: React.FC<{ fromPageStart: boolean }> = ({ fromPageStart }) => {
  const root = React.useRef<HTMLDivElement>(null);
  const [first] = React.useState(() => growthTraceFirstFrame(fromPageStart));
  React.useEffect(() => {
    const el = root.current;
    const level = el?.querySelector<SVGLineElement>('.gt-level');
    const path = el?.querySelector<SVGPathElement>('.gt-line');
    const reveal = el?.querySelector<HTMLElement>('.gt-reveal');
    const revealInner = el?.querySelector<HTMLElement>('.gt-reveal-inner');
    const dot = el?.querySelector<HTMLElement>('.gt-dot');
    if (!el || !level || !path || !reveal || !revealInner || !dot) return;
    return runGrowthTrace({ root: el, level, path, reveal, revealInner, dot }, fromPageStart);
  }, [fromPageStart]);
  return (
    <div ref={root} className="growth-trace" aria-hidden="true">
      <svg viewBox={first.viewBox}>
        <line className="gt-level" x1="0" x2={first.w} y1={first.level} y2={first.level} />
      </svg>
      <div className="gt-reveal" style={{ transform: first.reveal }}>
        <div className="gt-reveal-inner" style={{ transform: first.revealInner }}>
          <svg viewBox={first.viewBox}>
            <path className="gt-line" d={first.d} />
          </svg>
        </div>
      </div>
      <span className="gt-dot" style={first.dot ? { transform: first.dot } : undefined} />
    </div>
  );
};

export const AscendLoadingOverlay: React.FC<AscendLoadingOverlayProps> = ({
  message = 'Loading...',
  submessage,
  entrance = 'fade',
  exiting = false,
  actions,
}) => {
  const [bootDelay] = React.useState(() => (entrance === 'boot' ? bootEntranceDelay() : '0ms'));
  const exitStyle = { animationDuration: `${OVERLAY_EXIT_MS}ms` };
  const rootMotion = exiting ? 'animate-overlay-exit pointer-events-none' : entrance === 'fade' ? 'animate-fade-in' : '';
  const contentMotion = exiting ? 'animate-boot-lift' : entrance === 'boot' ? 'animate-boot-enter' : '';

  return (
    <div
      className={`fixed inset-0 z-blocking bg-bg-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none ${rootMotion}`}
      style={exiting ? exitStyle : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={message}
    >
      <GrowthTrace fromPageStart={entrance === 'boot'} />
      {/* Background ambient glow aura */}
      <div className="absolute w-48 h-48 bg-primary-500/15 rounded-full blur-3xl animate-pulse" />

      <div
        className={`relative flex flex-col items-center max-w-sm ${contentMotion}`}
        style={exiting ? exitStyle : entrance === 'boot' ? { animationDelay: bootDelay } : undefined}
      >
        {/* Large Animated Ascend Logo Container */}
        <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
          {/* Outer glowing pulsing aura */}
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-primary-500/30 to-emerald-400/20 animate-ping opacity-30" />
          
          {/* Spinning gradient ring */}
          <div className="absolute -inset-1.5 rounded-2xl border-2 border-primary-500/20 border-t-primary-400 border-r-emerald-400 animate-spin" />

          {/* Logo Badge Container */}
          <div className="w-20 h-20 rounded-2xl bg-bg-800/90 border border-primary-500/40 shadow-2xl shadow-primary-500/20 flex items-center justify-center relative overflow-hidden backdrop-blur-xl">
            <div className="absolute inset-0 bg-gradient-to-br from-primary-500/20 via-transparent to-emerald-500/10" />
            
            {/* The Streak mark, animating on its own */}
            <div className="relative">
              <AscendLoaderMark className="w-11 h-11" />
            </div>
          </div>
        </div>

        {/* Brand Name */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-display font-bold text-content-primary text-xl tracking-wide">Ascend</span>
          <span className="text-2xs bg-primary-500/20 text-brand-text border border-primary-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            Self Growth
          </span>
        </div>

        {/* Primary Message */}
        <p className={`text-sm font-semibold text-content-secondary mt-1 ${actions ? '' : 'animate-pulse'}`}>
          {message}
        </p>

        {/* Optional Submessage */}
        {submessage && (
          <p className="text-xs text-content-muted mt-1 max-w-xs leading-relaxed">
            {submessage}
          </p>
        )}

        {actions ? (
          <div className="mt-5 flex flex-col items-center gap-2">{actions}</div>
        ) : (
        /* Animated loader bar */
        <div className="w-36 h-1 bg-bg-700 rounded-full overflow-hidden mt-5 relative">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary-500 to-emerald-400 w-1/2 rounded-full animate-pulse"
            style={{
              animation: 'loadingBar 1.2s ease-in-out infinite',
            }}
          />
        </div>
        )}
      </div>

      <style>{`
        @keyframes loadingBar {
          0% { left: -50%; width: 50%; }
          50% { left: 25%; width: 50%; }
          100% { left: 100%; width: 50%; }
        }
      `}</style>
    </div>
  );
};
