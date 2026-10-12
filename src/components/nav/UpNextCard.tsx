import { ArrowUpRight } from 'lucide-react';
import { NAV_GROUPS } from './navConfig';
import { cx, FOCUS_RING, TRANSITION } from '@/components/ui/primitives/shared';
import type { View } from '@/lib/views';
import type { NavStatuses } from '@/lib/navStatus';

interface UpNextCardProps {
  upNext: View | null;
  currentView: View;
  statuses: NavStatuses;
  onNavigate: (view: View) => void;
  className?: string;
}

/** "Up next": the most pressing open page (lib/navStatus getUpNext); hidden on that page itself. */
export function UpNextCard({ upNext, currentView, statuses, onNavigate, className }: UpNextCardProps) {
  if (!upNext || upNext === currentView) return null;
  const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === upNext);
  const status = statuses[upNext];
  if (!item || !status) return null;
  const risk = status.tone === 'risk';

  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      className={cx(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-overlay-subtle',
        FOCUS_RING,
        TRANSITION,
        className
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cx('block text-xs', risk ? 'text-warning-text' : 'text-content-muted')}>Up next</span>
        <span className="mt-0.5 block truncate text-sm font-medium text-content-primary">
          {item.label}
          <span className="font-normal text-content-muted"> · {status.meta ?? status.label}</span>
        </span>
      </span>
      <ArrowUpRight size={15} aria-hidden="true" className="shrink-0 text-content-disabled" />
    </button>
  );
}
