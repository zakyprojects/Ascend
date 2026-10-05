import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx, FOCUS_RING, TRANSITION, TAP_TARGET } from './shared';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
  preventClose?: boolean;
}

const dialogStack: symbol[] = [];
let lockCount = 0;
let previousOverflow = '';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
  preventClose = false,
}) => {
  const titleId = React.useId();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const dialogIdRef = React.useRef<symbol | null>(null);
  if (!dialogIdRef.current) {
    dialogIdRef.current = Symbol();
  }
  const dialogId = dialogIdRef.current;

  const previousActiveElement = React.useRef<HTMLElement | null>(null);
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
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

    const autofocusEl = panelRef.current?.querySelector<HTMLElement>('[data-autofocus]');
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

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

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

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm motion-safe:animate-enter-fade"
        onClick={() => {
          if (!preventClose) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`modal-panel relative w-full ${maxWidth} bg-bg-800 border border-bg-700 rounded-t-2xl sm:rounded-2xl shadow-xl z-10 max-h-[90dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)] motion-safe:animate-enter-up`}
      >
        <div className="flex items-center justify-between p-4 border-b border-bg-700 sticky top-0 bg-bg-800 z-10">
          <h2 id={titleId} className="text-lg font-bold tracking-wide text-content-primary">
            {title}
          </h2>
          {!preventClose && (
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={cx(
                'inline-flex h-8 w-8 items-center justify-center rounded-lg text-content-muted hover:text-content-primary hover:bg-bg-700',
                TAP_TARGET,
                FOCUS_RING,
                TRANSITION
              )}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>,
    document.body
  );
};
