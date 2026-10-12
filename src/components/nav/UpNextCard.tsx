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
        'group/up flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left',
        risk ? 'border-warning/25 bg-warning/[0.06] hover:border-warning/40' : 'border-overlay-subtle bg-bg-800/60 hover:border-overlay-default',
        FOCUS_RING,
        TRANSITION,
        className
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cx('block text-xs', risk ? 'text-warning-text' : 'text-brand-text')}>Up next</span>
        <span className="mt-0.5 block truncate text-sm font-semibold text-content-primary">
          {item.label}
          <span className="font-normal text-content-muted"> · {status.meta ?? status.label}</span>
        </span>
      </span>
      <ArrowUpRight
        size={16}
        aria-hidden="true"
        className="shrink-0 text-content-muted transition-transform group-hover/up:-translate-y-0.5 group-hover/up:translate-x-0.5"
      />
    </button>
  );
}
