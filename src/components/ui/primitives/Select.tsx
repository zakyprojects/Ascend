import React from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cx } from './shared';
import { FieldShell, fieldBorder, controlBase, useFieldLinking, type BaseFieldProps } from './Field';
import {
  anchorOutOfView,
  firstEnabled,
  lastEnabled,
  moveActive,
  parseOptions,
  placeMenu,
  typeahead,
  type Box,
  type Placement,
} from './selectModel';

/**
 * The AscendDay dropdown: every pick-one list in the app (never the browser's own picker).
 * A button (`role="combobox"`) opens an anchored list (`role="listbox"`) under it, or above it
 * near the bottom of the screen. Focus stays on the button (aria-activedescendant), so a Dialog's
 * focus trap, Escape and "Discard changes?" keep working. A hidden native <select> carries the
 * value: form rules (`required` → "Choose an option."), `name`, and the real `change` event the
 * `onChange` handlers read. Options are ordinary `<option value disabled>label</option>` children;
 * a disabled `value=""` option is the placeholder (shown in the button, not in the list).
 */
export interface SelectProps extends BaseFieldProps {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  children?: React.ReactNode;
  /** field = form field look; toolbar = page filter/sort; compact = card footer status. */
  size?: 'field' | 'toolbar' | 'compact';
  /** Classes for the button. */
  className?: string;
  /** Classes for the wrapper (width, flex) of toolbar/compact selects. */
  wrapperClassName?: string;
  title?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

// One list open at a time: opening another closes this one.
let closeOpenList: (() => void) | null = null;

const TYPEAHEAD_RESET_MS = 600;

const toolbarTrigger =
  'w-full rounded-xl border border-overlay-default bg-bg-700 text-content-primary py-2 pl-3 pr-8 text-base sm:text-sm hover:border-overlay-medium focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition-[border-color,box-shadow] duration-200';

const compactTrigger =
  'min-h-9 rounded-xl border border-overlay-default bg-bg-900 py-1.5 pl-2.5 pr-7 text-base text-content-secondary focus:border-primary-500/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs';

/** The visible part of the page, minus the notch/home-bar safe areas (read once per open). */
function visibleArea(): Box {
  const vv = window.visualViewport;
  const box: Box = vv
    ? { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height }
    : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const [t, r, b, l] = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map((v) => parseFloat(v) || 0);
  probe.remove();
  return { top: box.top + t, left: box.left + l, width: Math.max(0, box.width - l - r), height: Math.max(0, box.height - t - b) };
}

function rectBox(el: Element): Box {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(function Select(
  {
    label,
    hint,
    error: errorProp,
    optional,
    id: idProp,
    name,
    value: valueProp,
    defaultValue,
    onChange,
    onValueChange,
    disabled = false,
    required,
    children,
    size = 'field',
    className,
    wrapperClassName,
    title,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    'aria-describedby': describedByProp,
  },
  ref
) {
  const { id, errorId, hintId, error } = useFieldLinking(idProp, label, ariaLabel, ariaLabelledBy, errorProp, hint);
  const { options, placeholder, all } = React.useMemo(() => parseOptions(children), [children]);

  const controlled = valueProp !== undefined;
  // Uncontrolled: like native, the first enabled option until one is picked.
  const [inner, setInner] = React.useState(() => defaultValue ?? firstEnabledValue(all));
  const value = controlled ? valueProp : inner;
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const [place, setPlace] = React.useState<Placement | null>(null);

  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const proxyRef = React.useRef<HTMLSelectElement | null>(null);
  const listRef = React.useRef<HTMLUListElement | null>(null);
  const typed = React.useRef({ text: '', at: 0 });
  const centerOnOpen = React.useRef(false);

  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;

  const close = React.useCallback(() => {
    setOpen(false);
    setPlace(null);
    if (closeOpenList === closeRef.current) closeOpenList = null;
  }, []);
  const closeRef = React.useRef(close);
  closeRef.current = close;

  const openAt = (index: number) => {
    if (disabled) return;
    if (closeOpenList && closeOpenList !== closeRef.current) closeOpenList();
    closeOpenList = closeRef.current;
    centerOnOpen.current = true;
    setActive(index >= 0 ? index : selectedIndex >= 0 ? selectedIndex : firstEnabled(options));
    setOpen(true);
  };

  // Choosing writes the hidden select and fires its native input + change events, so the Form
  // clears this field's message and React hands the call site a real ChangeEvent<HTMLSelectElement>.
  const choose = (index: number) => {
    const option = options[index];
    close();
    if (!option || option.disabled || option.value === value) return;
    const proxy = proxyRef.current;
    if (proxy) {
      proxy.value = option.value;
      proxy.dispatchEvent(new Event('input', { bubbles: true }));
      proxy.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      commit(option.value);
    }
  };

  const commit = (next: string) => {
    if (!controlled) setInner(next);
    onValueChange?.(next);
  };

  // The list closes when the select is disabled or goes away while open.
  React.useEffect(() => {
    if (open && disabled) close();
  }, [open, disabled, close]);
  React.useEffect(() => () => {
    if (closeOpenList === closeRef.current) closeOpenList = null;
  }, []);

  // Options changed while open (a sync brought a new skill): keep the active option by value.
  const activeValue = React.useRef<string | null>(null);
  activeValue.current = active >= 0 && active < options.length ? options[active].value : null;
  React.useEffect(() => {
    if (!open || activeValue.current === null) return;
    const i = options.findIndex((o) => o.value === activeValue.current);
    setActive(i >= 0 ? i : Math.min(active, options.length - 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options]);

  // Place the list (and again on scroll, the on-screen keyboard, window resize). Never closes on
  // resize: on Android the keyboard folding away after a text field fires one right after opening.
  const reposition = React.useCallback(() => {
    const trigger = triggerRef.current;
    const list = listRef.current;
    if (!trigger || !list) return;
    const area = visibleArea();
    const anchor = rectBox(trigger);
    if (anchorOutOfView(anchor, area)) {
      close();
      return;
    }
    const border = list.offsetHeight - list.clientHeight;
    setPlace(placeMenu(anchor, area, list.scrollHeight + border));
  }, [close]);

  React.useLayoutEffect(() => {
    if (open) reposition();
  }, [open, options.length, reposition]);

  React.useEffect(() => {
    if (!open) return;
    let frame = 0;
    const schedule = (event?: Event) => {
      if (event && listRef.current && event.target instanceof Node && listRef.current.contains(event.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reposition);
    };
    const vv = window.visualViewport;
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    vv?.addEventListener('resize', schedule);
    vv?.addEventListener('scroll', schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      vv?.removeEventListener('resize', schedule);
      vv?.removeEventListener('scroll', schedule);
    };
  }, [open, reposition]);

  // Keep the active option in view: centred on open, nearest edge while moving.
  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !place || !list || active < 0) return;
    const el = list.querySelector<HTMLElement>(`#${CSS.escape(optionId(active))}`);
    if (!el) return;
    if (centerOnOpen.current) {
      centerOnOpen.current = false;
      list.scrollTop = el.offsetTop - (list.clientHeight - el.offsetHeight) / 2;
      return;
    }
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop - 6;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 6;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place, active]);

  const typeTo = (key: string): number => {
    const now = performance.now();
    const t = typed.current;
    t.text = now - t.at > TYPEAHEAD_RESET_MS ? key : t.text + key;
    t.at = now;
    const from = open ? active : selectedIndex;
    return typeahead(options, from, t.text);
  };
  const midTypeahead = () => performance.now() - typed.current.at <= TYPEAHEAD_RESET_MS && typed.current.text !== '';

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    const { key } = event;
    const printable = key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;

    if (!open) {
      if (key === 'Enter' || key === 'ArrowDown' || key === 'ArrowUp' || (key === ' ' && !midTypeahead())) {
        event.preventDefault();
        openAt(-1);
      } else if (key === 'Home' || key === 'End') {
        event.preventDefault();
        openAt(key === 'Home' ? firstEnabled(options) : lastEnabled(options));
      } else if (printable) {
        event.preventDefault();
        const i = typeTo(key);
        if (i >= 0) openAt(i);
      }
      return;
    }

    switch (key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (event.altKey && key === 'ArrowUp') choose(active);
        else setActive((i) => moveActive(options, i, key === 'ArrowDown' ? 1 : -1));
        return;
      case 'PageDown':
      case 'PageUp':
        event.preventDefault();
        setActive((i) => moveActive(options, i, key === 'PageDown' ? 10 : -10));
        return;
      case 'Home':
      case 'End':
        event.preventDefault();
        setActive(key === 'Home' ? firstEnabled(options) : lastEnabled(options));
        return;
      case 'Enter':
        // Never submits the form around it (quick-add rows): Enter only picks.
        event.preventDefault();
        choose(active);
        return;
      case 'Escape':
        // Only the list closes: the Dialog's own Escape (on document) never sees this key.
        event.preventDefault();
        event.stopPropagation();
        event.nativeEvent.stopImmediatePropagation();
        close();
        return;
      case 'Tab':
        // Picks the active option and lets focus move on (native and APG behaviour).
        choose(active);
        return;
      default:
        if (key === ' ' && !midTypeahead()) {
          event.preventDefault();
          choose(active);
        } else if (printable) {
          event.preventDefault();
          const i = typeTo(key);
          if (i >= 0) setActive(i);
        }
    }
  };

  const describedBy = [describedByProp, errorId, hintId].filter(Boolean).join(' ') || undefined;
  const shown = selected ?? placeholder;
  const showsPlaceholder = !selected;
  const shownText = selected ? selected.text : placeholder?.text ?? '';
  const fits = size !== 'field';

  const trigger = (
    <button
      ref={(node) => {
        triggerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      id={id}
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      aria-required={required || undefined}
      disabled={disabled}
      title={title ?? (shownText || undefined)}
      data-no-swipe=""
      data-no-press=""
      onClick={(event) => {
        // A status picker sits inside cards: its taps are not the card's.
        event.stopPropagation();
        if (open) close();
        else openAt(-1);
      }}
      onKeyDown={onKeyDown}
      onKeyUp={(event) => {
        // Space activates a button on keyup; the keydown already acted.
        if (event.key === ' ') event.preventDefault();
      }}
      className={cx(
        'relative flex min-w-0 max-w-full items-center text-left',
        size === 'field' && cx(controlBase, 'pr-9', fieldBorder(Boolean(error))),
        size === 'toolbar' && toolbarTrigger,
        size === 'compact' && compactTrigger,
        className
      )}
    >
      {fits ? (
        // A toolbar/card select is as wide as its longest option (as native), so picking never
        // makes the row jump.
        <span className="grid min-w-0">
          {all.map((o, i) => (
            <span key={i} aria-hidden="true" className="invisible col-start-1 row-start-1 h-0 truncate">
              {o.label}
            </span>
          ))}
          <span className={cx('col-start-1 row-start-1 truncate', showsPlaceholder && 'text-content-disabled')}>
            {shown ? shown.label : '—'}
          </span>
        </span>
      ) : (
        <span className={cx('block min-w-0 flex-1 truncate', showsPlaceholder && 'text-content-disabled')}>
          {shown ? shown.label : '—'}
        </span>
      )}
      <ChevronDown
        size={size === 'field' ? 16 : 14}
        aria-hidden="true"
        className={cx(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-content-muted motion-safe:transition-transform motion-safe:duration-200',
          size === 'field' ? 'right-3' : size === 'toolbar' ? 'right-2.5' : 'right-2',
          open && 'rotate-180'
        )}
      />
    </button>
  );

  // The hidden native select: validity, name, and the change event. Not focusable, not read out.
  const proxy = (
    <select
      ref={proxyRef}
      id={`${id}-native`}
      data-field-for={id}
      name={name}
      value={value}
      required={required}
      disabled={disabled}
      hidden
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        commit(event.target.value);
        onChange?.(event);
      }}
    >
      {all.map((o, i) => (
        <option key={i} value={o.value} disabled={o.disabled}>
          {o.text}
        </option>
      ))}
    </select>
  );

  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  // Pointer and click events inside the portal bubble to the React parents (cards, swipe rows,
  // the Form's click handler); keep them here. mousedown is cancelled so focus stays on the button.
  const portalGuards = {
    onPointerDown: stop,
    onTouchStart: stop,
    onMouseDown: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
    },
    onClick: stop,
  };

  const list =
    open &&
    createPortal(
      <>
        {/* An outside tap only closes the list (as native): it never reaches the dialog backdrop
            ("Discard changes?") or a button under it. */}
        <div
          aria-hidden="true"
          className="fixed inset-0 z-popover"
          data-no-swipe=""
          {...portalGuards}
          onClick={(event) => {
            event.stopPropagation();
            close();
          }}
        />
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label || ariaLabel}
          aria-labelledby={label || ariaLabel ? undefined : ariaLabelledBy}
          data-no-swipe=""
          data-side={place?.side ?? 'below'}
          {...portalGuards}
          style={
            place
              ? { top: place.top, left: place.left, width: place.width, maxHeight: place.maxHeight }
              : { top: 0, left: 0, visibility: 'hidden', maxHeight: 320 }
          }
          className={cx(
            'fixed z-popover overflow-y-auto overscroll-contain rounded-2xl border border-overlay-default bg-bg-800 p-1.5 shadow-2xl [touch-action:pan-y]',
            place && 'select-menu'
          )}
        >
          {options.length === 0 && (
            <li role="option" aria-disabled="true" aria-selected="false" className="px-3 py-2.5 text-sm text-content-muted">
              Nothing to choose yet
            </li>
          )}
          {options.map((o, i) => {
            const isSelected = i === selectedIndex;
            return (
              <li
                key={`${i}:${o.value}`}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={o.disabled || undefined}
                onMouseMove={() => {
                  if (!o.disabled && i !== active) setActive(i);
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!o.disabled) choose(i);
                }}
                className={cx(
                  'flex min-h-11 items-start gap-2 rounded-xl px-3 py-2.5 text-base sm:min-h-9 sm:py-2 sm:text-sm',
                  o.disabled ? 'cursor-not-allowed text-content-disabled' : 'cursor-pointer text-content-primary',
                  i === active && !o.disabled && 'bg-bg-700',
                  isSelected && 'font-medium'
                )}
              >
                <span className="min-w-0 flex-1 break-words">{o.label}</span>
                <Check
                  size={16}
                  aria-hidden="true"
                  className={cx('mt-0.5 shrink-0 text-brand-text', !isSelected && 'invisible')}
                />
              </li>
            );
          })}
        </ul>
      </>,
      document.body
    );

  if (size === 'field') {
    return (
      <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
        <div className={cx('relative w-full', wrapperClassName)}>
          {trigger}
          {proxy}
          {list}
        </div>
      </FieldShell>
    );
  }
  return (
    <div
      className={cx('relative', size === 'toolbar' ? 'w-full sm:w-auto shrink-0' : 'inline-flex max-w-full', wrapperClassName)}
    >
      {trigger}
      {proxy}
      {list}
    </div>
  );
});

function firstEnabledValue(all: ReturnType<typeof parseOptions>['all']): string {
  return all.find((o) => !o.disabled)?.value ?? '';
}

export type ToolbarSelectProps = Omit<SelectProps, 'label' | 'hint' | 'error' | 'optional' | 'size'> & {
  'aria-label': string;
};

/** Filter/sort dropdown for page toolbars: no label row, so an accessible name is required. */
export const ToolbarSelect = React.forwardRef<HTMLButtonElement, ToolbarSelectProps>(function ToolbarSelect(props, ref) {
  return <Select ref={ref} size="toolbar" {...props} />;
});
