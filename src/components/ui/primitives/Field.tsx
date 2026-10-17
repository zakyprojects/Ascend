import React from 'react';
import { AlertCircle, ChevronDown } from 'lucide-react';
import { cx } from './shared';
import { toUserMessage } from '@/lib/userMessage';

export interface BaseFieldProps {
  label?: string;
  hint?: string;
  error?: string;
  /** Adds a quiet "Optional" marker after the label. */
  optional?: boolean;
}

/**
 * The one problem a form is showing: on a field (`field` = that control's or FieldGroup's id)
 * or about the whole form (no `field`). Ascend shows one problem at a time, where it is.
 */
export interface FormIssue {
  message: string;
  field?: string;
}

export const FormIssueContext = React.createContext<FormIssue | null>(null);

/**
 * The app's single error look: a bubble attached under the field it is about, with the brand's
 * alert mark. `attached` draws the pointer to the field; a form-wide message has none.
 */
export function FieldErrorBubble({ id, message, attached = true }: { id?: string; message: string; attached?: boolean }) {
  return (
    <div
      id={id}
      role="alert"
      className={cx(
        'field-error relative mt-2 flex w-fit max-w-full items-start gap-2.5 rounded-xl border border-rose-500/40 bg-bg-700 py-2 pl-2 pr-3 text-sm text-content-primary shadow-lg motion-safe:animate-enter-up',
        attached && 'field-error-attached'
      )}
    >
      <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-rose-600 text-white">
        <AlertCircle size={14} strokeWidth={2.5} aria-hidden="true" />
      </span>
      <span className="leading-5">{message}</span>
    </div>
  );
}

/** The issue a field shows: its own `error` prop wins, else the form's issue when it names this id. */
export function useFieldIssue(id: string, error?: string): string | undefined {
  const issue = React.useContext(FormIssueContext);
  return error || (issue?.field === id ? issue.message : undefined);
}

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    BaseFieldProps {}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement>,
    BaseFieldProps {}

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement>,
    BaseFieldProps {}

interface FieldShellProps {
  id: string;
  label?: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: React.ReactElement;
}

function FieldShell({ id, label, hint, error, optional, children }: FieldShellProps) {
  const hasLabel = Boolean(label);
  const hasHint = Boolean(hint);
  const hasError = Boolean(error);

  // Always the same wrapper, so the control is never remounted (and never loses focus) when a
  // message appears.
  return (
    <div className="w-full" data-field={id}>
      {hasLabel && (
        <label htmlFor={id} className="label block mb-1.5">
          {label}
          {optional && <span className="ml-1 font-normal text-content-muted">(optional)</span>}
        </label>
      )}
      {children}
      {hasError && <FieldErrorBubble id={`${id}-error`} message={error!} />}
      {hasHint && !hasError && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-content-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

const controlBase =
  'w-full rounded-xl border bg-bg-700 text-content-primary placeholder:text-content-disabled px-3.5 py-2.5 text-base sm:text-sm focus:outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed';

function useFieldLinking(
  idProp?: string,
  label?: string,
  ariaLabel?: string,
  ariaLabelledBy?: string,
  error?: string,
  hint?: string
) {
  const generatedId = React.useId();
  const id = idProp || generatedId;
  const hasName = Boolean(label || ariaLabel || ariaLabelledBy);

  React.useEffect(() => {
    if (import.meta.env.DEV && !hasName) {
      console.warn(`[Field] Neither label, aria-label, nor aria-labelledby was provided for field "${id}"`);
    }
  }, [hasName, id]);

  const shownError = useFieldIssue(id, error);
  const errorId = shownError ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;

  return { id, errorId, hintId, error: shownError };
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hint,
      error: errorProp,
      optional,
      id: idProp,
      className,
      'aria-describedby': describedByProp,
      ...props
    },
    ref
  ) => {
    const { id, errorId, hintId, error } = useFieldLinking(
      idProp,
      label,
      props['aria-label'],
      props['aria-labelledby'],
      errorProp,
      hint
    );

    return (
      <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
        <input
          ref={ref}
          id={id}
          aria-describedby={
            [describedByProp, errorId, hintId].filter(Boolean).join(' ') || undefined
          }
          aria-invalid={error ? true : undefined}
          className={cx(
            controlBase,
            error
              ? 'border-error focus:border-error focus:ring-error/20'
              : 'border-overlay-default hover:border-overlay-medium focus:border-primary-500 focus:ring-primary-500/20',
            className
          )}
          {...props}
        />
      </FieldShell>
    );
  }
);

Input.displayName = 'Input';

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      label,
      hint,
      error: errorProp,
      optional,
      id: idProp,
      className,
      children,
      'aria-describedby': describedByProp,
      ...props
    },
    ref
  ) => {
    const { id, errorId, hintId, error } = useFieldLinking(
      idProp,
      label,
      props['aria-label'],
      props['aria-labelledby'],
      errorProp,
      hint
    );

    return (
      <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
        <div className="relative w-full">
          <select
            ref={ref}
            id={id}
            aria-describedby={
              [describedByProp, errorId, hintId].filter(Boolean).join(' ') || undefined
            }
            aria-invalid={error ? true : undefined}
            className={cx(
              controlBase,
              'appearance-none pr-9',
              error
                ? 'border-error focus:border-error focus:ring-error/20'
                : 'border-overlay-default hover:border-overlay-medium focus:border-primary-500 focus:ring-primary-500/20',
              className
            )}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            size={16}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-content-muted"
          />
        </div>
      </FieldShell>
    );
  }
);

