import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx, FOCUS_RING } from '@/components/ui/primitives/shared';

interface DoneSectionProps {
  /** Heading, e.g. "Done". The count follows it. */
  label: string;
  count: number;
  /** Holds the section open while true (a search is typed, so matches are never hidden). */
  forceOpen?: boolean;
  children: ReactNode;
}

/** Finished items folded under the open list: closed by default, opened by its heading. */
export function DoneSection({ label, count, forceOpen = false, children }: DoneSectionProps) {
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const expanded = open || forceOpen;
  if (count === 0) return null;
  return (
    <section>
      <h2 className="section-title">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={() => setOpen((v) => !v)}
          className={cx('flex w-full items-center gap-2 rounded-xl py-1 text-left', FOCUS_RING)}
        >
          <span>
            {label} <span className="figure font-normal text-content-muted">· {count}</span>
          </span>
          {!forceOpen && (
            <ChevronDown
              size={18}
              aria-hidden="true"
              className={cx(
                'shrink-0 text-content-muted transition-transform duration-base ease-emphasized motion-reduce:transition-none',
                open && 'rotate-180'
              )}
            />
          )}
        </button>
      </h2>
      {expanded && (
        <div id={contentId} className="mt-3">
          {children}
        </div>
      )}
    </section>
  );
}
