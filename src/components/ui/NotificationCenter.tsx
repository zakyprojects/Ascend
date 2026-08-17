import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Check, CheckCheck, Trash2, X, Award, Users, AlertTriangle, Zap, Info, Calendar, CheckCircle2 } from 'lucide-react';
import { AppStore } from '@/lib/store';
import { AppNotification } from '@/types';

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
    const isMobile = window.innerWidth < 768;

    if (isMobile) {
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
        return <Users size={16} className="text-sky-400" />;
      case 'partner_nudge':
        return <Zap size={16} className="text-amber-400" />;
      case 'partner_pledge_done':
        return <CheckCircle2 size={16} className="text-emerald-400" />;
      case 'missed_habit':
      case 'partner_missed_habit':
      case 'streak_risk':
        return <AlertTriangle size={16} className="text-rose-400" />;
      case 'challenge_completed':
        return <Award size={16} className="text-emerald-400" />;
      case 'daily_reminder':
        return <Calendar size={16} className="text-amber-400" />;
      default:
        return <Info size={16} className="text-purple-400" />;
    }
  };

  // ── PORTAL CONTENT: rendered into document.body, NOT inside the sidebar DOM ──
  const portalContent = open
    ? createPortal(
        <div ref={portalRef}>
          {/* Backdrop — covers entire screen */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            className="bg-bg-950/60 backdrop-blur-xs md:bg-transparent md:backdrop-blur-none"
            onClick={() => setOpen(false)}
          />

          {/* Dropdown panel — fixed position from bell's screen coords */}
          <div
            style={{
              position: 'fixed',
              zIndex: 9999,
              top: position.top,
              ...(position.left !== undefined ? { left: position.left } : {}),
              ...(position.right !== undefined ? { right: position.right } : {}),
              // Mobile: fill width with margins
              ...(window.innerWidth < 768
                ? { left: 16, right: 16, maxWidth: 384, margin: '0 auto' }
                : { width: 384 }),
            }}
            className="glass bg-bg-900/95 border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col"
          >
            {/* Header */}
            <div className="p-3.5 border-b border-white/5 flex items-center justify-between bg-bg-800/50">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-primary-400" />
                <span className="font-display font-bold text-sm text-slate-100">Notifications</span>
                {unreadCount > 0 && (
                  <span className="bg-rose-500/20 text-rose-300 text-[10px] font-bold px-2 py-0.5 rounded-full border border-rose-500/30">
                    {unreadCount} new
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[11px] text-slate-400 hover:text-primary-300 flex items-center gap-1 py-1 px-2 rounded-lg hover:bg-white/5 transition-all"
                    title="Mark all as read"
                  >
                    <CheckCheck size={14} />
                    <span>Mark all read</span>
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="p-1 text-slate-500 hover:text-slate-300 rounded-lg hover:bg-white/5"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-white/5" style={{ maxHeight: window.innerWidth < 768 ? '70vh' : 480 }}>
              {notifications.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mx-auto text-slate-500">
                    <Bell size={20} />
                  </div>
                  <p className="text-xs text-slate-400 font-medium">No notifications yet</p>
                  <p className="text-[10px] text-slate-500">Partner invites, nudges, and alerts will appear here live.</p>
                </div>
              ) : (
                notifications.map((notif: AppNotification) => (
                  <div
                    key={notif.id}
                    onClick={() => !notif.read && store.markNotificationRead(notif.id)}
                    className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer group ${
                      notif.read ? 'bg-transparent hover:bg-white/[0.02]' : 'bg-primary-500/5 hover:bg-primary-500/10'
                    }`}
                  >
                    <div className="shrink-0 mt-0.5">
                      {notif.actorAvatar ? (
                        <div className="w-8 h-8 rounded-lg bg-bg-800 border border-white/10 flex items-center justify-center text-sm relative">
                          <span>{notif.actorAvatar}</span>
                          <div className="absolute -bottom-1 -right-1 bg-bg-900 rounded-full p-0.5">
                            {renderIcon(notif.type)}
                          </div>
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-bg-800 border border-white/10 flex items-center justify-center">
                          {renderIcon(notif.type)}
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1 mb-0.5">
                        <span className={`text-xs font-bold truncate ${notif.read ? 'text-slate-300' : 'text-slate-100'}`}>
                          {notif.title || 'Notification'}
                        </span>
                        <span className="text-[10px] text-slate-500 shrink-0">
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>
                      <p className={`text-xs leading-snug line-clamp-2 ${notif.read ? 'text-slate-400' : 'text-slate-200'}`}>
                        {notif.message}
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                      {!notif.read && (
                        <button
                          onClick={(e) => handleMarkRead(notif.id, e)}
                          title="Mark as read"
                          className="p-1 text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-all"
                        >
                          <Check size={14} />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleClear(notif.id, e)}
                        title="Clear notification"
                        className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all"
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
        className={`relative p-2 rounded-xl transition-all ${
          open
            ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
        }`}
      >
        <Bell size={compact ? 16 : 18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white font-bold text-[10px] rounded-full flex items-center justify-center border border-bg-900 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {portalContent}
    </div>
  );
}
