import { Clock } from 'lucide-react';
import type { TimezoneWait } from '@/lib/timezoneStatus';
import { formatTimezoneResume } from '@/lib/useTimezoneWait';

/** Explains why today's ticks earn no points while a timezone change waits on the server. */
export function TimezoneWaitBanner({ wait }: { wait: TimezoneWait }) {
  return (
    <div
      className="w-full max-w-lg bg-bg-700 border border-overlay-default px-4 py-2.5 rounded-2xl shadow-sm flex items-center gap-3 animate-slide-down"
      role="status"
    >
      <div className="p-1.5 rounded-lg bg-overlay-subtle shrink-0 text-content-secondary">
        <Clock size={16} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-content-primary">Your timezone change is waiting</p>
        <p className="text-micro text-content-secondary">
          Today's ticks earn points from about {formatTimezoneResume(wait.resumesAt)}.
        </p>
      </div>
    </div>
  );
}
