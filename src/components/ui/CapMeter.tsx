import React from 'react';

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

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-content-muted">{label}</span>
        <span className={isCapped ? 'text-warning-text' : 'text-success-text'}>
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
