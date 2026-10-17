import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from './shared';

export interface BaseFieldProps {
  label?: string;
  hint?: string;
  error?: string;
  /** Adds a quiet "Optional" marker after the label. */
  optional?: boolean;
}

/** Field id -> message, filled by <Form> when a submit fails validation. */
export const FormErrorsContext = React.createContext<Record<string, string>>({});

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

  if (!hasLabel && !hasHint && !hasError) {
    return children;
  }

  return (
    <div className="w-full">
      {hasLabel && (
        <label htmlFor={id} className="label block mb-1.5">
          {label}
          {optional && <span className="ml-1 font-normal text-content-muted">(optional)</span>}
        </label>
      )}
      {children}
      {hasError && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-error-text">
          {error}
        </p>
      )}
      {hasHint && (
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

  const formError = React.useContext(FormErrorsContext)[id];
  const shownError = error || formError;
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
 * caught by `required`/`min` on submit, and on blur it shows the last valid value again.
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
          if (draft.trim() === '' || !Number.isFinite(Number(draft))) setDraft(String(value));
          onBlur?.(e);
        }}
        {...props}
      />
    );
  }
);

NumberField.displayName = 'NumberField';

export interface FormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, 'onSubmit'> {
  /** Runs only when every field passes its rules (required, min/max, length, type). */
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
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
  if (v.valueMissing || isBlankText(el)) return el instanceof HTMLSelectElement ? 'Choose one.' : 'Required.';
  if (v.rangeUnderflow) return `Must be ${(el as HTMLInputElement).min} or more.`;
  if (v.rangeOverflow) return `Must be ${(el as HTMLInputElement).max} or less.`;
  if (v.tooLong) return `Keep it under ${(el as HTMLInputElement).maxLength} characters.`;
  if (v.tooShort) return `Use at least ${(el as HTMLInputElement).minLength} characters.`;
  if (v.stepMismatch) return 'Use a whole number.';
  if (v.badInput) return 'Enter a number.';
  return el.validationMessage || 'Check this field.';
}

/**
 * A form that shows its rule errors under each field (Ascend style) instead of the browser's
 * bubble. Fields are linked by id: the Field primitives pick their message up from context.
 * A field's message clears as soon as it is edited.
 */
export const Form = React.forwardRef<HTMLFormElement, FormProps>(
  ({ onSubmit, children, onInput, ...props }, ref) => {
    const [errors, setErrors] = React.useState<Record<string, string>>({});

    const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const next: Record<string, string> = {};
      let first: HTMLElement | null = null;
      for (const el of Array.from(form.elements)) {
        if (
          (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) &&
          (!el.validity.valid || isBlankText(el))
        ) {
          if (el.id) next[el.id] = messageFor(el);
          first ??= el;
        }
      }
      if (first) {
        setErrors(next);
        first.focus();
        return;
      }
      setErrors({});
      void onSubmit(event);
    };

    return (
      <FormErrorsContext.Provider value={errors}>
        <form
          ref={ref}
          noValidate
          onSubmit={handleSubmit}
          onInput={(e) => {
            const id = (e.target as HTMLElement).id;
            if (id && errors[id]) {
              setErrors(({ [id]: _cleared, ...rest }) => rest);
            }
            onInput?.(e);
          }}
          {...props}
        >
          {children}
        </form>
      </FormErrorsContext.Provider>
    );
  }
);

Form.displayName = 'Form';

/** Two fields side by side from sm up; stacked on phones so selects and numbers keep their room. */
export function FieldRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cx('grid grid-cols-1 gap-4 sm:grid-cols-2', className)}>{children}</div>;
}
