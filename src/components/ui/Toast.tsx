import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  dedupKey?: string;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  showSuccessToast: (title: string, message?: string, dedupKey?: string) => void;
  showErrorToast: (title: string, message?: string, dedupKey?: string) => void;
  showWarningToast: (title: string, message?: string, dedupKey?: string) => void;
  showInfoToast: (title: string, message?: string, dedupKey?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastShownRef = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const key = toast.dedupKey ? `${toast.type}:${toast.dedupKey}` : `${toast.type}:${toast.title}:${toast.message || ''}`;
    const now = Date.now();
    const lastTime = lastShownRef.current.get(key) || 0;

    // Suppress identical toasts shown within the last 6 seconds to prevent spam
    if (now - lastTime < 6000) {
      return;
    }

    lastShownRef.current.set(key, now);

    const id = Math.random().toString(36).substring(2, 9);
    const duration = toast.duration ?? (toast.type === 'error' ? 5000 : 3500);

    const newItem: ToastItem = { ...toast, id };

    setToasts((prev) => [...prev.slice(-4), newItem]); // Max 5 toasts

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

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
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm w-[calc(100%-2rem)] pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const config = {
            success: {
              bg: 'bg-emerald-500/15 border-emerald-500/30',
              icon: <CheckCircle2 className="text-success-text shrink-0" size={18} />,
              title: 'text-success-text',
              message: 'text-content-secondary',
            },
            error: {
              bg: 'bg-rose-500/15 border-rose-500/30',
              icon: <AlertCircle className="text-error-text shrink-0" size={18} />,
              title: 'text-error-text',
              message: 'text-content-secondary',
            },
            warning: {
              bg: 'bg-amber-500/15 border-amber-500/30',
              icon: <AlertTriangle className="text-warning-text shrink-0" size={18} />,
              title: 'text-warning-text',
              message: 'text-warning-text-muted',
            },
            info: {
              bg: 'bg-primary-500/15 border-primary-500/30',
              icon: <Info className="text-brand-text shrink-0" size={18} />,
              title: 'text-brand-text',
              message: 'text-content-secondary',
            },
          }[toast.type];

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-3.5 rounded-xl border backdrop-blur-md shadow-lg flex items-start gap-3 transition-all animate-slide-in-right ${config.bg}`}
            >
              <div className="mt-0.5">{config.icon}</div>
              <div className="flex-1 min-w-0">
                <h4 className={`text-xs font-bold leading-snug ${config.title}`}>{toast.title}</h4>
                {toast.message && (
                  <p className={`text-[11px] mt-0.5 leading-relaxed ${config.message}`}>{toast.message}</p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 rounded-lg text-content-muted hover:text-content-primary hover:bg-overlay-subtle transition-colors"
                aria-label="Dismiss toast"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

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
