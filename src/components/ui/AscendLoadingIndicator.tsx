import React from 'react';

export function AscendLogoSVG({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ascendLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#ascendLogoGrad)" />
      <circle cx="32" cy="26" r="12" fill="none" stroke="#ffffff" strokeWidth="3.5" />
      <path d="M25 36 L20 50 L32 44 L44 50 L39 36" fill="none" stroke="#ffffff" strokeWidth="3.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="32" cy="26" r="5.5" fill="#ffffff" />
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
    sm: { container: 'w-4 h-4', icon: 'w-3 h-3', ring: 'border-2' },
    md: { container: 'w-6 h-6', icon: 'w-4 h-4', ring: 'border-2' },
    lg: { container: 'w-8 h-8', icon: 'w-6 h-6', ring: 'border-2' },
    xl: { container: 'w-12 h-12', icon: 'w-9 h-9', ring: 'border-3' },
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
        <AscendLogoSVG className={`${currentSize.icon} rounded-md shadow-sm`} />
      </span>
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
      className="fixed inset-0 z-[9999] bg-bg-950/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label={message}
    >
      {/* Background ambient glow aura */}
      <div className="absolute w-48 h-48 bg-primary-500/15 rounded-full blur-3xl animate-pulse" />

      <div className="relative flex flex-col items-center max-w-sm">
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
              <AscendLogoSVG className="w-11 h-11 rounded-xl shadow-lg" />
            </div>
          </div>
        </div>

        {/* Brand Name */}
        <div className="flex items-center gap-2 mb-1.5">
          <span className="font-display font-bold text-slate-100 text-xl tracking-wide">Ascend</span>
          <span className="text-[10px] bg-primary-500/20 text-primary-300 border border-primary-500/30 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
            Self Growth
          </span>
        </div>

        {/* Primary Message */}
        <p className="text-sm font-semibold text-slate-200 mt-1 animate-pulse">
          {message}
        </p>

        {/* Optional Submessage */}
        {submessage && (
          <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
            {submessage}
          </p>
        )}

        {/* Animated loader bar */}
        <div className="w-36 h-1 bg-bg-700 rounded-full overflow-hidden mt-5 relative">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary-500 to-emerald-400 w-1/2 rounded-full animate-pulse"
            style={{
              animation: 'loadingBar 1.2s ease-in-out infinite',
            }}
          />
        </div>
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
