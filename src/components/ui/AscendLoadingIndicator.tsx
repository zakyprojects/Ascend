import React, { useId } from 'react';

/** Swoosh outline from brand/v2-ascend-bg/loader/ascend-loader-*.svg (0-100 mark space). */
const SWOOSH_PATH =
  'M4.26 56.54 L5.70 55.94 L7.14 55.37 L8.59 54.83 L10.04 54.31 L11.49 53.81 L12.95 53.33 L14.41 52.87 L15.88 52.43 L17.35 52.01 L18.82 51.60 L20.31 51.21 L21.79 50.83 L23.29 50.46 L24.78 50.10 L26.29 49.75 L27.80 49.40 L29.31 49.06 L30.84 48.73 L32.37 48.40 L33.90 48.07 L35.44 47.74 L36.99 47.41 L38.55 47.08 L40.11 46.75 L41.68 46.41 L43.26 46.07 L44.84 45.71 L46.44 45.35 L48.04 44.98 L49.64 44.60 L51.20 44.02 L52.76 43.43 L54.33 42.82 L55.90 42.19 L57.48 41.55 L59.06 40.89 L60.64 40.21 L62.23 39.51 L63.81 38.79 L65.41 38.05 L67.00 37.28 L68.59 36.48 L70.19 35.66 L71.79 34.81 L73.39 33.93 L74.99 33.02 L76.59 32.08 L78.19 31.11 L79.79 30.10 L81.40 29.06 L83.00 27.98 L84.60 26.87 L86.20 25.71 L87.80 24.52 L89.40 23.28 L91.00 22.01 L92.60 20.69 L94.20 19.32 L95.79 17.91 L97.38 16.46 L96.62 15.54 L94.91 16.84 L93.21 18.08 L91.52 19.27 L89.83 20.42 L88.14 21.52 L86.47 22.57 L84.79 23.58 L83.12 24.55 L81.46 25.48 L79.80 26.36 L78.15 27.21 L76.50 28.03 L74.85 28.80 L73.21 29.54 L71.58 30.25 L69.95 30.93 L68.33 31.58 L66.71 32.20 L65.09 32.79 L63.48 33.36 L61.88 33.90 L60.28 34.42 L58.68 34.92 L57.09 35.40 L55.50 35.85 L53.91 36.29 L52.33 36.72 L50.75 37.12 L49.18 37.52 L47.61 37.90 L46.09 38.46 L44.58 39.00 L43.07 39.54 L41.56 40.08 L40.05 40.60 L38.54 41.12 L37.04 41.64 L35.54 42.16 L34.04 42.67 L32.54 43.19 L31.05 43.71 L29.56 44.23 L28.08 44.75 L26.59 45.28 L25.12 45.82 L23.65 46.36 L22.18 46.91 L20.72 47.48 L19.26 48.05 L17.81 48.64 L16.37 49.24 L14.94 49.85 L13.51 50.49 L12.09 51.14 L10.67 51.80 L9.27 52.49 L7.87 53.20 L6.48 53.93 L5.10 54.68 L3.74 55.46 Z';

/**
 * Animated Ascend chip: solid chip + still A/stairs, with a gold glint sweeping
 * along the swoosh. Theme colours and motion live in index.css (`.ascend-loader*`),
 * so the chip follows `data-theme` without a store subscription.
 *
 * `swooshStroke` thickens the swoosh (mark units) so it stays legible at small sizes;
 * the reference outline alone is under 1px at button-icon size.
 */
function AscendLoaderMark({ className, swooshStroke }: { className: string; swooshStroke: number }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const ids = {
    legA: `al-leg-a-${uid}`,
    legB: `al-leg-b-${uid}`,
    swoosh: `al-swoosh-${uid}`,
    sweep: `al-sweep-${uid}`,
    mask: `al-mask-${uid}`,
  };
  const swooshProps = {
    d: SWOOSH_PATH,
    fill: `url(#${ids.swoosh})`,
    stroke: `url(#${ids.swoosh})`,
    strokeWidth: swooshStroke,
    strokeLinejoin: 'round' as const,
  };

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
        <linearGradient id={ids.sweep} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".35" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" />
          <stop offset=".65" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={ids.mask} maskUnits="userSpaceOnUse" x="-20" y="-20" width="140" height="140">
          <rect className="ascend-loader-glint" x="0" y="-20" width="100" height="140" fill={`url(#${ids.sweep})`} />
        </mask>
      </defs>
      <rect className="ascend-loader-chip" x="1" y="1" width="98" height="98" rx="22" strokeWidth="2" />
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
        <path className="ascend-loader-swoosh-base" {...swooshProps} />
        <path {...swooshProps} mask={`url(#${ids.mask})`} />
        <g fill={`url(#${ids.legA})`}>
          <path d="M45.77 2.76 L15.11 84.00 L27.68 84.00 L48.63 3.64 Z" />
          <path d="M15.2 84 V81.6 H26.5 Q28 81.6 28 83.1 V84 Z" />
        </g>
      </g>
    </svg>
  );
}

export interface AscendLoadingIndicatorProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const INDICATOR_SIZES = {
  sm: { box: 'w-4 h-4', swooshStroke: 4 },
  md: { box: 'w-6 h-6', swooshStroke: 3.5 },
  lg: { box: 'w-8 h-8', swooshStroke: 3 },
  xl: { box: 'w-12 h-12', swooshStroke: 2.5 },
};

export const AscendLoadingIndicator: React.FC<AscendLoadingIndicatorProps> = ({
  size = 'sm',
  className = '',
}) => {
  const { box, swooshStroke } = INDICATOR_SIZES[size];

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 ${box} ${className}`}
      role="status"
      aria-label="Loading..."
    >
      <AscendLoaderMark className="w-full h-full" swooshStroke={swooshStroke} />
    </span>
  );
};

export interface AscendLoadingOverlayProps {
  message?: string;
  submessage?: string;
}

export const AscendLoadingOverlay: React.FC<AscendLoadingOverlayProps> = ({
  message = 'Loading...',
  submessage,
}) => {
  return (
    <div
      className="fixed inset-0 z-[9999] bg-bg-900/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label={message}
    >
      <div className="relative flex flex-col items-center max-w-sm" role="status">
        <AscendLoaderMark className="w-24 h-24 mb-6 drop-shadow-xl" swooshStroke={1.5} />

        {/* Brand Name */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-display font-bold text-content-primary text-xl tracking-wide">Ascend</span>
          <span className="text-[10px] bg-primary-500/20 text-brand-text border border-primary-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            Beta
          </span>
        </div>

        {/* Primary Message */}
        <p className="text-sm font-semibold text-content-secondary mt-1">
          {message}
        </p>

        {/* Optional Submessage */}
        {submessage && (
          <p className="text-xs text-content-muted mt-1 max-w-xs leading-relaxed">
            {submessage}
          </p>
        )}
      </div>
    </div>
  );
};
