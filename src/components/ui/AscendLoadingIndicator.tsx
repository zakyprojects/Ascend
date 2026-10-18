import React, { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { getRibbonFrames, subscribeRibbonFrames } from './ascendLoaderRibbon';
import { growthTraceFirstFrame, runGrowthTrace } from './growthTrace';

/** Static logo swoosh (0-100 mark space), shown when reduced motion is on. */
const SWOOSH_PATH =
  'M4.26 56.54 L5.70 55.94 L7.14 55.37 L8.59 54.83 L10.04 54.31 L11.49 53.81 L12.95 53.33 L14.41 52.87 L15.88 52.43 L17.35 52.01 L18.82 51.60 L20.31 51.21 L21.79 50.83 L23.29 50.46 L24.78 50.10 L26.29 49.75 L27.80 49.40 L29.31 49.06 L30.84 48.73 L32.37 48.40 L33.90 48.07 L35.44 47.74 L36.99 47.41 L38.55 47.08 L40.11 46.75 L41.68 46.41 L43.26 46.07 L44.84 45.71 L46.44 45.35 L48.04 44.98 L49.64 44.60 L51.20 44.02 L52.76 43.43 L54.33 42.82 L55.90 42.19 L57.48 41.55 L59.06 40.89 L60.64 40.21 L62.23 39.51 L63.81 38.79 L65.41 38.05 L67.00 37.28 L68.59 36.48 L70.19 35.66 L71.79 34.81 L73.39 33.93 L74.99 33.02 L76.59 32.08 L78.19 31.11 L79.79 30.10 L81.40 29.06 L83.00 27.98 L84.60 26.87 L86.20 25.71 L87.80 24.52 L89.40 23.28 L91.00 22.01 L92.60 20.69 L94.20 19.32 L95.79 17.91 L97.38 16.46 L96.62 15.54 L94.91 16.84 L93.21 18.08 L91.52 19.27 L89.83 20.42 L88.14 21.52 L86.47 22.57 L84.79 23.58 L83.12 24.55 L81.46 25.48 L79.80 26.36 L78.15 27.21 L76.50 28.03 L74.85 28.80 L73.21 29.54 L71.58 30.25 L69.95 30.93 L68.33 31.58 L66.71 32.20 L65.09 32.79 L63.48 33.36 L61.88 33.90 L60.28 34.42 L58.68 34.92 L57.09 35.40 L55.50 35.85 L53.91 36.29 L52.33 36.72 L50.75 37.12 L49.18 37.52 L47.61 37.90 L46.09 38.46 L44.58 39.00 L43.07 39.54 L41.56 40.08 L40.05 40.60 L38.54 41.12 L37.04 41.64 L35.54 42.16 L34.04 42.67 L32.54 43.19 L31.05 43.71 L29.56 44.23 L28.08 44.75 L26.59 45.28 L25.12 45.82 L23.65 46.36 L22.18 46.91 L20.72 47.48 L19.26 48.05 L17.81 48.64 L16.37 49.24 L14.94 49.85 L13.51 50.49 L12.09 51.14 L10.67 51.80 L9.27 52.49 L7.87 53.20 L6.48 53.93 L5.10 54.68 L3.74 55.46 Z';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false
  );
}

/**
 * Animated Ascend chip: solid chip + still A/stairs, with the swoosh flying a figure-8
 * around the A (behind it on one pass, in front on the other). Theme colours live in
 * index.css (`.ascend-loader*`), so the chip follows `data-theme` without a store subscription.
 * Reduced motion shows the static logo instead.
 *
 * `ribbonWidth` is the ribbon's widest point and `swooshStroke` thickens the static swoosh,
 * both larger at small sizes so they stay legible.
 */
