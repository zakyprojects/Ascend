import { getCurrentTier } from '@/lib/tiers';

export interface LeaguePreviewCardProps {
  /** The username as typed; empty shows a muted placeholder. */
  username: string;
  /** The chosen avatar emoji; empty shows a placeholder circle. */
  avatar: string;
  className?: string;
}

const START_TIER = getCurrentTier(0).name;

/**
 * Signup preview: the new account as a row on the Leagues leaderboard (same row classes as
 * Leagues.tsx's "you" row), filled in live as the user types. Decorative; the form holds the data.
 */
export function LeaguePreviewCard({ username, avatar, className = '' }: LeaguePreviewCardProps) {
  const name = username.trim();
  const emoji = avatar.trim();

  return (
    <div
      aria-hidden="true"
      className={`bg-bg-800 border border-overlay-default rounded-2xl shadow-sm overflow-hidden animate-enter-up ${className}`}
    >
      <p className="px-4 pt-3 pb-2 text-2xs font-medium text-content-muted">You on the leaderboard</p>
      <div className="flex items-center gap-3 px-4 py-2.5 bg-primary-500/5 border-t border-overlay-subtle">
        <div className="w-7 text-center shrink-0">
          <span className="figure text-sm text-content-disabled">#—</span>
        </div>
        <div className="w-10 h-10 rounded-lg bg-overlay-subtle flex items-center justify-center text-lg shrink-0">
          {emoji ? (
            <span key={emoji} className="animate-enter-fade">
              {emoji}
            </span>
          ) : (
            <span className="w-5 h-5 rounded-full border border-dashed border-overlay-strong" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className={`item-name text-sm truncate block ${name ? '!text-success-text' : '!text-content-disabled'}`}>
            {name || 'your-name'}
          </span>
          <span className="block text-micro text-content-muted truncate">{START_TIER} · 0 pts</span>
        </div>
      </div>
    </div>
  );
}
