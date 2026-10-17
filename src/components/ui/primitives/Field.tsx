import React from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from './shared';

export interface BaseFieldProps {
  label?: string;
  hint?: string;
  error?: string;
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
  children: React.ReactElement;
}

function FieldShell({ id, label, hint, error, children }: FieldShellProps) {
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

  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;

  return { id, errorId, hintId };
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      hint,
      error,
      id: idProp,
      className,
      'aria-describedby': describedByProp,
      ...props
    },
    ref
  ) => {
    const { id, errorId, hintId } = useFieldLinking(
      idProp,
      label,
      props['aria-label'],
      props['aria-labelledby'],
      error,
      hint
    );

    return (
      <FieldShell id={id} label={label} hint={hint} error={error}>
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
      error,
      id: idProp,
      className,
      children,
      'aria-describedby': describedByProp,
      ...props
    },
    ref
  ) => {
    const { id, errorId, hintId } = useFieldLinking(
      idProp,
      label,
      props['aria-label'],
      props['aria-labelledby'],
      error,
      hint
    );

    return (
      <FieldShell id={id} label={label} hint={hint} error={error}>
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
      error,
      id: idProp,
      className,
      'aria-describedby': describedByProp,
      ...props
    },
    ref
  ) => {
    const { id, errorId, hintId } = useFieldLinking(
      idProp,
      label,
      props['aria-label'],
      props['aria-labelledby'],
      error,
      hint
    );

    return (
      <FieldShell id={id} label={label} hint={hint} error={error}>
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
