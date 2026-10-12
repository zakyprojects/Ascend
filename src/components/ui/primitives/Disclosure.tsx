import type { ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cx, FOCUS_RING } from './shared';

export interface DisclosureProps {
  /** Always-visible one-line summary. */
  title: ReactNode;
  icon?: LucideIcon;
  /** 'warning' for rules that cost points (amber edge), 'neutral' for plain explanations. */
  tone?: 'warning' | 'neutral';
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Collapsible explainer card for long rules text: the title stays on the page, the detail opens on
 * demand. Native <details>, so keyboard, screen readers and find-in-page work with no state; the
 * open/close height animates where the browser supports it (index.css, `.disclosure`).
 */
export function Disclosure({ title, icon: Icon, tone = 'neutral', defaultOpen = false, children, className }: DisclosureProps) {
  const warning = tone === 'warning';
  return (
    <details
      open={defaultOpen}
      className={cx('disclosure group card', warning && 'border-l-4 border-l-amber-500 bg-amber-500/5', className)}
    >
      <summary
        className={cx(
          'flex cursor-pointer list-none items-center gap-2.5 rounded-2xl px-4 py-3.5 text-xs [&::-webkit-details-marker]:hidden',
          FOCUS_RING
        )}
      >
        {Icon && (
          <Icon size={18} aria-hidden="true" className={cx('shrink-0', warning ? 'text-warning-text' : 'text-content-muted')} />
        )}
        <span className={cx('min-w-0 flex-1 font-bold', warning ? 'text-warning-text' : 'text-content-secondary')}>{title}</span>
        <span className="hidden text-2xs font-medium text-content-muted sm:inline group-open:hidden">How it works</span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="shrink-0 text-content-muted transition-transform duration-base ease-emphasized group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="px-4 pb-4 text-xs leading-relaxed text-content-muted">{children}</div>
    </details>
  );
}
