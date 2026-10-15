import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { TAP_TARGET } from '@/components/ui/primitives/shared';
import { prefersReducedMotion } from '@/lib/motion';
import { trustedNowMs } from '@/lib/clock';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  dedupKey?: string;
}

interface ShownToast extends ToastItem {
  duration: number;
  leaving: boolean;
}

// Matches the toast-out animation (tailwind.config.js).
const TOAST_EXIT_MS = 180;

interface ToastContextType {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  showSuccessToast: (title: string, message?: string, dedupKey?: string) => void;
  showErrorToast: (title: string, message?: string, dedupKey?: string) => void;
  showWarningToast: (title: string, message?: string, dedupKey?: string) => void;
  showInfoToast: (title: string, message?: string, dedupKey?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ShownToast[]>([]);
  const lastShownRef = useRef<Map<string, number>>(new Map());

  // Plays the exit animation, then removes it.
  const removeToast = useCallback((id: string) => {
    if (prefersReducedMotion()) {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      return;
    }
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), TOAST_EXIT_MS);
  }, []);

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const key = toast.dedupKey ? `${toast.type}:${toast.dedupKey}` : `${toast.type}:${toast.title}:${toast.message || ''}`;
    const now = trustedNowMs();
    const lastTime = lastShownRef.current.get(key) || 0;

    // Suppress identical toasts shown within the last 6 seconds to prevent spam
    if (now - lastTime < 6000) {
      return;
    }

    lastShownRef.current.set(key, now);

    const id = Math.random().toString(36).substring(2, 9);
    const duration = toast.duration ?? (toast.type === 'error' ? 5000 : 3500);

    const newItem: ShownToast = { ...toast, id, duration, leaving: false };

    // Max 5 toasts; each one runs its own (pausable) timer in ToastCard.
    setToasts((prev) => [...prev.slice(-4), newItem]);
  }, []);

  const showSuccessToast = useCallback((title: string, message?: string, dedupKey?: string) => {
    showToast({ type: 'success', title, message, dedupKey });
  }, [showToast]);

  const showErrorToast = useCallback((title: string, message?: string, dedupKey?: string) => {
    showToast({ type: 'error', title, message, dedupKey });
  }, [showToast]);

  const showWarningToast = useCallback((title: string, message?: string, dedupKey?: string) => {
    showToast({ type: 'warning', title, message, dedupKey });
  }, [showToast]);

  const showInfoToast = useCallback((title: string, message?: string, dedupKey?: string) => {
    showToast({ type: 'info', title, message, dedupKey });
  }, [showToast]);

  // Global window event listener for central choke point calls
  useEffect(() => {
    const handleToastErrorEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ title: string; message?: string; dedupKey?: string }>;
      if (customEvent.detail?.title) {
        showErrorToast(customEvent.detail.title, customEvent.detail.message, customEvent.detail.dedupKey);
      }
    };

    const handleToastSuccessEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ title: string; message?: string; dedupKey?: string }>;
      if (customEvent.detail?.title) {
        showSuccessToast(customEvent.detail.title, customEvent.detail.message, customEvent.detail.dedupKey);
      }
    };

    window.addEventListener('app-toast-error', handleToastErrorEvent);
    window.addEventListener('app-toast-success', handleToastSuccessEvent);

    return () => {
      window.removeEventListener('app-toast-error', handleToastErrorEvent);
      window.removeEventListener('app-toast-success', handleToastSuccessEvent);
    };
  }, [showErrorToast, showSuccessToast]);

  return (
    <ToastContext.Provider value={{ showToast, showSuccessToast, showErrorToast, showWarningToast, showInfoToast }}>
      {children}
      {/* Toast Render Container */}
      <div
        className="fixed top-[calc(1rem_+_env(safe-area-inset-top))] right-[calc(1rem_+_env(safe-area-inset-right))] z-toast flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={removeToast} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TOAST_TONES: Record<ToastType, { icon: ReactNode; title: string; message: string; bar: string }> = {
  success: {
    icon: <CheckCircle2 className="text-success-text shrink-0" size={18} />,
    title: 'text-success-text',
    message: 'text-content-secondary',
    bar: 'bg-success-text',
  },
  error: {
    icon: <AlertCircle className="text-error-text shrink-0" size={18} />,
    title: 'text-error-text',
    message: 'text-content-secondary',
    bar: 'bg-error-text',
  },
  warning: {
    icon: <AlertTriangle className="text-warning-text shrink-0" size={18} />,
    title: 'text-warning-text',
    message: 'text-warning-text-muted',
    bar: 'bg-warning-text',
  },
  info: {
    icon: <Info className="text-brand-text shrink-0" size={18} />,
    title: 'text-brand-text',
    message: 'text-content-secondary',
    bar: 'bg-brand-text',
  },
};

/**
 * One toast. Its timer pauses while it is hovered or focused, so a message being read never
 * disappears, and the bar along the bottom shows the time left.
 */
function ToastCard({ toast, onDismiss }: { toast: ShownToast; onDismiss: (id: string) => void }) {
  const tone = TOAST_TONES[toast.type];
  const [paused, setPaused] = useState(false);
  const remainingRef = useRef(toast.duration);

  useEffect(() => {
    if (toast.duration <= 0 || paused || toast.leaving) return;
    const startedAt = trustedNowMs();
    const timer = setTimeout(() => onDismiss(toast.id), remainingRef.current);
    return () => {
      clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (trustedNowMs() - startedAt));
    };
  }, [paused, toast.duration, toast.id, toast.leaving, onDismiss]);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`relative overflow-hidden pointer-events-auto p-3.5 rounded-xl border border-overlay-default bg-bg-800/90 backdrop-blur-md shadow-lg flex items-start gap-3 ${
        toast.leaving ? 'animate-toast-out' : 'animate-slide-in-right'
      }`}
    >
      <div className="mt-0.5">{tone.icon}</div>
      <div className="flex-1 min-w-0">
        <h4 className={`text-xs font-medium leading-snug ${tone.title}`}>{toast.title}</h4>
        {toast.message && <p className={`text-micro mt-0.5 leading-relaxed ${tone.message}`}>{toast.message}</p>}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className={`p-1 rounded-lg text-content-muted hover:text-content-primary hover:bg-overlay-subtle transition-colors ${TAP_TARGET}`}
        aria-label="Dismiss toast"
      >
        <X size={14} />
      </button>
      {toast.duration > 0 && (
        <span
          aria-hidden="true"
          className={`toast-timer absolute left-0 bottom-0 h-0.5 w-full origin-left opacity-60 ${tone.bar}`}
          style={{ animationDuration: `${toast.duration}ms`, animationPlayState: paused ? 'paused' : 'running' }}
        />
      )}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- standard co-located React context hook pattern with ToastProvider
export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    // Safe fallback if used outside provider
    return {
      showToast: () => {},
      showSuccessToast: () => {},
      showErrorToast: (title: string, message?: string) => {
        console.error(`[Toast Error] ${title}: ${message || ''}`);
      },
      showWarningToast: () => {},
      showInfoToast: () => {},
    };
  }
  return context;
}
