import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { NavGroup } from './navConfig';
import { UpNextCard } from './UpNextCard';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';
import type { View } from '@/lib/views';
import type { NavStatuses } from '@/lib/navStatus';

interface ZoneSheetProps {
  open: boolean;
  group: NavGroup | undefined;
  currentView: View;
  statuses: NavStatuses;
  upNext: View | null;
  partnerBadge: number;
  onNavigate: (view: View) => void;
  onClose: () => void;
}

/** Phone: the current zone's pages as large rows with today's status, rising from the zone bar. */
export function ZoneSheet({ open, group, currentView, statuses, upNext, partnerBadge, onNavigate, onClose }: ZoneSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    sheetRef.current?.querySelector<HTMLElement>('[aria-current="page"], button')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open || !group) return null;

  const go = (view: View) => {
    onClose();
    onNavigate(view);
  };

  return createPortal(
    <div className="lg:hidden fixed inset-0 z-modal">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="zone-sheet-backdrop absolute inset-0 bg-black/50" />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${group.label} pages`}
        className="zone-sheet absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-overlay-default bg-bg-800 px-4 pt-3 pb-[calc(1.25rem_+_env(safe-area-inset-bottom))]"
      >
        <div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-full bg-overlay-strong" />
        <div className="mb-3 flex items-baseline justify-between px-1">
          <h2 className="font-serif text-3xl leading-none text-content-primary">{group.label}</h2>
          <span className="font-mono text-2xs uppercase tracking-[0.16em] text-content-muted">{group.items.length} pages</span>
        </div>

        <UpNextCard upNext={upNext} currentView={currentView} statuses={statuses} onNavigate={go} className="mb-3 rounded-2xl px-4 py-3" />

        <ul className="zone-sheet-rows space-y-1">
          {group.items.map((item) => {
            const active = item.id === currentView;
            const status = statuses[item.id];
            const badge = item.id === 'partner' ? partnerBadge : 0;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => go(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left',
                    active ? 'bg-primary-500/10' : 'active:bg-overlay-subtle',
                    FOCUS_RING
                  )}
                >
                  <span
                    className={cx(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border',
                      active ? 'border-primary-500/40 text-brand-text' : 'border-overlay-subtle text-content-muted'
                    )}
                  >
                    <item.icon size={18} aria-hidden="true" />
                  </span>
                  <span className={cx('min-w-0 flex-1 truncate text-base', active ? 'font-semibold text-content-primary' : 'font-medium text-content-secondary')}>
                    {item.label}
                    {status && <span className="sr-only">, {status.label}</span>}
                  </span>
                  {status?.meta && (
                    <span
                      aria-hidden="true"
                      className={cx(
                        'font-mono text-xs tabular-nums',
                        status.tone === 'risk' ? 'text-warning-text' : status.tone === 'done' ? 'text-brand-text' : 'text-content-muted'
                      )}
                    >
                      {status.meta}
                    </span>
                  )}
                  {badge > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-micro font-bold text-white">{badge}</span>
                  )}
                  {status && (
                    <span
                      aria-hidden="true"
                      className={cx(
                        'h-2 w-2 shrink-0 rounded-full',
                        status.tone === 'done' && 'bg-brand-text',
                        status.tone === 'risk' && 'bg-warning',
                        status.tone === 'pending' && 'border border-content-muted'
                      )}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body
  );
}
