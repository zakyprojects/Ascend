import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LogIn, LogOut, Moon, Settings, Sun, UserRound } from 'lucide-react';
import { toggleThemeWithReveal } from '@/lib/themeTransition';
import { cx, FOCUS_RING, TRANSITION } from '@/components/ui/primitives/shared';

interface AccountMenuProps {
  /** null when nobody is signed in. */
  user: { name: string; avatar: string; isGuest: boolean } | null;
  settingsActive: boolean;
  isDark: boolean;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}

const MENU_WIDTH = 240;

/**
 * The rail's avatar and its menu: one place for the account, Settings, theme and log out
 * (replaces the sidebar's account card with its separate Settings and Log out icons).
 * Opens below the avatar; Escape, a click outside or choosing an item closes it.
 */
export function AccountMenu({ user, settingsActive, isDark, onToggleTheme, onOpenSettings, onOpenAuth, onLogout }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setAnchor({ left: Math.max(12, rect.right - MENU_WIDTH), top: rect.bottom + 8 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    const onResize = () => setOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = items.indexOf(document.activeElement as HTMLElement);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    items[(index + step + items.length) % items.length]?.focus();
  };

  const status = !user ? 'Not signed in' : user.isGuest ? 'Guest account' : 'Account active';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={user ? `Account: ${user.name}` : 'Account'}
        title={user ? user.name : 'Account'}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'relative flex h-8 w-8 items-center justify-center rounded-full border text-base',
          open || settingsActive
            ? 'border-primary-500/50 bg-primary-500/15 text-brand-text'
            : 'border-overlay-default bg-bg-800 text-content-muted hover:border-overlay-strong hover:text-content-secondary',
          FOCUS_RING,
          TRANSITION
        )}
      >
        {user ? <span aria-hidden="true">{user.avatar}</span> : <UserRound size={18} aria-hidden="true" />}
        {user?.isGuest && (
          <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-bg-900 bg-primary-500" />
        )}
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label="Account"
            onKeyDown={onMenuKeyDown}
            style={{ left: anchor.left, top: anchor.top, width: MENU_WIDTH }}
            className="account-menu fixed z-modal rounded-2xl border border-overlay-default bg-bg-800 p-1.5 shadow-2xl"
          >
            <div className="flex items-center gap-3 px-2.5 pb-2.5 pt-2">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bg-700 text-lg" aria-hidden="true">
                {user ? user.avatar : <UserRound size={16} />}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-content-primary">{user ? user.name : 'Welcome'}</span>
                <span className="block text-2xs text-content-muted">{status}</span>
              </span>
            </div>

            {(!user || user.isGuest) && (
              <MenuItem
                icon={<LogIn size={16} />}
                tone="brand"
                onSelect={() => {
                  close(false);
                  onOpenAuth();
                }}
              >
                {user ? 'Save progress' : 'Sign in or register'}
              </MenuItem>
            )}
            <MenuItem
              icon={<Settings size={16} />}
              current={settingsActive}
              onSelect={() => {
                close(false);
                onOpenSettings();
              }}
            >
              Settings
            </MenuItem>
            <MenuItem
              icon={isDark ? <Sun size={16} /> : <Moon size={16} />}
              // Stays open, so the change can be seen and switched straight back.
              onSelect={(event) => toggleThemeWithReveal(event.currentTarget, onToggleTheme)}
            >
              {isDark ? 'Light theme' : 'Dark theme'}
            </MenuItem>

            {user && (
              <>
                <div className="my-1.5 h-px bg-overlay-subtle" role="separator" />
                <MenuItem
                  icon={<LogOut size={16} />}
                  tone="danger"
                  onSelect={() => {
                    close(false);
                    onLogout();
                  }}
                >
                  Log out
                </MenuItem>
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}

interface MenuItemProps {
  icon: ReactNode;
  children: ReactNode;
  onSelect: (event: React.MouseEvent<HTMLButtonElement>) => void;
  tone?: 'default' | 'brand' | 'danger';
  current?: boolean;
}

function MenuItem({ icon, children, onSelect, tone = 'default', current = false }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      aria-current={current ? 'page' : undefined}
      onClick={onSelect}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium',
        tone === 'brand' && 'text-brand-text hover:bg-primary-500/10',
        tone === 'danger' && 'text-content-secondary hover:bg-rose-500/10 hover:text-rose-theme',
        tone === 'default' && (current ? 'bg-primary-500/10 text-brand-text' : 'text-content-secondary hover:bg-overlay-subtle hover:text-content-primary'),
        'focus-visible:outline-none focus-visible:bg-overlay-subtle',
        TRANSITION
      )}
    >
      <span className="shrink-0 opacity-80" aria-hidden="true">
        {icon}
      </span>
      {children}
    </button>
  );
}
