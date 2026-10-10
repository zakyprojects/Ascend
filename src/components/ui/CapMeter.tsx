import { useState } from 'react';

export interface CapMeterProps {
  variant: 'bar' | 'slots';
  label: string;
  earned: number;
  cap: number;
  slotsUsed?: number;
  slotsTotal?: number;
  note?: string;
}

export function CapMeter({
  variant,
  label,
  earned,
  cap,
  slotsUsed = 0,
  slotsTotal = 0,
  note,
}: CapMeterProps) {
  const isCapped = earned >= cap;
  const displayPercent = cap > 0 ? Math.min(100, Math.max(0, (earned / cap) * 100)) : 0;

  // Points-earned feedback. Compares against the previous render (React's
  // "state from previous render" pattern), so it never fires on mount or on a
  // page revisit, only when `earned` rises while this meter is on screen.
  // Every rise gets a small pop; the rise that reaches the cap celebrates.
  const [prevEarned, setPrevEarned] = useState(earned);
  const [feedback, setFeedback] = useState<{ id: number; kind: 'earn' | 'cap' } | null>(null);
  if (earned !== prevEarned) {
    setPrevEarned(earned);
    if (earned > prevEarned) {
      const kind = prevEarned < cap && earned >= cap ? 'cap' : 'earn';
      setFeedback((f) => ({ id: (f?.id ?? 0) + 1, kind }));
    }
  }
  const feedbackClass = feedback ? (feedback.kind === 'cap' ? 'animate-celebrate' : 'animate-pop') : '';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-content-muted">{label}</span>
        <span
          key={feedback?.id}
          className={`inline-block tabular-nums ${feedbackClass} ${isCapped ? 'text-warning-text' : 'text-success-text'}`}
        >
          {earned} / {cap}
        </span>
      </div>

      {variant === 'bar' && (
        <div
          role="progressbar"
          aria-valuenow={earned}
          aria-valuemin={0}
          aria-valuemax={cap}
          className="h-1.5 w-full bg-bg-700 rounded-full overflow-hidden"
        >
          <div
            className={`h-full transition-all duration-300 rounded-full ${
              isCapped ? 'bg-warning-text' : 'bg-success-text'
            }`}
            style={{ width: `${displayPercent}%` }}
          />
        </div>
      )}

      {variant === 'slots' && (
        <div className="flex items-center gap-1.5">
          {Array.from({ length: slotsTotal }).map((_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i < slotsUsed
                  ? isCapped
                    ? 'bg-warning-text'
                    : 'bg-success-text'
                  : 'bg-bg-700'
              }`}
            />
          ))}
        </div>
      )}

      {note && (
        <div className="text-[11px] text-content-muted">
          {note}
        </div>
      )}
    </div>
  );
}
