import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { HelpCircle, type LucideIcon } from 'lucide-react';
import { Dialog } from './primitives/Dialog';
import { cx, FOCUS_RING, TAP_TARGET, TRANSITION } from './primitives/shared';

/**
 * "How it works" for the complex pages: one button under the page subtitle opens one dialog that
 * says what the page's parts do and how its points work. The page's CapMeter "How points work"
 * opens the same dialog at its Points section. Never opens on its own, nothing is remembered.
 * Content lives per page in components/howItWorks/ (plain data, render-tested in Node).
 */

export interface HowItWorksStep {
  title: string;
  /** Short context after the title ("the long term"). */
  meta?: string;
  text: ReactNode;
  /** An item-type icon tile (Goals purple, Projects cyan, Tasks emerald); a numbered tile without. */
  icon?: LucideIcon;
  iconClass?: string;
}

export interface HowItWorksGuide {
  /** The dialog title, "How skills work". */
  title: string;
  /** One plain line under the title. */
  intro?: string;
  steps: HowItWorksStep[];
  /** "Good to know": deletion, today-only and other side rules. */
  notes?: ReactNode[];
  /** Every guide says how points work here, or that the page earns none. */
  points: ReactNode[];
}

export type HowItWorksFocus = 'points';

/** A number in the rules. */
export const Fig = ({ children }: { children: ReactNode }) => <span className="figure">{children}</span>;
/** Points gained. */
export const Gain = ({ children }: { children: ReactNode }) => <span className="figure text-success-text">{children}</span>;
/** Points lost. */
export const Loss = ({ children }: { children: ReactNode }) => <span className="figure text-danger-text">{children}</span>;

/** "1 pt", "+5 pts", "−3 pts" (minus sign, not a hyphen). */
export function pts(n: number, signed = false): string {
  const sign = n < 0 ? '−' : signed && n > 0 ? '+' : '';
  return `${sign}${Math.abs(n).toLocaleString('en-US')} ${Math.abs(n) === 1 ? 'pt' : 'pts'}`;
}

/** The trigger, on its own line under the page subtitle. */
export function HowItWorksButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={cx(
        '-ml-2 mt-1.5 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-content-tertiary hover:bg-overlay-subtle hover:text-content-primary',
        TAP_TARGET,
        FOCUS_RING,
        TRANSITION
      )}
    >
      <HelpCircle size={16} aria-hidden="true" />
      How it works
    </button>
  );
}

function SectionList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-4 text-xs leading-relaxed text-content-tertiary marker:text-content-subtle">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

/** The dialog body without the Dialog shell (so it renders in Node for tests). */
export function HowItWorksBody({ guide, focus, pointsId: givenPointsId }: { guide: HowItWorksGuide; focus?: HowItWorksFocus; pointsId?: string }) {
  const ownPointsId = useId();
  const pointsId = givenPointsId ?? ownPointsId;
  const notesId = useId();
  return (
    <div className="space-y-5">
      <ol className="divide-y divide-overlay-subtle border-y border-overlay-subtle">
        {guide.steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <li key={step.title} className="flex gap-3 py-3.5">
              {Icon ? (
                <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', step.iconClass)}>
                  <Icon size={15} aria-hidden="true" />
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className="figure flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-overlay-default bg-overlay-subtle text-xs font-medium text-content-tertiary"
                >
                  {i + 1}
                </span>
              )}
              <div className="min-w-0 space-y-1">
                <h3 className="item-name text-sm">
                  {step.title}
                  {step.meta && <span className="font-normal text-content-muted"> · {step.meta}</span>}
                </h3>
                <p className="text-xs leading-relaxed text-content-tertiary">{step.text}</p>
              </div>
            </li>
          );
        })}
      </ol>

      {guide.notes && guide.notes.length > 0 && (
        <section aria-labelledby={notesId} className="space-y-2">
          <h3 id={notesId} className="item-name text-sm">
            Good to know
          </h3>
          <SectionList items={guide.notes} />
        </section>
      )}

      <section aria-labelledby={pointsId} className="space-y-2">
        <h3
          id={pointsId}
          tabIndex={-1}
          data-autofocus={focus === 'points' ? true : undefined}
          className="item-name scroll-mt-2 text-sm outline-none"
        >
          Points
        </h3>
        <SectionList items={guide.points} />
      </section>
    </div>
  );
}

/** One page's guide. `focus="points"` opens it at Points (scrolled there, focus on its heading). */
export function HowItWorksDialog({
  open,
  onClose,
  guide,
  focus,
}: {
  open: boolean;
  onClose: () => void;
  guide: HowItWorksGuide;
  focus?: HowItWorksFocus;
}) {
  const pointsId = useId();
  // The Dialog focuses the Points heading ([data-autofocus]); this puts it at the top of the body.
  useEffect(() => {
    if (!open || focus !== 'points') return;
    const frame = requestAnimationFrame(() => document.getElementById(pointsId)?.scrollIntoView({ block: 'start' }));
    return () => cancelAnimationFrame(frame);
  }, [open, focus, pointsId]);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={guide.title}
      description={guide.intro}
      maxWidth="max-w-lg"
      contentKey={focus ?? 'top'}
      footer={
        <button type="button" onClick={onClose} className="btn-secondary">
          Got it
        </button>
      }
    >
      <HowItWorksBody guide={guide} focus={focus} pointsId={pointsId} />
    </Dialog>
  );
}

/** Open state for a page's guide: `show()` from the header button, `showPoints()` from the CapMeter. */
export function useHowItWorks() {
  const [state, setState] = useState<{ open: boolean; focus?: HowItWorksFocus }>({ open: false });
  const show = useCallback(() => setState({ open: true }), []);
  const showPoints = useCallback(() => setState({ open: true, focus: 'points' }), []);
  // Keeps the focus while the dialog animates out, so its content does not jump.
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  return { open: state.open, focus: state.focus, show, showPoints, close };
}
