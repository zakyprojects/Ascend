import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { useActiveBox } from '@/lib/useActiveBox';
import { useHoverGlide } from '@/lib/useHoverGlide';
import { useScrollFade } from '@/lib/useScrollFade';
import { cx, FOCUS_RING, TRANSITION, TAP_TARGET } from './shared';
import type { NavStatusTone } from '@/lib/navStatus';

export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: number;
  /** Today's status of the page the tab opens (lib/navStatus): a small dot before the label. */
  status?: NavStatusTone;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: 'segmented' | 'underline';
  size?: 'sm' | 'md';
  scrollable?: boolean;
  /** The one tab row that switches pages: its indicator glides across page transitions. */
  pageTabs?: boolean;
  ariaLabel: string;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  value,
  onChange,
  variant = 'segmented',
  size = 'md',
  scrollable = false,
  pageTabs = false,
  ariaLabel,
  className,
}) => {
  const isSegmented = variant === 'segmented';
  const isSm = size === 'sm';
  const tabRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());
  const listRef = React.useRef<HTMLDivElement>(null);
  // Re-measure when the tabs' text changes (labels, badges), not on every new items array.
  const itemsKey = items.map((item) => `${item.id}:${item.label}:${item.badge ?? ''}:${item.status ?? ''}`).join('|');
  const indicator = useActiveBox(listRef, () => tabRefs.current.get(value), value, itemsKey);
  const glideRef = React.useRef<HTMLSpanElement>(null);
  useHoverGlide(listRef, glideRef);
  useScrollFade(listRef, scrollable);

  React.useLayoutEffect(() => {
    if (!scrollable) return;
    const list = listRef.current;
    const el = tabRefs.current.get(value);
    if (!list || !el) return;
    const l = list.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    list.scrollLeft += (e.left + e.width / 2) - (l.left + l.width / 2);
  }, [value, scrollable]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (items.length === 0) return;
    const currentIndex = items.findIndex((item) => item.id === value);
    if (currentIndex === -1) return;

    let targetIndex = -1;
    switch (event.key) {
      case 'ArrowRight':
        targetIndex = (currentIndex + 1) % items.length;
        break;
      case 'ArrowLeft':
        targetIndex = (currentIndex - 1 + items.length) % items.length;
        break;
      case 'Home':
        targetIndex = 0;
        break;
      case 'End':
        targetIndex = items.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const targetItem = items[targetIndex];
    if (targetItem) {
      onChange(targetItem.id);
      const buttonEl = tabRefs.current.get(targetItem.id);
      if (buttonEl) {
        buttonEl.focus();
      }
    }
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cx(
        'relative isolate',
        isSegmented
          ? 'inline-flex items-center gap-1 p-1 rounded-xl bg-bg-700'
          : 'flex items-center gap-4 border-b border-overlay-subtle',
        scrollable &&
          'scroll-fade max-w-full overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]',
        className
      )}
    >
      {/* One indicator that slides to the active tab, painted under the tab labels. */}
      {indicator && (
        <span
          aria-hidden="true"
          data-tab-pill={pageTabs ? '' : undefined}
          className={cx(
            'absolute pointer-events-none',
            isSegmented ? 'top-1 bottom-1 rounded-lg bg-primary-500 shadow-sm' : 'bottom-0 h-0.5 rounded-full bg-brand-text',
            indicator.animate && 'sliding-pill-move'
          )}
          style={{ left: indicator.left, width: indicator.width }}
        />
      )}
      {items.map((item) => {
        const active = item.id === value;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            ref={(el) => {
              if (el) {
                tabRefs.current.set(item.id, el);
              } else {
                tabRefs.current.delete(item.id);
              }
            }}
            type="button"
            role="tab"
            data-glide-item=""
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cx(
              'inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 font-semibold',
              isSm ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
              isSegmented
                ? cx(
                    'rounded-lg',
                    active
                      ? 'text-on-brand'
                      : 'text-content-muted hover:text-content-secondary'
                  )
                : cx(
                    'border-b-2 border-transparent',
                    active ? 'text-content-primary' : 'text-content-muted hover:text-content-secondary'
                  ),
              TAP_TARGET,
              FOCUS_RING,
              TRANSITION
            )}
          >
            {Icon && <Icon size={16} aria-hidden="true" />}
            {item.status && (
              <span
                aria-hidden="true"
                className={cx(
                  'h-1.5 w-1.5 shrink-0 rounded-full',
                  // On the emerald segmented pill the dot takes the label colour so it stays visible.
                  active && isSegmented
                    ? item.status === 'pending' ? 'border border-current' : 'bg-current'
                    : cx(
                        item.status === 'done' && 'bg-brand-text',
                        item.status === 'risk' && 'bg-warning',
                        item.status === 'pending' && 'border border-content-muted'
                      )
                )}
              />
            )}
            <span>
              {item.label}
              {item.status && <span className="sr-only">{item.status === 'done' ? ', done today' : ', open today'}</span>}
            </span>
            {item.badge !== undefined && item.badge > 0 && (
              <span
                className={cx(
                  'rounded-full px-1.5 text-micro font-bold',
                  active && isSegmented ? 'bg-black/20' : 'bg-overlay-default'
                )}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
      {/* Hover highlight that trails the pointer across the tabs (useHoverGlide). */}
      <span ref={glideRef} aria-hidden="true" className="hover-glide rounded-lg" />
    </div>
  );
};
