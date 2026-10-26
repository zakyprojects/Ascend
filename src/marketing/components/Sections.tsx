import type { ReactNode } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';

/** Building blocks shared by the landing page, /features and the feature pages. */

export function SectionHeading({ id, kicker, title, children }: { id: string; kicker?: string; title: string; children?: ReactNode }) {
  return (
    <div className="scroll-rise max-w-2xl">
      {kicker && <p className="text-sm font-medium text-brand-text">{kicker}</p>}
      <h2 id={id} className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-content-primary">
        {title}
      </h2>
      {children && <p className="mt-3 text-base leading-relaxed text-content-tertiary">{children}</p>}
    </div>
  );
}

export function Section({ labelledBy, className, children }: { labelledBy: string; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={labelledBy} className={cx('mx-auto max-w-6xl px-4 sm:px-6 pt-20 sm:pt-28', className)}>
      {children}
    </section>
  );
}

export interface FaqItem {
  q: string;
  a: ReactNode;
}

/** Visible questions and answers (<details>, open without JavaScript). */
export function FaqList({ items }: { items: FaqItem[] }) {
  return (
    <div className="mt-8 divide-y divide-overlay-subtle rounded-2xl border border-overlay-default">
      {items.map(({ q, a }) => (
        <details key={q} className="m-faq group">
          <summary
            className={cx(
              'flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left font-medium text-content-primary [&::-webkit-details-marker]:hidden',
              FOCUS_RING
            )}
          >
            <h3 className="text-base font-medium">{q}</h3>
            <Plus size={18} aria-hidden="true" className="m-faq-icon shrink-0 text-content-muted transition-transform duration-base" />
          </summary>
          <div className="px-5 pb-5 text-sm leading-relaxed text-content-tertiary">{a}</div>
        </details>
      ))}
    </div>
  );
}

/** The closing sign-up band. `featuresLink={false}` drops "See every feature" on /features itself. */
export function CtaBand({
  id,
  title,
  featuresLink = true,
  children,
}: {
  id: string;
  title: string;
  featuresLink?: boolean;
  children: ReactNode;
}) {
  return (
    <Section labelledBy={id}>
      <div className="card scroll-rise overflow-hidden px-6 py-12 text-center sm:px-12 sm:py-16">
        <h2 id={id} className="text-3xl font-semibold tracking-tight text-content-primary sm:text-4xl">
          {title}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-content-tertiary">{children}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href="/signup" data-cta="" className="btn-primary min-h-12 px-6 text-base">
            <span data-cta-label="">Start free</span>
            <ArrowRight size={18} aria-hidden="true" />
          </a>
          {featuresLink && (
            <a href="/features" className="btn-secondary min-h-12 px-6 text-base">
              See every feature
            </a>
          )}
        </div>
      </div>
    </Section>
  );
}
