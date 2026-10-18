import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, CheckCheck, ChevronDown, RotateCw, Settings, Trash2, X } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { AppNotification } from '@/types';
import { cx, FOCUS_RING, TAP_TARGET, TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { Badge } from '@/components/ui/primitives/Badge';
import { Skeleton } from '@/components/ui/primitives/Skeleton';
import { EmptyState } from '@/components/ui/primitives/EmptyState';
import { trustedNowMs } from '@/lib/clock';
import type { View } from '@/lib/views';
import { pathForView } from '@/lib/routes';
import { NOTIFICATION_WINDOW } from '@/lib/supabase';
import {
  describeGroup,
  describeNotification,
  formatNotificationTime,
  groupNotifications,
  NOTIFICATION_TONE_CLASS,
  NotificationEntry,
  NotificationView,
} from '@/lib/notificationMeta';
import { requestSettingsSection, settingsSectionPath } from '@/lib/settingsSections';

const PANEL_WIDTH = 360;

// Small square icon buttons in the panel (close, mark read, clear).
const ICON_BUTTON = cx(
  'inline-flex items-center justify-center w-8 h-8 rounded-lg text-content-muted transition-colors',
  FOCUS_RING
);

const TEXT_BUTTON = cx(
  'inline-flex items-center gap-1 h-8 px-2 rounded-lg text-xs font-medium leading-none text-content-muted hover:text-content-primary hover:bg-overlay-subtle transition-colors',
  FOCUS_RING
);

// Must match AppShell's `lg:` breakpoint, where the bell moves from the mobile header into the
// desktop sidebar.
const DESKTOP_QUERY = '(min-width: 1024px)';

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface NotificationCenterProps {
  store: AppStore;
  /** Opens a page (AppShell's navigation). Without it a tap only marks the notice read. */
  onNavigate?: (view: View) => void;
  compact?: boolean;
  align?: 'right' | 'left' | 'sidebar';
  className?: string;
}

function isPlainClick(event: React.MouseEvent) {
  return !(event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);
}

export function NotificationCenter({
  store,
  onNavigate,
  compact = false,
  align = 'right',
  className = '',
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  const [position, setPosition] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [nowMs, setNowMs] = useState(() => trustedNowMs());
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const notifications = store.state.notifications || [];
  const unreadCount = notifications.filter((n) => !n.read).length;
  const readCount = notifications.length - unreadCount;
  // The inbox holds the newest NOTIFICATION_WINDOW notices; a full window of unread may hide more (D-N4).
  const unreadLabel = unreadCount >= NOTIFICATION_WINDOW ? `${NOTIFICATION_WINDOW}+` : String(unreadCount);
  const status = store.notificationsStatus;

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  // Desktop: a popover under the bell. Phones: full width under the header (D-N5).
  const computePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    if (!window.matchMedia(DESKTOP_QUERY).matches) {
      setPosition({ top: Math.round(rect.bottom + 8) });
    } else if (align === 'sidebar' || align === 'left') {
      setPosition({ top: rect.bottom + 8, left: Math.max(16, rect.left) });
    } else {
      setPosition({ top: rect.bottom + 8, right: Math.max(16, window.innerWidth - rect.right) });
    }
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    computePosition();
    window.addEventListener('resize', computePosition);
    return () => window.removeEventListener('resize', computePosition);
  }, [open, computePosition, isDesktop]);

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  // Focus moves into the panel, Escape closes it, Tab stays inside, and focus goes back to the bell.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.getClientRects().length > 0
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  // Scroll lock while open: below lg the window is the scroller, so the page behind the backdrop
  // must not move. overflow on <html> (as ZoneSheet does) keeps the page where it is.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = previousOverflow;
    };
  }, [open]);

  // Times stay right while the panel is open.
  useEffect(() => {
    if (!open) return;
    setNowMs(trustedNowMs());
    const timer = setInterval(() => setNowMs(trustedNowMs()), 60_000);
    return () => clearInterval(timer);
  }, [open]);

  const handleToggle = () => {
    if (open) close(false);
    else setOpen(true);
  };

  const openNotification = (notif: AppNotification, view: NotificationView, event: React.MouseEvent) => {
    if (!notif.read) store.markNotificationRead(notif.id);
    if (!view.link || !onNavigate) return;
    if (!isPlainClick(event)) return; // new tab / window keeps the browser's own behaviour
    event.preventDefault();
    close(false);
    onNavigate(view.link);
  };

  const openSettings = (event: React.MouseEvent) => {
    if (!onNavigate || !isPlainClick(event)) return;
    event.preventDefault();
    close(false);
    requestSettingsSection('notifications');
    onNavigate('settings');
  };

  const toggleGroup = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const entries = groupNotifications(notifications);
  const isUnread = (entry: NotificationEntry) =>
    entry.kind === 'single' ? !entry.item.read : entry.items.some((n) => !n.read);
  const newEntries = entries.filter(isUnread);
  const earlierEntries = entries.filter((e) => !isUnread(e));

  const renderIconTile = (view: NotificationView, notif: AppNotification) => (
    <span className="relative shrink-0 mt-0.5">
      <span
        className={cx(
          'w-8 h-8 rounded-lg border flex items-center justify-center',
          NOTIFICATION_TONE_CLASS[view.tone]
        )}
        aria-hidden="true"
      >
        {view.showActor ? <span className="text-base leading-none">{notif.actorAvatar}</span> : <view.icon size={16} />}
      </span>
      {view.showActor && (
        <span
          className={cx(
            'absolute -bottom-1 -right-1 w-4 h-4 rounded-full border border-bg-800 flex items-center justify-center',
            NOTIFICATION_TONE_CLASS[view.tone]
          )}
          aria-hidden="true"
        >
          <view.icon size={10} />
        </span>
      )}
    </span>
  );

  const renderText = (view: NotificationView, unread: boolean, createdAt: string) => (
    <span className="flex-1 min-w-0">
      <span className="flex items-baseline justify-between gap-2">
        <span className={cx('text-sm font-medium truncate', unread ? 'text-content-primary' : 'text-content-secondary')}>
          {view.title}
        </span>
        <span className="text-2xs tabular-nums text-content-muted shrink-0">{formatNotificationTime(createdAt, nowMs)}</span>
      </span>
      <span className={cx('block text-xs leading-snug line-clamp-2 mt-0.5', unread ? 'text-content-secondary' : 'text-content-muted')}>
        {view.message}
      </span>
    </span>
  );

  const renderActions = (ids: string[], unread: boolean, label: string) => (
    <span className="shrink-0 flex items-center gap-0.5 -mr-1 pt-0.5">
      {unread ? (
        <button
          type="button"
          onClick={() => store.markNotificationsRead(ids)}
          aria-label={`Mark ${label} as read`}
          title="Mark as read"
          className={cx(ICON_BUTTON, 'hover:text-success-text hover:bg-emerald-500/10', TAP_TARGET_Y)}
        >
          <Check size={15} aria-hidden="true" />
        </button>
      ) : (
        // Read rows keep the slot so the clear buttons stay in one column.
        <span className="w-8 h-8" aria-hidden="true" />
      )}
      <button
        type="button"
        onClick={() => store.clearNotifications(ids)}
        aria-label={`Clear ${label}`}
        title="Clear"
        className={cx(ICON_BUTTON, 'hover:text-rose-theme hover:bg-rose-500/10', TAP_TARGET_Y)}
      >
        <Trash2 size={15} aria-hidden="true" />
      </button>
    </span>
  );

  const rowClass = (unread: boolean) =>
    cx('flex items-start gap-1 pl-3 pr-2 py-2', unread ? 'bg-primary-500/5' : 'bg-transparent');

  const mainClass = cx(
    'flex flex-1 min-w-0 items-start gap-3 rounded-lg px-1 py-1 -my-1 text-left hover:bg-overlay-subtle transition-colors',
    FOCUS_RING
  );

  const renderSingle = (notif: AppNotification, nested = false) => {
    const view = describeNotification(notif);
    const unread = !notif.read;
    const content = (
      <>
        {renderIconTile(view, notif)}
        {renderText(view, unread, notif.createdAt)}
      </>
    );
    const label = `“${view.title}”`;
    return (
      <li key={notif.id} className={cx(rowClass(unread), nested && 'pl-8')}>
        {view.link && onNavigate ? (
          <a href={pathForView(view.link)} onClick={(e) => openNotification(notif, view, e)} className={mainClass}>
            {unread && <span className="sr-only">Unread: </span>}
            {content}
          </a>
        ) : (
          <button type="button" onClick={(e) => openNotification(notif, view, e)} className={mainClass}>
            {unread && <span className="sr-only">Unread: </span>}
            {content}
          </button>
        )}
        {renderActions([notif.id], unread, label)}
      </li>
    );
  };

  const renderEntry = (entry: NotificationEntry) => {
    if (entry.kind === 'single') return renderSingle(entry.item);
    const view = describeGroup(entry.items);
    const unread = entry.items.some((n) => !n.read);
    const isOpen = expanded.has(entry.id);
    const ids = entry.items.map((n) => n.id);
    return (
      <li key={entry.id}>
        <div className={rowClass(unread)}>
          <button type="button" onClick={() => toggleGroup(entry.id)} aria-expanded={isOpen} className={mainClass}>
            {unread && <span className="sr-only">Unread: </span>}
            {renderIconTile(view, entry.items[0])}
            {renderText(view, unread, entry.items[0].createdAt)}
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={cx('shrink-0 mt-2 text-content-muted transition-transform', isOpen && 'rotate-180')}
            />
          </button>
          {renderActions(ids, unread, `all ${entry.items.length} in “${view.title}”`)}
        </div>
        {isOpen && <ul className="divide-y divide-overlay-subtle border-t border-overlay-subtle">{entry.items.map((n) => renderSingle(n, true))}</ul>}
      </li>
    );
  };

  const renderSection = (title: string, list: NotificationEntry[]) =>
    list.length > 0 && (
      <section aria-label={title}>
        <h3 className="stat-label px-4 pt-3 pb-1">{title}</h3>
        <ul className="divide-y divide-overlay-subtle">{list.map(renderEntry)}</ul>
      </section>
    );

  const retry = () => {
    void store.refreshNotifications();
  };

  const renderBody = () => {
    if (notifications.length === 0) {
      if (status === 'loading') {
        return (
          <div className="p-4 space-y-4" aria-busy="true" aria-label="Loading notifications">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="w-8 h-8 shrink-0" />
                <div className="flex-1 space-y-2 pt-0.5">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              </div>
            ))}
          </div>
        );
      }
      if (status === 'failed') {
        return (
          <div className="p-6 text-center space-y-3" role="status">
            <p className="text-sm font-medium text-content-primary">Couldn&apos;t load notifications</p>
            <p className="text-xs text-content-muted">Check your connection and try again.</p>
            <button type="button" onClick={retry} className={cx(TEXT_BUTTON, 'mx-auto border border-overlay-default')}>
              <RotateCw size={14} aria-hidden="true" />
              Retry
            </button>
          </div>
        );
      }
      return (
        <EmptyState
          icon={Bell}
          size="sm"
          surface={false}
          title="You're all caught up"
          description="Partner invites, reminders and penalty notices show up here."
          className="p-8"
        />
      );
    }
    return (
      <>
        {status === 'failed' && (
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-overlay-subtle" role="status">
            <span className="text-xs text-content-muted">Couldn&apos;t refresh. These may be out of date.</span>
            <button type="button" onClick={retry} className={TEXT_BUTTON}>
              <RotateCw size={14} aria-hidden="true" />
              Retry
            </button>
          </div>
        )}
        {renderSection('New', newEntries)}
        {renderSection('Earlier', earlierEntries)}
        <div className="h-2" aria-hidden="true" />
      </>
    );
  };

  const panelStyle: React.CSSProperties = isDesktop
    ? {
        top: position.top,
        width: PANEL_WIDTH,
        maxHeight: `min(560px, calc(100dvh - ${position.top + 16}px))`,
        ...(position.left !== undefined ? { left: position.left } : {}),
        ...(position.right !== undefined ? { right: position.right } : {}),
      }
    : {
        top: position.top,
        left: 12,
        right: 12,
        maxHeight: `calc(100dvh - ${position.top + 12}px - env(safe-area-inset-bottom))`,
      };

  const portalContent = open
    ? createPortal(
        <>
          {/* Backdrop: dims the page on phones; on desktop it only catches the outside click. */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-popover)' }}
            className="bg-black/60 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none"
            onClick={() => close(false)}
            aria-hidden="true"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="notification-panel-title"
            tabIndex={-1}
            style={{ position: 'fixed', zIndex: 'var(--z-popover)', ...panelStyle }}
            className="bg-bg-800 border border-overlay-default rounded-2xl shadow-lg overflow-hidden animate-scale-in flex flex-col outline-none"
          >
            <div className="pl-4 pr-2 py-2 border-b border-overlay-subtle flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <h2 id="notification-panel-title" className="text-sm font-semibold text-content-primary">
                  Notifications
                </h2>
                {unreadCount > 0 && (
                  <Badge tone="rose" size="xs" className="figure leading-none py-1">
                    {unreadLabel} new
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                {onNavigate && (
                  <a
                    href={settingsSectionPath('notifications')}
                    onClick={openSettings}
                    aria-label="Notification settings"
                    title="Notification settings"
                    className={cx(ICON_BUTTON, 'hover:text-content-primary hover:bg-overlay-subtle', TAP_TARGET_Y)}
                  >
                    <Settings size={16} aria-hidden="true" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => close()}
                  aria-label="Close notifications"
                  title="Close"
                  className={cx(ICON_BUTTON, 'hover:text-content-primary hover:bg-overlay-subtle', TAP_TARGET_Y)}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            {(unreadCount > 0 || readCount > 0) && (
              <div className="px-2 py-1 border-b border-overlay-subtle flex items-center justify-between gap-2 shrink-0">
                {unreadCount > 0 ? (
                  <button type="button" onClick={() => store.markAllNotificationsRead()} className={TEXT_BUTTON}>
                    <CheckCheck size={14} aria-hidden="true" />
                    <span>Mark all read</span>
                  </button>
                ) : (
                  <span />
                )}
                {readCount > 0 && (
                  <button type="button" onClick={() => store.clearReadNotifications()} className={TEXT_BUTTON}>
                    <Trash2 size={14} aria-hidden="true" />
                    <span>Clear read</span>
                  </button>
                )}
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{renderBody()}</div>
          </div>
        </>,
        document.body
      )
    : null;

  const bellLabel = unreadCount > 0 ? `Notifications, ${unreadLabel} unread` : 'Notifications';

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-label={bellLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notifications"
        className={cx(
          'p-2 rounded-xl transition-all',
          TAP_TARGET,
          FOCUS_RING,
          open
            ? 'bg-primary-500/20 text-brand-text border border-primary-500/30'
            : 'text-content-muted hover:text-content-secondary hover:bg-overlay-subtle'
        )}
      >
        <Bell size={compact ? 16 : 18} aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white font-semibold tabular-nums text-2xs rounded-full flex items-center justify-center border border-bg-900"
          >
            {unreadLabel}
          </span>
        )}
      </button>

      {portalContent}
    </div>
  );
}
