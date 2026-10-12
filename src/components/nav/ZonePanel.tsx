import { useRef, type ReactNode } from 'react';
import { ArrowUpRight, PanelLeftClose } from 'lucide-react';
import { NAV_GROUPS, type NavGroup } from './navConfig';
import { NavItem } from '@/components/ui/primitives';
import { cx, FOCUS_RING, TRANSITION } from '@/components/ui/primitives/shared';
import { useHoverGlide } from '@/lib/useHoverGlide';
import type { View } from '@/lib/views';
import type { NavStatuses } from '@/lib/navStatus';

interface ZonePanelProps {
  group: NavGroup;
  currentView: View;
  partnerBadge: number;
  statuses: NavStatuses;
  /** The most pressing open page across all zones (lib/navStatus getUpNext). */
  upNext: View | null;
  onNavigate: (view: View) => void;
  onCollapse: () => void;
  /** Bottom slot: the season standing. */
  footer: ReactNode;
}

/** The zone's pages, hung on one line like waypoints (NavItem layout="trail"). */
export function ZonePanel({ group, currentView, partnerBadge, statuses, upNext, onNavigate, onCollapse, footer }: ZonePanelProps) {
  const upNextItem = upNext && upNext !== currentView ? NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === upNext) : undefined;
  const upNextStatus = upNextItem ? statuses[upNextItem.id] : undefined;

  const navRef = useRef<HTMLElement>(null);
  const glideRef = useRef<HTMLSpanElement>(null);
  useHoverGlide(navRef, glideRef);

  return (
    <div className="flex h-full w-60 flex-col border-l border-overlay-subtle">
      <div className="flex items-start justify-between gap-2 px-5 pb-4 pt-6">
        <div key={group.id} className="zone-title min-w-0">
          <div className="font-mono text-2xs uppercase tracking-[0.16em] text-content-muted">{group.items.length} pages</div>
          <h2 className="mt-1 font-serif text-3xl leading-none text-content-primary">{group.label}</h2>
        </div>
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Hide pages ([)"
          title="Hide pages ([)"
          className={cx('mt-1 rounded-lg p-1.5 text-content-disabled hover:bg-overlay-subtle hover:text-content-secondary', FOCUS_RING, TRANSITION)}
        >
          <PanelLeftClose size={16} aria-hidden="true" />
        </button>
      </div>

      {upNextItem && upNextStatus && (
        <button
          type="button"
          onClick={() => onNavigate(upNextItem.id)}
          className={cx(
            'group/up mx-3 mb-3 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left',
            upNextStatus.tone === 'risk'
              ? 'border-warning/25 bg-warning/[0.06] hover:border-warning/40'
              : 'border-overlay-subtle bg-bg-800/60 hover:border-overlay-default',
            FOCUS_RING,
            TRANSITION
          )}
        >
          <span className="min-w-0 flex-1">
            <span className={cx('block font-mono text-2xs uppercase tracking-[0.16em]', upNextStatus.tone === 'risk' ? 'text-warning-text' : 'text-brand-text')}>
              Up next
            </span>
            <span className="mt-0.5 block truncate text-sm font-semibold text-content-primary">
              {upNextItem.label}
              <span className="font-normal text-content-muted"> · {upNextStatus.meta ?? upNextStatus.label}</span>
            </span>
          </span>
          <ArrowUpRight size={16} aria-hidden="true" className="shrink-0 text-content-muted transition-transform group-hover/up:-translate-y-0.5 group-hover/up:translate-x-0.5" />
        </button>
      )}

      <nav ref={navRef} aria-label={`${group.label} pages`} className="relative isolate flex-1 overflow-y-auto px-3">
        <div key={group.id} className="nav-trail zone-pages space-y-0.5">
          {group.items.map((item) => (
            <NavItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={currentView === item.id}
              onClick={() => onNavigate(item.id)}
              layout="trail"
              badgeCount={item.id === 'partner' ? partnerBadge : undefined}
              status={statuses[item.id]}
            />
          ))}
        </div>
        <span ref={glideRef} aria-hidden="true" className="hover-glide rounded-lg" />
      </nav>

      <div className="border-t border-overlay-subtle p-4">{footer}</div>
    </div>
  );
}
