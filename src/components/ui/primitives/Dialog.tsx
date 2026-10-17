import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx, FOCUS_RING, TRANSITION, TAP_TARGET } from './shared';
import { prefersReducedMotion } from '@/lib/motion';
import { requestDiscard } from '@/lib/unsavedChanges';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One short line under the title saying what the dialog is for. */
  description?: React.ReactNode;
  /** The body; may be left empty (null) for a confirm whose description says it all. */
  children: React.ReactNode;
  /** The action row (Cancel / Save). Pinned under the scrolling body so it stays reachable on
   *  phones and above the keyboard; laid out by `.dialog-actions`. A submit button here points
   *  at its form with `form="<form id>"`. */
  footer?: React.ReactNode;
  maxWidth?: string;
  preventClose?: boolean;
  /** 'top' keeps the panel's top edge still while its content changes height (search results). */
  placement?: 'center' | 'top';
  /** Unsaved typing (`useUnsavedChanges`): Esc, backdrop and X ask "Discard changes?" first. */
  dirty?: boolean;
}

// Matches the longest exit animation (dialog-out / exit-fade, tailwind.config.js).
const EXIT_MS = 200;

const dialogStack: symbol[] = [];
let lockCount = 0;
let previousOverflow = '';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'max-w-md',
  preventClose = false,
  placement = 'center',
  dirty = false,
}) => {
  // Stays mounted for its exit animation after `open` turns false. The last open title and
  // content are shown while it leaves, so a parent clearing its data on close cannot make the
  // closing dialog flash empty or different.
  const [rendered, setRendered] = React.useState(open);
  const [exiting, setExiting] = React.useState(false);
  if (open && (!rendered || exiting)) {
    setRendered(true);
    setExiting(false);
  } else if (!open && rendered && !exiting) {
    if (prefersReducedMotion()) setRendered(false);
    else setExiting(true);
  }
  React.useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(() => {
      setRendered(false);
      setExiting(false);
    }, EXIT_MS);
    return () => clearTimeout(timer);
  }, [exiting]);
  const lastOpenContent = React.useRef({ title, description, children, footer });
  if (open) lastOpenContent.current = { title, description, children, footer };
  const content = open ? { title, description, children, footer } : lastOpenContent.current;

  const titleId = React.useId();
  const descriptionId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  // A leaving dialog is inert, not aria-hidden: inert also drops focus from the button that
  // closed it, so the browser never sees focus inside hidden content. Focus then returns to
  // the opener in the focus effect's cleanup.
  React.useLayoutEffect(() => {
    if (rootRef.current) rootRef.current.inert = exiting;
  }, [exiting, rendered]);
  const dialogIdRef = React.useRef<symbol | null>(null);
  if (!dialogIdRef.current) {
    dialogIdRef.current = Symbol();
  }
  const dialogId = dialogIdRef.current;

  const previousActiveElement = React.useRef<HTMLElement | null>(null);
  const requestClose = dirty ? () => requestDiscard(onClose) : onClose;
  const onCloseRef = React.useRef(requestClose);
  onCloseRef.current = requestClose;
  const preventCloseRef = React.useRef(preventClose);
  preventCloseRef.current = preventClose;

  React.useEffect(() => {
    if (!open) return;

    dialogStack.push(dialogId);

    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount++;

    previousActiveElement.current = document.activeElement as HTMLElement | null;

    // An explicit [data-autofocus] wins; otherwise, with a mouse/keyboard, the first text field of a
    // form dialog takes focus so typing can start at once. Touch skips this: focusing a field would
    // throw the on-screen keyboard over the dialog before the user chose to type.
    const autofocusEl =
      panelRef.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      (window.matchMedia('(pointer: fine)').matches
        ? panelRef.current?.querySelector<HTMLElement>(
            'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([disabled]):not([readonly]), textarea:not([disabled]):not([readonly])'
          )
        : null);
    if (autofocusEl) {
      autofocusEl.focus();
    } else if (panelRef.current && !panelRef.current.contains(document.activeElement)) {
      panelRef.current.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== dialogId) {
        return;
      }

      if (event.key === 'Escape') {
        event.stopPropagation();
        if (!preventCloseRef.current) {
          onCloseRef.current();
        }
        return;
      }

      if (event.key === 'Tab') {
        if (!panelRef.current) return;
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => el.getClientRects().length > 0);

        if (focusables.length === 0) {
          event.preventDefault();
          panelRef.current.focus();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;

        if (!panelRef.current.contains(active)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
          return;
        }

        if (event.shiftKey) {
          if (active === first || active === panelRef.current) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (active === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Touch: the on-screen keyboard opens after the field takes focus and shrinks the viewport,
    // so bring the focused field back into the dialog's visible body once it has settled.
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.matches('input, textarea, select') || window.matchMedia('(pointer: fine)').matches) return;
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => target.scrollIntoView({ block: 'nearest' }), 300);
    };
    const panel = panelRef.current;
    panel?.addEventListener('focusin', handleFocusIn);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      panel?.removeEventListener('focusin', handleFocusIn);
      clearTimeout(focusTimer);

      const idx = dialogStack.indexOf(dialogId);
      if (idx !== -1) {
        dialogStack.splice(idx, 1);
      }

      lockCount--;
      if (lockCount === 0) {
        document.body.style.overflow = previousOverflow;
      }

      if (previousActiveElement.current && previousActiveElement.current.isConnected) {
        previousActiveElement.current.focus();
      }
    };
  }, [open, dialogId]);

  if (!rendered) return null;

  return createPortal(
    <div
      ref={rootRef}
      className={cx(
        'fixed inset-0 z-modal flex justify-center p-3 sm:p-4',
        placement === 'top' ? 'items-start sm:pt-[12vh]' : 'items-center',
        'pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]',
        exiting && 'pointer-events-none'
      )}
    >
      <div
        className={cx(
          'dialog-backdrop absolute inset-0',
          exiting ? 'animate-exit-fade' : 'motion-safe:animate-enter-fade'
        )}
        onClick={() => {
          if (!preventClose) requestClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={content.description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          'modal-panel relative flex w-full max-h-full flex-col overflow-hidden bg-bg-800 border border-bg-700 rounded-2xl shadow-xl z-10',
          maxWidth,
          exiting ? 'animate-dialog-out' : 'motion-safe:animate-dialog-in'
        )}
      >
        <div className="shrink-0 border-b border-bg-700">
          <div className="flex items-start justify-between gap-3 px-4 py-3.5 sm:py-4">
            <div className="min-w-0 pt-0.5">
              <h2 id={titleId} className="text-base sm:text-lg font-semibold text-content-primary">
                {content.title}
              </h2>
              {content.description && (
                <p id={descriptionId} className="mt-1 text-sm text-content-muted">
                  {content.description}
                </p>
              )}
            </div>
            {!preventClose && (
              <button
                type="button"
                aria-label="Close"
                onClick={requestClose}
                className={cx(
                  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-content-muted hover:text-content-primary hover:bg-bg-700',
                  TAP_TARGET,
                  FOCUS_RING,
                  TRANSITION
                )}
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        {content.children != null && content.children !== false && (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{content.children}</div>
        )}
        {content.footer && (
          <div className="dialog-actions shrink-0 border-t border-bg-700 px-4 py-3">{content.footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
};