Select.displayName = 'Select';

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      label,
      hint,
      error: errorProp,
      optional,
      id: idProp,
      className,
      'aria-describedby': describedByProp,
      ...props
    },
    ref
  ) => {
    const { id, errorId, hintId, error } = useFieldLinking(
      idProp,
      label,
      props['aria-label'],
      props['aria-labelledby'],
      errorProp,
      hint
    );

    return (
      <FieldShell id={id} label={label} hint={hint} error={error} optional={optional}>
        <textarea
          ref={ref}
          id={id}
          aria-describedby={
            [describedByProp, errorId, hintId].filter(Boolean).join(' ') || undefined
          }
          aria-invalid={error ? true : undefined}
          className={cx(
            controlBase,
            'min-h-[80px] resize-y',
            error
              ? 'border-error focus:border-error focus:ring-error/20'
              : 'border-overlay-default hover:border-overlay-medium focus:border-primary-500 focus:ring-primary-500/20',
            className
          )}
          {...props}
        />
      </FieldShell>
    );
  }
);

Textarea.displayName = 'Textarea';

export interface NumberFieldProps
  extends Omit<InputProps, 'type' | 'value' | 'onChange' | 'defaultValue'> {
  value: number;
  onValueChange: (value: number) => void;
  /** Allow a decimal point (decimal keypad on phones). Whole numbers by default. */
  decimal?: boolean;
}

/**
 * A number input that can be cleared while typing. A plain controlled `type="number"` writes
 * `Number('') = 0` back the moment the field is emptied, so "30" can't be replaced by "45" on a
 * phone. Here the text is kept as typed and only a valid number is reported; an empty field is
 * caught by `required`/`min` on submit, and on blur the field shows the value actually kept.
 */
export const NumberField = React.forwardRef<HTMLInputElement, NumberFieldProps>(
  ({ value, onValueChange, decimal = false, onBlur, step, ...props }, ref) => {
    const [draft, setDraft] = React.useState(() => String(value));
    // Follow the value when the parent changes it (reset on open, a preset button).
    const [lastValue, setLastValue] = React.useState(value);
    if (value !== lastValue) {
      setLastValue(value);
      if (Number(draft) !== value || draft.trim() === '') setDraft(String(value));
    }

    return (
      <Input
        ref={ref}
        type="number"
        inputMode={decimal ? 'decimal' : 'numeric'}
        step={step ?? (decimal ? 'any' : 1)}
        value={draft}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          const next = Number(text);
          if (text.trim() !== '' && Number.isFinite(next)) onValueChange(next);
        }}
        onBlur={(e) => {
          // A required field left empty stays empty, so Save shows "Enter a number." instead of
          // quietly saving the old value (blur runs before the Save click). An optional one shows
          // the value that is kept, as does a value the parent adjusted (clamped).
          const empty = draft.trim() === '';
          if ((empty && !props.required) || (!empty && Number(draft) !== value)) setDraft(String(value));
          onBlur?.(e);
        }}
        {...props}
      />
    );
  }
);

NumberField.displayName = 'NumberField';

export interface FormController {
  /** Show a problem found after submit (server answer, a rule the fields can't express). */
  showError: (message: string, field?: string) => void;
  clear: () => void;
}

interface BoundController extends FormController {
  bind: (setter: ((issue: FormIssue | null) => void) | null) => void;
}

/** A handle for showing a form's problems from its submit handler. Pass it to `<Form controller>`. */
export function useFormController(): FormController {
  return React.useMemo<BoundController>(() => {
    let setter: ((issue: FormIssue | null) => void) | null = null;
    return {
      bind: (next) => {
        setter = next;
      },
      showError: (message, field) => setter?.({ message, field }),
      clear: () => setter?.(null),
    };
  }, []);
}

