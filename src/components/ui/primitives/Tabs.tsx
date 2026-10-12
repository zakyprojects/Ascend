import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx, FOCUS_RING, TRANSITION, TAP_TARGET } from './shared';

export interface TabItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  badge?: number;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  variant?: 'segmented' | 'underline';
  size?: 'sm' | 'md';
  scrollable?: boolean;
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
  ariaLabel,
  className,
}) => {
  const isSegmented = variant === 'segmented';
  const isSm = size === 'sm';
  const tabRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());
  const listRef = React.useRef<HTMLDivElement>(null);
  const indicator = useActiveIndicator(listRef, tabRefs, value, items);

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
        'relative',
        isSegmented
          ? 'inline-flex items-center gap-1 p-1 rounded-xl bg-bg-700'
          : 'flex items-center gap-4 border-b border-overlay-subtle',
        scrollable &&
          'max-w-full overflow-x-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]',
        className
      )}
    >
      {/* One indicator that slides to the active tab, painted under the tab labels. */}
      {indicator && (
        <span
          aria-hidden="true"
          className={cx(
            'absolute pointer-events-none',
            isSegmented ? 'top-1 bottom-1 rounded-lg bg-primary-500 shadow-sm' : 'bottom-0 h-0.5 rounded-full bg-brand-text',
            indicator.animate &&
              'transition-[left,width] duration-base ease-emphasized motion-reduce:transition-none'
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
                      : 'text-content-muted hover:text-content-secondary hover:bg-overlay-subtle'
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
            <span>{item.label}</span>
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
    </div>
  );
};

interface IndicatorBox {
  left: number;
  width: number;
  /** False for the first placement, so the indicator appears in place instead of sliding in. */
  animate: boolean;
}

/** Position of the active tab inside the list, kept current through resizes and font loads. */
function useActiveIndicator(
  listRef: React.RefObject<HTMLDivElement>,
  tabRefs: React.RefObject<Map<string, HTMLButtonElement>>,
  value: string,
  items: TabItem[]
): IndicatorBox | null {
  const [box, setBox] = React.useState<IndicatorBox | null>(null);
  // Re-measure when the tabs' text changes (labels, badges), not on every new items array.
  const itemsKey = items.map((item) => `${item.id}:${item.label}:${item.badge ?? ''}`).join('|');

  React.useLayoutEffect(() => {
    const list = listRef.current;
    const tab = tabRefs.current?.get(value);
    if (!list || !tab) {
      setBox(null);
      return;
    }
    const measure = () =>
      setBox((prev) => {
        const next = { left: tab.offsetLeft, width: tab.offsetWidth, animate: prev !== null };
        return prev && prev.left === next.left && prev.width === next.width ? prev : next;
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    observer.observe(tab);
    return () => observer.disconnect();
  }, [listRef, tabRefs, value, itemsKey]);

  return box;
}
