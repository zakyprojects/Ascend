import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { TAP_AREA } from '@/components/ui/primitives/shared';
import { FieldErrorBubble, useFieldIssue } from '@/components/ui/primitives';

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  required?: boolean;
  error?: string;
  leftIcon?: React.ReactNode;
  /** The parent places the error message itself (e.g. outside a decorated wrapper). */
  hideMessage?: boolean;
  /** Called when the show/hide toggle changes whether the password is shown. */
  onVisibilityChange?: (visible: boolean) => void;
}

export function PasswordInput({
  label,
  required,
  error,
  leftIcon = <Lock size={16} />,
  id,
  className = '',
  autoComplete,
  placeholder = '••••••••',
  onVisibilityChange,
  hideMessage = false,
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  const message = useFieldIssue(inputId ?? '', error);

  return (
    <div className="w-full" data-field={inputId}>
      {label && (
        <label
          htmlFor={inputId}
          className="block label mb-1"
        >
          {label} {required && <span className="text-error-text">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-content-disabled">
            {leftIcon}
          </div>
        )}
        <input
          id={inputId}
          type={showPassword ? 'text' : 'password'}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
          aria-invalid={message ? true : undefined}
          aria-describedby={message && inputId ? `${inputId}-error` : undefined}
          className={`w-full ${
            leftIcon ? 'input-has-icon' : 'px-3'
          } pr-10 py-2.5 bg-bg-800 border border-overlay-default rounded-xl text-sm text-content-primary placeholder:text-content-disabled focus:outline-none focus:border-primary-400 aria-[invalid=true]:border-rose-500/70 transition-all ${className}`}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          // Keep focus (and the caret) in the field while toggling.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const next = !showPassword;
            setShowPassword(next);
            onVisibilityChange?.(next);
          }}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className={`absolute inset-y-0 right-0 pr-3 flex items-center text-content-disabled hover:text-content-primary focus:outline-none transition-colors ${TAP_AREA}`}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {message && !hideMessage && <FieldErrorBubble id={inputId ? `${inputId}-error` : undefined} message={message} />}
    </div>
  );
}