export interface FormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  /** Runs only when every field passes its rules (required, min/max, length, type, `validate`). */
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  /** Rules the fields can't express (two fields that must match, a choice in a FieldGroup).
   *  Return the first problem, or null. Runs after the fields' own rules pass. */
  validate?: () => FormIssue | null;
  controller?: FormController;
  /** Where a form-wide message goes: 'end' of the form (default) or wherever `<FormAlert />` sits. */
  alert?: 'end' | 'manual';
  /** Told each time a problem is shown (e.g. the auth mascot reacts). */
  onIssue?: (issue: FormIssue) => void;
}

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const TEXT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel', 'password']);

// Native `required` accepts a value of only spaces; a required text field must hold real text.
function isBlankText(el: Control): boolean {
  const isText = el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && TEXT_TYPES.has(el.type));
  return isText && el.required && !el.disabled && el.value.trim() === '';
}

function messageFor(el: Control): string {
  const v = el.validity;
  const isNumber = el instanceof HTMLInputElement && el.type === 'number';
  const isDateLike = el instanceof HTMLInputElement && ['date', 'time', 'datetime-local', 'month', 'week'].includes(el.type);
  if (v.valueMissing || isBlankText(el)) {
    if (el instanceof HTMLSelectElement) return 'Choose an option.';
    if (isNumber) return 'Enter a number.';
    if (isDateLike) return el.type === 'time' ? 'Pick a time.' : 'Pick a date.';
    return 'Fill in this field.';
  }
  if (v.badInput) return isNumber ? 'Enter a number.' : 'Check this field.';
  if (v.typeMismatch) return (el as HTMLInputElement).type === 'email' ? 'Enter a valid email address.' : 'Check the format.';
  const isTime = el instanceof HTMLInputElement && el.type === 'time';
  if (v.rangeUnderflow) return isTime ? 'Pick a later time.' : isDateLike ? 'Pick a later date.' : `Enter ${(el as HTMLInputElement).min} or more.`;
  if (v.rangeOverflow) return isTime ? 'Pick an earlier time.' : isDateLike ? 'Pick an earlier date.' : `Enter ${(el as HTMLInputElement).max} or less.`;
  if (v.stepMismatch) {
    const step = (el as HTMLInputElement).step;
    if (!isNumber) return 'Check this field.';
    return !step || step === '1' ? 'Enter a whole number.' : `Use steps of ${step}.`;
  }
  if (v.tooLong) return `Keep it to ${(el as HTMLInputElement).maxLength} characters.`;
  if (v.tooShort) return `Use at least ${(el as HTMLInputElement).minLength} characters.`;
  if (v.patternMismatch) return el.title || 'Check the format.';
  return 'Check this field.';
}

/** Moves to the field a problem is about: focus without the jump, then scroll it to the middle. */
function revealField(form: HTMLFormElement | null, fieldId: string | undefined) {
  if (!form) return;
  const target = fieldId
    ? form.ownerDocument.getElementById(fieldId)
    : form.querySelector<HTMLElement>('[data-form-alert]');
  if (!target) return;
  const focusable = target.matches('input, select, textarea, button')
    ? target
    : target.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])') ?? target;
  if (fieldId) focusable.focus({ preventScroll: true });
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Scroll the field's whole block (label to message) into view, not just the control.
  const block = (target.closest('[data-field]') as HTMLElement | null) ?? target;
  block.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
}

/**
 * Every Ascend form. On submit it checks the fields' own rules, then `validate`; the first problem
 * is shown as one bubble under that field, the field takes focus and is scrolled into view. A
 * problem from the submit handler (`controller.showError`) is shown the same way, on its field or
 * as a form-wide message. Editing the field (or, for a form-wide message, anything) clears it.
 * A submit handler that throws without its own catch gets a form-wide bubble (safety net).
 * Never pair a form with an error toast.
 */
