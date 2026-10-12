import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ProgressBar } from './primitives/ProgressBar';

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
          className={`inline-block tabular-nums ${feedbackClass} ${isCapped ? 'text-content-secondary' : 'text-success-text'}`}
        >
          {earned} / {cap}
        </span>
      </div>

      {variant === 'bar' && (
        <ProgressBar value={earned} max={cap} label={label} tone={isCapped ? 'brand' : 'success'} size="sm" />
      )}

      {variant === 'slots' && (
        <div className="flex items-center gap-1.5">
          {Array.from({ length: slotsTotal }).map((_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i < slotsUsed
                  ? isCapped
                    ? 'bg-brand-text'
                    : 'bg-success-text'
                  : 'bg-bg-700'
              }`}
            />
          ))}
        </div>
      )}

      {/* The rules stay one tap away instead of a paragraph above every page (Design v3). */}
      {note && (
        <details className="group">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-micro text-content-muted hover:text-content-secondary [&::-webkit-details-marker]:hidden">
            How points work
            <ChevronDown size={12} aria-hidden="true" className="transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-1.5 text-micro leading-relaxed text-content-muted">{note}</p>
        </details>
      )}
    </div>
  );
}