export function AscendLoaderMark({
  className,
  ribbonWidth,
  swooshStroke,
}: {
  className: string;
  ribbonWidth: number;
  swooshStroke: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ids = {
    legA: `al-leg-a-${uid}`,
    legB: `al-leg-b-${uid}`,
    swoosh: `al-swoosh-${uid}`,
    ribbon: `al-ribbon-${uid}`,
  };
  const reducedMotion = usePrefersReducedMotion();
  const backRef = useRef<SVGPathElement>(null);
  const frontRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (reducedMotion) return;
    const frames = getRibbonFrames(ribbonWidth);
    let lastIndex = -1;
    return subscribeRibbonFrames((index) => {
      if (index === lastIndex) return;
      lastIndex = index;
      backRef.current?.setAttribute('d', frames[index].back);
      frontRef.current?.setAttribute('d', frames[index].front);
    });
  }, [reducedMotion, ribbonWidth]);

  return (
    <svg viewBox="0 0 100 100" className={`ascend-loader ${className}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={ids.legA} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--al-leg-a-0)' }} />
          <stop offset="1" style={{ stopColor: 'var(--al-leg-a-1)' }} />
        </linearGradient>
        <linearGradient id={ids.legB} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--al-leg-b-0)' }} />
          <stop offset="1" style={{ stopColor: 'var(--al-leg-b-1)' }} />
        </linearGradient>
        <linearGradient id={ids.swoosh} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#FCD34D" />
        </linearGradient>
        <linearGradient id={ids.ribbon} gradientUnits="userSpaceOnUse" x1="10" y1="60" x2="90" y2="25">
          <stop offset="0" stopColor="#F59E0B" />
          <stop offset="1" stopColor="#FCD34D" />
        </linearGradient>
      </defs>
      <rect className="ascend-loader-chip" x="1" y="1" width="98" height="98" rx="22" strokeWidth="2" />
      {!reducedMotion && <path ref={backRef} fill={`url(#${ids.ribbon})`} />}
      <g transform="translate(12 11) scale(0.76)">
        <polygon
          className="ascend-loader-stairs"
          points="2,93 15,93 15,84 28,84 28,75 41,75 41,66 54,66 54,57 67,57 67,48 80,48 80,39 93,39 93,52 34,100 2,100"
        />
        <g className="ascend-loader-steps">
          {[[2, 93], [15, 84], [28, 75], [41, 66], [54, 57], [67, 48], [80, 39]].map(([x, y]) => (
            <rect key={x} x={x} y={y} width="13" height="2" />
          ))}
        </g>
        <g fill={`url(#${ids.legB})`}>
          <path d="M45.74 3.52 L57.19 57.00 L65.89 57.00 L48.66 2.88 Z" />
          <path d="M56.4 57 V54.6 H65.1 Q66.6 54.6 66.6 56.1 V57 Z" />
        </g>
        {reducedMotion && (
          <path
            d={SWOOSH_PATH}
            fill={`url(#${ids.swoosh})`}
            stroke={`url(#${ids.swoosh})`}
            strokeWidth={swooshStroke}
            strokeLinejoin="round"
          />
        )}
        <g fill={`url(#${ids.legA})`}>
          <path d="M45.77 2.76 L15.11 84.00 L27.68 84.00 L48.63 3.64 Z" />
          <path d="M15.2 84 V81.6 H26.5 Q28 81.6 28 83.1 V84 Z" />
        </g>
      </g>
      {!reducedMotion && <path ref={frontRef} fill={`url(#${ids.ribbon})`} />}
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
    sm: { container: 'w-4 h-4', icon: 'w-3 h-3', ring: 'border-2', ribbonWidth: 9, swooshStroke: 4 },
    md: { container: 'w-6 h-6', icon: 'w-4 h-4', ring: 'border-2', ribbonWidth: 9, swooshStroke: 4 },
    lg: { container: 'w-8 h-8', icon: 'w-6 h-6', ring: 'border-2', ribbonWidth: 7.5, swooshStroke: 3.5 },
    xl: { container: 'w-12 h-12', icon: 'w-9 h-9', ring: 'border-3', ribbonWidth: 6, swooshStroke: 3 },
  };

  const currentSize = sizeMap[size];

  return (
    <span
      className={`inline-flex items-center justify-center relative shrink-0 ${currentSize.container} ${className}`}
      role="status"
      aria-label="Loading..."
    >
      {/* Outer spinning gradient ring */}
      <span className={`absolute inset-0 rounded-full border-t-emerald-400 border-r-transparent border-b-primary-500 border-l-transparent animate-spin ${currentSize.ring}`} />
      
      {/* Center pulsing real Ascend Logo */}
      <span className="relative flex items-center justify-center animate-pulse">
        <AscendLoaderMark
          className={`${currentSize.icon} rounded-md shadow-sm`}
          ribbonWidth={currentSize.ribbonWidth}
          swooshStroke={currentSize.swooshStroke}
        />
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
            
            {/* Animated REAL Ascend Logo */}
            <div className="relative animate-bounce transition-transform duration-700">
              <AscendLoaderMark className="w-11 h-11 rounded-xl shadow-lg" ribbonWidth={5.2} swooshStroke={1.5} />
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
