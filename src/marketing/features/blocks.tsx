import type { ReactNode } from 'react';
import { cx } from '@/components/ui/primitives/shared';
import type { FeatureSlug } from './catalog';
import type { FaqItem } from '../components/Sections';

/** One screenshot pair in public/screens (width/height = the files' own). */
export interface Shot {
  name: string;
  width: number;
  height: number;
  alt: string;
}

/**
 * What a feature page says. The frame (FeaturePage.tsx) is shared; everything here is the page's
 * own, written from the app's code, with every number imported from it.
 */
export interface FeatureContent {
  /** The answer-first lines under the h1: what it is, for whom, that it is free. */
  intro: ReactNode;
  /** Phone capture next to the h1 (loaded first). */
  heroShot: Shot;
  /** The page's own sections, in its own order. */
  body: ReactNode;
  /** A computer capture with a caption, shown after the body. */
  wideShot: Shot & { caption: string };
  /** The "At a glance" box. */
  facts: [string, ReactNode][];
  fitsIf: string[];
  notFor: string[];
  faq: FaqItem[];
  /** 3–4 related feature pages. */
  related: FeatureSlug[];
  /** The closing band. */
  cta: { title: string; text: string };
}

/** A section of a feature page: heading + any content. */
export function Block({ id, title, lead, children, className }: { id: string; title: string; lead?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={cx('mx-auto max-w-6xl px-4 sm:px-6 pt-16 sm:pt-24', className)}>
      <div className="scroll-rise max-w-3xl">
        <h2 id={id} className="text-2xl sm:text-3xl font-semibold tracking-tight text-content-primary">
          {title}
        </h2>
        {lead && <div className="mt-3 space-y-3 text-base leading-relaxed text-content-tertiary">{lead}</div>}
      </div>
      {children}
    </section>
  );
}

/** Numbered how-to steps. */
export function Steps({ items }: { items: { title: string; text: ReactNode }[] }) {
  return (
    <ol className="mt-8 grid gap-4 grid-cols-1 md:grid-cols-2">
      {items.map((step, i) => (
        <li key={step.title} className="card flex gap-4 p-5 sm:p-6">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-sm font-semibold tabular-nums text-brand-text"
          >
            {i + 1}
          </span>
          <div className="min-w-0">
            <h3 className="font-semibold text-content-primary">{step.title}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-content-tertiary">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A points rule table: what you do → what it earns or costs. `tone` colours the amount. */
export function Rules({ caption, rows }: { caption: string; rows: { what: ReactNode; amount: string; tone?: 'gain' | 'loss' | 'none'; note?: ReactNode }[] }) {
  return (
    <div className="card mt-8 overflow-hidden">
      <table className="w-full text-left text-sm">
        <caption className="px-5 pt-5 text-left text-sm font-semibold text-content-primary sm:px-6">{caption}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">What happens</th>
            <th scope="col">Points</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-overlay-subtle">
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              <td className="px-5 py-3.5 sm:px-6">
                <span className="text-content-secondary">{row.what}</span>
                {row.note && <span className="mt-0.5 block text-xs leading-relaxed text-content-muted">{row.note}</span>}
              </td>
              <td
                className={cx(
                  'whitespace-nowrap px-5 py-3.5 text-right font-semibold tabular-nums sm:px-6',
                  row.tone === 'loss' ? 'text-rose-theme' : row.tone === 'none' ? 'text-content-muted' : 'text-brand-text'
                )}
              >
                {row.amount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Cards side by side (2 or 3 columns from md). */
export function Cards({ items, cols = 3 }: { items: { title: string; text: ReactNode }[]; cols?: 2 | 3 }) {
  return (
    <ul className={cx('mt-8 grid gap-4 grid-cols-1', cols === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2')}>
      {items.map((item) => (
        <li key={item.title} className="card p-5 sm:p-6">
          <h3 className="font-semibold text-content-primary">{item.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-content-tertiary">{item.text}</p>
        </li>
      ))}
    </ul>
  );
}

/** A quiet aside inside a section. */
export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="scroll-rise mt-6 max-w-3xl rounded-xl bg-overlay-subtle p-4 text-sm leading-relaxed text-content-secondary sm:p-5">
      <span className="font-semibold text-content-primary">{title} </span>
      {children}
    </div>
  );
}