export const Form = React.forwardRef<HTMLFormElement, FormProps>(
  ({ onSubmit, validate, controller, alert = 'end', onIssue, children, onInput, onClick, ...props }, ref) => {
    const [issue, setIssue] = React.useState<FormIssue | null>(null);
    // Bumped on every new problem so the same message shown twice still moves to its field.
    const [revealTick, setRevealTick] = React.useState(0);
    const formRef = React.useRef<HTMLFormElement | null>(null);

    const onIssueRef = React.useRef(onIssue);
    onIssueRef.current = onIssue;
    const show = React.useCallback((next: FormIssue | null) => {
      setIssue(next);
      if (next) {
        setRevealTick((t) => t + 1);
        onIssueRef.current?.(next);
      }
    }, []);

    React.useEffect(() => {
      const bound = controller as BoundController | undefined;
      bound?.bind(show);
      return () => bound?.bind(null);
    }, [controller, show]);

    // Mark the field with the problem (also raw `.input` controls, which style aria-invalid).
    React.useEffect(() => {
      if (!issue?.field) return;
      const el = formRef.current?.ownerDocument.getElementById(issue.field);
      if (!el || el.hasAttribute('aria-invalid')) return;
      el.setAttribute('aria-invalid', 'true');
      return () => el.removeAttribute('aria-invalid');
    }, [issue]);

    React.useEffect(() => {
      if (revealTick && issue) revealField(formRef.current, issue.field);
      // Only a newly shown problem moves focus; re-renders with the same problem don't.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [revealTick]);

    const clearFor = (target: EventTarget | null) => {
      if (!issue) return;
      if (!issue.field) {
        show(null);
        return;
      }
      const el = target as HTMLElement | null;
      const owner = el?.closest?.('[data-field]')?.getAttribute('data-field') ?? el?.id;
      if (owner === issue.field || el?.id === issue.field) show(null);
    };

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      for (const el of Array.from(form.elements)) {
        if (
          (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) &&
          !el.disabled &&
          (!el.validity.valid || isBlankText(el))
        ) {
          show({ message: messageFor(el), field: el.id || undefined });
          return;
        }
      }
      const rule = validate?.();
      if (rule) {
        show(rule);
        return;
      }
      show(null);
      // Safety net: a submit handler that throws (or rejects) without its own catch still shows a
      // form-wide bubble instead of failing silently. Handlers that catch keep their own message.
      const fail = (err: unknown) => {
        console.error('Form submit failed:', err);
        show({ message: toUserMessage(err, "Couldn't save. Try again.") });
      };
      try {
        const result = onSubmit(event);
        if (result && typeof (result as Promise<void>).then === 'function') (result as Promise<void>).catch(fail);
      } catch (err) {
        fail(err);
      }
    };

    return (
      <FormIssueContext.Provider value={issue}>
        <form
          ref={(node) => {
            formRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          noValidate
          onSubmit={handleSubmit}
          onInput={(e) => {
            clearFor(e.target);
            onInput?.(e);
          }}
          onClick={(e) => {
            // Choices made by tapping (FieldGroup buttons) clear their message too.
            if ((e.target as HTMLElement).closest('button[type="button"]')) clearFor(e.target);
            onClick?.(e);
          }}
          {...props}
        >
          {children}
          {alert === 'end' && <FormAlert />}
        </form>
      </FormIssueContext.Provider>
    );
  }
);

Form.displayName = 'Form';

/** The form-wide message (not about one field), in the same bubble. Placed by `<Form alert="manual">`. */
export function FormAlert() {
  const issue = React.useContext(FormIssueContext);
  if (!issue || issue.field) return null;
  return (
    <div data-form-alert>
      <FieldErrorBubble message={issue.message} attached={false} />
    </div>
  );
}

/** The message slot for a raw control (not an Input/Select/Textarea) inside a Form: place it
 *  right after the control and name the control's id. */
export function FieldMessage({ htmlFor }: { htmlFor: string }) {
  const message = useFieldIssue(htmlFor);
  return message ? <FieldErrorBubble id={`${htmlFor}-error`} message={message} /> : null;
}

/**
 * A labelled set of choices that isn't one control (avatar grid, segmented options, colour
 * swatches). Its id is what `validate` / `showError` name; the message shows under the set.
 */
export function FieldGroup({
  id,
  label,
  optional,
  hint,
  error,
  className,
  children,
}: {
  id: string;
  label: React.ReactNode;
  optional?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const message = useFieldIssue(id, error);
  return (
    <div data-field={id} className={className}>
      <p id={`${id}-label`} className="label block mb-1.5">
        {label}
        {optional && <span className="ml-1 font-normal text-content-muted">(optional)</span>}
      </p>
      <div
        id={id}
        role="group"
        aria-labelledby={`${id}-label`}
        aria-describedby={message ? `${id}-error` : hint ? `${id}-hint` : undefined}
        aria-invalid={message ? true : undefined}
        tabIndex={-1}
        className={cx('rounded-xl outline-none', message && 'ring-2 ring-rose-500/40 ring-offset-2 ring-offset-bg-800')}
      >
        {children}
      </div>
      {message && <FieldErrorBubble id={`${id}-error`} message={message} />}
      {hint && !message && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-content-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Two fields side by side from sm up; stacked on phones so selects and numbers keep their room. */
export function FieldRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}>{children}</div>;
}
