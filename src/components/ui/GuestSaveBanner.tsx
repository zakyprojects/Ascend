import type { ReactNode } from 'react';
import { UserPlus } from 'lucide-react';

interface GuestSaveBannerProps {
  title: ReactNode;
  description: string;
  /** Opens the sign-up flow; the button is hidden when absent. */
  onCreateAccount?: () => void;
}

/** Prompt shown to guests asking them to turn the session into a full account. */
export function GuestSaveBanner({ title, description, onCreateAccount }: GuestSaveBannerProps) {
  return (
    <div className="p-4 rounded-xl border border-primary-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary-500/15 flex items-center justify-center shrink-0 text-brand-text">
          <UserPlus size={18} aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-medium text-content-secondary">{title}</p>
          <p className="text-micro text-content-muted">{description}</p>
        </div>
      </div>
      {onCreateAccount && (
        <button
          type="button"
          onClick={onCreateAccount}
          className="px-3.5 py-1.5 bg-primary-600 hover:bg-primary-700 text-on-brand text-xs font-semibold rounded-lg transition-colors shrink-0 w-full sm:w-auto"
        >
          Create Account
        </button>
      )}
    </div>
  );
}
