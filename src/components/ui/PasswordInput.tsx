import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  required?: boolean;
  error?: string;
  leftIcon?: React.ReactNode;
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
  ...props
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={inputId}
          className="block text-xs font-medium text-content-tertiary mb-1"
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
          className={`w-full ${
            leftIcon ? 'input-has-icon' : 'px-3'
          } pr-10 py-2.5 bg-bg-800 border border-overlay-default rounded-xl text-sm text-content-primary placeholder:text-content-disabled focus:outline-none focus:border-primary-400 transition-all ${className}`}
          {...props}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPassword((prev) => !prev)}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-content-disabled hover:text-content-primary focus:outline-none transition-colors"
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error && (
        <p className="text-[11px] text-error-text mt-1 flex items-center gap-1 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
