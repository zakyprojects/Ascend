import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, CheckCheck, Trash2, X, Award, Users, AlertTriangle, Zap, Info, Calendar, CheckCircle2 } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { AppNotification } from '@/types';
import { TAP_TARGET, TAP_TARGET_Y } from '@/components/ui/primitives/shared';
import { Badge } from '@/components/ui/primitives/Badge';

const PANEL_WIDTH = 344;

// Shared look for the small square icon buttons in the panel (close, mark read, clear).
const ICON_BUTTON =
  'inline-flex items-center justify-center w-7 h-7 rounded-lg text-content-disabled transition-colors';

// Must match AppShell's `lg:` breakpoint, where the bell moves from the mobile
// header into the desktop sidebar.
const DESKTOP_SHELL_MIN_WIDTH = 1024;
const isMobileShell = () => window.innerWidth < DESKTOP_SHELL_MIN_WIDTH;

interface NotificationCenterProps {
  store: AppStore;
  compact?: boolean;
  align?: 'right' | 'left' | 'sidebar';
  className?: string;
}

export function NotificationCenter({
  store,
  compact = false,
  align = 'right',
  className = '',
}: NotificationCenterProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const notifications = store.state.notifications || [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Calculate position from the bell button's screen coordinates
  const computePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    if (isMobileShell()) {
      // Centered modal on mobile
      setPosition({ top: 64 });
    } else if (align === 'sidebar' || align === 'left') {
      setPosition({
        top: rect.bottom + 8,
        left: Math.max(16, rect.left),
      });
    } else {
      setPosition({
        top: rect.bottom + 8,
        right: Math.max(16, window.innerWidth - rect.right),
      });
    }
  }, [align]);

  const handleToggle = () => {
    if (!open) {
      computePosition();
    }
    setOpen((prev) => !prev);
  };

  // Close on click outside — checks both the bell button and the portal content
  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const clickedInPortal = portalRef.current?.contains(target);
      const clickedOnButton = buttonRef.current?.contains(target);
      if (!clickedInPortal && !clickedOnButton) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleMarkAllRead = () => {
    store.markAllNotificationsRead();
  };

  const handleMarkRead = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    store.markNotificationRead(id);
  };

  const handleClear = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    store.clearNotification(id);
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSec = Math.floor(diffMs / 1000);
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);
      const diffDay = Math.floor(diffHour / 24);

      if (diffSec < 60) return 'Just now';
      if (diffMin < 60) return `${diffMin}m ago`;
      if (diffHour < 24) return `${diffHour}h ago`;
      if (diffDay < 7) return `${diffDay}d ago`;
      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const renderIcon = (type: string) => {
    switch (type) {
      case 'partner_invite':
      case 'partner_invite_accepted':
      case 'partner_invite_declined':
        return <Users size={16} className="text-sky-theme" />;
      case 'partner_nudge':
        return <Zap size={16} className="text-warning-text" />;
      case 'partner_pledge_done':
        return <CheckCircle2 size={16} className="text-success-text" />;
      case 'missed_habit':
      case 'partner_missed_habit':
      case 'streak_risk':
        return <AlertTriangle size={16} className="text-rose-theme" />;
      case 'challenge_completed':
        return <Award size={16} className="text-success-text" />;
      case 'daily_reminder':
        return <Calendar size={16} className="text-warning-text" />;
      default:
        return <Info size={16} className="text-purple-hierarchy" />;
    }
  };

  // ── PORTAL CONTENT: rendered into document.body, NOT inside the sidebar DOM ──
  const portalContent = open
    ? createPortal(
        <div ref={portalRef}>
          {/* Backdrop — covers entire screen */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 'var(--z-popover)' }}
            className="bg-black/60 backdrop-blur-sm lg:bg-transparent lg:backdrop-blur-none"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown panel — fixed position from bell's screen coords */}
          <div
            style={{
              position: 'fixed',
              zIndex: 'var(--z-popover)',
              top: position.top,
              ...(position.left !== undefined ? { left: position.left } : {}),
              ...(position.right !== undefined ? { right: position.right } : {}),
              // Mobile: fill width with margins
              ...(isMobileShell()
                ? { left: 16, right: 16, maxWidth: PANEL_WIDTH, margin: '0 auto' }
                : { width: PANEL_WIDTH }),
            }}
            className="bg-bg-800 border border-overlay-default rounded-2xl shadow-lg overflow-hidden animate-scale-in flex flex-col"
          >
            {/* Header */}
            <div className="pl-3.5 pr-2 py-2 border-b border-overlay-subtle flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-semibold text-content-primary">Notifications</span>
                {unreadCount > 0 && (
                  <Badge tone="rose" size="xs" className="figure leading-none py-1">
                    {unreadCount} new
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="inline-flex items-center gap-1 h-7 px-2 rounded-lg text-micro font-medium leading-none text-content-muted hover:text-brand-text hover:bg-overlay-subtle transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck size={14} />
                    <span>Mark all read</span>
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  title="Close"
                  className={`${ICON_BUTTON} hover:text-content-tertiary hover:bg-overlay-subtle ${TAP_TARGET}`}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto divide-y divide-overlay-subtle" style={{ maxHeight: isMobileShell() ? '70vh' : 400 }}>
              {notifications.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-overlay-subtle flex items-center justify-center mx-auto text-content-disabled">
                    <Bell size={20} />
                  </div>
                  <p className="item-name text-xs text-content-muted">No notifications yet</p>
                  <p className="text-2xs text-content-disabled">Partner invites, nudges, and alerts show up here.</p>
                </div>
              ) : (
                notifications.map((notif: AppNotification) => (
                  <div
                    key={notif.id}
                    onClick={() => !notif.read && store.markNotificationRead(notif.id)}
                    className={`px-3.5 py-2.5 flex items-start gap-2.5 transition-colors cursor-pointer group ${
                      notif.read ? 'bg-transparent hover:bg-overlay-subtle' : 'bg-primary-500/5 hover:bg-primary-500/10'
                    }`}
                  >
                    <div className="shrink-0 mt-0.5">
                      {notif.actorAvatar ? (
                        <div className="w-7 h-7 rounded-lg bg-bg-800 border border-overlay-default flex items-center justify-center text-sm relative">
                          <span>{notif.actorAvatar}</span>
                          <div className="absolute -bottom-1 -right-1 bg-bg-900 rounded-full p-0.5">
                            {renderIcon(notif.type)}
                          </div>
                        </div>
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-bg-800 border border-overlay-default flex items-center justify-center">
                          {renderIcon(notif.type)}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`item-name text-xs truncate ${notif.read ? 'text-content-tertiary' : 'text-content-primary'}`}>
                          {notif.title || 'Notification'}
                        </span>
                        <span className="text-2xs tabular-nums text-content-disabled shrink-0">
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>
                      <p className={`text-xs leading-snug line-clamp-2 ${notif.read ? 'text-content-muted' : 'text-content-secondary'}`}>
                        {notif.message}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center -mr-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                      {/* Read rows keep an empty slot so the clear buttons stay in one column */}
                      {notif.read ? (
                        <span className="w-7 h-7" aria-hidden="true" />
                      ) : (
                        <button
                          onClick={(e) => handleMarkRead(notif.id, e)}
                          title="Mark as read"
                          className={`${ICON_BUTTON} hover:text-success-text hover:bg-emerald-500/10 ${TAP_TARGET_Y}`}
                        >
                          <Check size={14} />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleClear(notif.id, e)}
                        title="Clear notification"
                        className={`${ICON_BUTTON} hover:text-rose-theme hover:bg-rose-500/10 ${TAP_TARGET_Y}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )
    : null;

  // ── BELL BUTTON: stays in the sidebar DOM as before ──
  return (
    <div className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        title="Notifications"
        className={`p-2 rounded-xl transition-all ${TAP_TARGET} ${
          open
            ? 'bg-primary-500/20 text-brand-text border border-primary-500/30'
            : 'text-content-muted hover:text-content-secondary hover:bg-overlay-subtle'
        }`}
      >
        <Bell size={compact ? 16 : 18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white font-semibold tabular-nums text-2xs rounded-full flex items-center justify-center border border-bg-900">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {portalContent}
    </div>
  );
}