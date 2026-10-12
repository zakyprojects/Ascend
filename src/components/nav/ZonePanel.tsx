import { useRef, type ReactNode } from 'react';
import { PanelLeftClose } from 'lucide-react';
import type { NavGroup } from './navConfig';
import { UpNextCard } from './UpNextCard';
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
  /** Hide-panel button; left out in the hover peek, which closes on its own. */
  onCollapse?: () => void;
  /** Bottom slot: the season standing. */
  footer?: ReactNode;
  className?: string;
}

/** The zone's pages, hung on one line like waypoints (NavItem layout="trail"). */
export function ZonePanel({ group, currentView, partnerBadge, statuses, upNext, onNavigate, onCollapse, footer, className }: ZonePanelProps) {

  const navRef = useRef<HTMLElement>(null);
  const glideRef = useRef<HTMLSpanElement>(null);
  useHoverGlide(navRef, glideRef);

  return (
    <div className={cx('flex h-full w-60 flex-col border-l border-overlay-subtle', className)}>
      <div className="flex items-start justify-between gap-2 px-5 pb-4 pt-6">
        <div key={group.id} className="zone-title min-w-0">
          <div className="font-mono text-2xs uppercase tracking-[0.16em] text-content-muted">{group.items.length} pages</div>
          <h2 className="mt-1 font-serif text-3xl leading-none text-content-primary">{group.label}</h2>
        </div>
        {onCollapse && (
        <button
          type="button"
          onClick={onCollapse}
          aria-label="Hide pages ([)"
          title="Hide pages ([)"
          className={cx('mt-1 rounded-lg p-1.5 text-content-disabled hover:bg-overlay-subtle hover:text-content-secondary', FOCUS_RING, TRANSITION)}
        >
          <PanelLeftClose size={16} aria-hidden="true" />
        </button>
        )}
      </div>

      <UpNextCard upNext={upNext} currentView={currentView} statuses={statuses} onNavigate={onNavigate} className="mx-3 mb-3" />

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

      {footer && <div className="border-t border-overlay-subtle p-4">{footer}</div>}
    </div>
  );
}
