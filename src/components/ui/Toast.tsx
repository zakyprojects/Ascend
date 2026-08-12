import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  showSuccessToast: (title: string, message?: string) => void;
  showErrorToast: (title: string, message?: string) => void;
  showWarningToast: (title: string, message?: string) => void;
  showInfoToast: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const lastShownRef = useRef<Map<string, number>>(new Map());

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const key = `${toast.type}:${toast.title}:${toast.message || ''}`;
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

  const showSuccessToast = useCallback((title: string, message?: string) => {
    showToast({ type: 'success', title, message });
  }, [showToast]);

  const showErrorToast = useCallback((title: string, message?: string) => {
    showToast({ type: 'error', title, message });
  }, [showToast]);

  const showWarningToast = useCallback((title: string, message?: string) => {
    showToast({ type: 'warning', title, message });
  }, [showToast]);

  const showInfoToast = useCallback((title: string, message?: string) => {
    showToast({ type: 'info', title, message });
  }, [showToast]);

  // Global window event listener for central choke point calls
  useEffect(() => {
    const handleToastErrorEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ title: string; message?: string }>;
      if (customEvent.detail?.title) {
        showErrorToast(customEvent.detail.title, customEvent.detail.message);
      }
    };

    const handleToastSuccessEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ title: string; message?: string }>;
      if (customEvent.detail?.title) {
        showSuccessToast(customEvent.detail.title, customEvent.detail.message);
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
              bg: 'bg-emerald-950/90 border-emerald-500/40 text-emerald-200',
              icon: <CheckCircle2 className="text-emerald-400 shrink-0" size={18} />,
            },
            error: {
              bg: 'bg-rose-950/90 border-rose-500/40 text-rose-200',
              icon: <AlertCircle className="text-rose-400 shrink-0" size={18} />,
            },
            warning: {
              bg: 'bg-amber-950/90 border-amber-500/40 text-amber-200',
              icon: <AlertTriangle className="text-amber-400 shrink-0" size={18} />,
            },
            info: {
              bg: 'bg-primary-950/90 border-primary-500/40 text-primary-200',
              icon: <Info className="text-primary-400 shrink-0" size={18} />,
            },
          }[toast.type];

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto p-3.5 rounded-xl border backdrop-blur-md shadow-2xl flex items-start gap-3 transition-all animate-slide-in-right ${config.bg}`}
            >
              <div className="mt-0.5">{config.icon}</div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold leading-snug">{toast.title}</h4>
                {toast.message && (
                  <p className="text-[11px] opacity-85 mt-0.5 leading-relaxed">{toast.message}</p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 rounded-lg opacity-60 hover:opacity-100 transition-opacity"
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
