import React from 'react';
import { type LucideIcon } from 'lucide-react';
import { cx } from './shared';

/**
 * Page toolbar controls (search boxes, quick-add rows; filter dropdowns are `ToolbarSelect` in Select.tsx): one compact look that
 * matches the form fields' colours and focus ring. Text is 16px on phones so iOS never zooms in on
 * focus. They are not form fields: no label row and no error bubble, so an accessible name is required.
 */
const toolbarControl =
  'w-full rounded-xl border border-overlay-default bg-bg-700 text-content-primary placeholder:text-content-disabled py-2 text-base sm:text-sm hover:border-overlay-medium focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:opacity-60 disabled:cursor-not-allowed transition-[border-color,box-shadow] duration-200';

export type ToolbarInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  'aria-label': string;
  /** Leading icon inside the box (a Search glass for search boxes). */
  icon?: LucideIcon;
  /** Classes for the wrapper (width, flex). */
  wrapperClassName?: string;
};

export const ToolbarInput = React.forwardRef<HTMLInputElement, ToolbarInputProps>(
  ({ icon: Icon, wrapperClassName, className, ...props }, ref) => (
    <div className={cx('relative w-full', wrapperClassName)}>
      {Icon && (
        <Icon
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-content-disabled"
        />
      )}
      <input ref={ref} className={cx(toolbarControl, Icon ? 'pl-9 pr-3' : 'px-3', className)} {...props} />
    </div>
  )
);
ToolbarInput.displayName = 'ToolbarInput';
