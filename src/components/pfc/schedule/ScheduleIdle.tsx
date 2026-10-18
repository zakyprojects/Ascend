import { CalendarDays, Play, PowerOff } from 'lucide-react';
import { formatDurationHuman } from '@/lib/timeTracker';

export function ScheduleStart({
  blockCount,
  totalMinutes,
  onStart,
}: {
  blockCount: number;
  totalMinutes: number;
  onStart: () => void;
}) {
  return (
    <div className="max-w-md mx-auto space-y-5 text-center py-2">
      <div>
        <h3 className="section-title mb-1">Follow today&apos;s schedule</h3>
        <p className="text-xs text-content-muted leading-relaxed">
          The timer follows your Time Tracker blocks as they happen.
        </p>
      </div>

      <div className="py-3 border-y border-overlay-subtle text-xs flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-content-muted">
          <CalendarDays size={15} className="text-success-text" aria-hidden="true" />
          {blockCount === 1 ? '1 block today' : `${blockCount} blocks today`}
        </span>
        <span className="figure text-success-text">{formatDurationHuman(totalMinutes)} total</span>
      </div>

      <button type="button" onClick={onStart} className="btn-primary w-full min-h-11">
        <Play size={16} aria-hidden="true" />
        <span>Start today&apos;s schedule</span>
      </button>
    </div>
  );
}

export function ScheduleStopConfirm({ onKeep, onStop }: { onKeep: () => void; onStop: () => void }) {
  return (
    <div className="max-w-md mx-auto space-y-5 text-center py-4">
      <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-theme flex items-center justify-center mx-auto">
        <PowerOff size={22} aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <h3 className="section-title">Stop following your schedule?</h3>
        <p className="text-sm text-content-tertiary">The card goes back to the plain timer. Your blocks stay as they are.</p>
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <button type="button" onClick={onKeep} className="w-full sm:w-auto btn-secondary min-h-11">
          Keep following
        </button>
        <button type="button" onClick={onStop} className="w-full sm:w-auto btn-danger-solid min-h-11">
          Stop
        </button>
      </div>
    </div>
  );
}
