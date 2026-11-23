'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

export type ToastTone = 'default' | 'success' | 'warning' | 'error';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  durationMs?: number;
}

interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
  durationMs: number;
}

interface ToastContextValue {
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
}

const NOOP_CONTEXT: ToastContextValue = {
  showToast: () => '',
  dismissToast: () => {},
};

const ToastContext = createContext<ToastContextValue>(NOOP_CONTEXT);

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

const TONE_CLASSES: Record<ToastTone, string> = {
  default: 'bg-slate-900/95 text-white border-slate-800',
  success: 'bg-slate-900/95 text-white border-slate-800',
  warning: 'bg-amber-950/95 text-amber-50 border-amber-800',
  error: 'bg-rose-700 text-white border-rose-600',
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const counterRef = useRef(0);

  const clearTimer = useCallback((id: string) => {
    const existing = timersRef.current.get(id);
    if (existing !== undefined) {
      clearTimeout(existing);
      timersRef.current.delete(id);
    }
  }, []);

  const dismissToast = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer]
  );

  const startTimer = useCallback(
    (id: string, durationMs: number) => {
      clearTimer(id);
      if (durationMs <= 0) return;
      const timer = setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
      timersRef.current.set(id, timer);
    },
    [clearTimer]
  );

  const showToast = useCallback(
    (options: ToastOptions): string => {
      counterRef.current += 1;
      const id = `toast-${Date.now()}-${counterRef.current}`;
      const durationMs = options.durationMs ?? (options.onAction ? 4500 : 2800);
      const item: ToastItem = {
        id,
        message: options.message,
        tone: options.tone ?? 'default',
        actionLabel: options.actionLabel,
        onAction: options.onAction,
        durationMs,
      };

      setToasts((prev) => {
        const next = [...prev, item];
        if (next.length > 2) {
          const removed = next.slice(0, next.length - 2);
          for (const r of removed) {
            clearTimer(r.id);
          }
          return next.slice(-2);
        }
        return next;
      });

      startTimer(id, durationMs);
      return id;
    },
    [clearTimer, startTimer]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div
        role="region"
        aria-label="Уведомления"
        aria-live="polite"
        className="fixed left-3 right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-[70] pointer-events-none flex flex-col items-center gap-1.5"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            onMouseEnter={() => clearTimer(t.id)}
            onMouseLeave={() => startTimer(t.id, t.durationMs)}
            onFocus={() => clearTimer(t.id)}
            onBlur={() => startTimer(t.id, t.durationMs)}
            className={`pointer-events-auto w-full max-w-md rounded-2xl px-3.5 py-2.5 shadow-lg border flex items-center justify-between gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2 duration-150 ${TONE_CLASSES[t.tone]}`}
          >
            <span className="min-w-0 leading-snug break-words">{t.message}</span>

            <div className="flex items-center gap-1.5 shrink-0">
              {t.actionLabel && t.onAction && (
                <button
                  type="button"
                  onClick={() => {
                    const action = t.onAction;
                    dismissToast(t.id);
                    if (action) void action();
                  }}
                  className="touch-hit px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white font-bold text-[11px] active:scale-95 transition-all"
                >
                  {t.actionLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Закрыть уведомление"
                className="touch-hit w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/80 hover:text-white active:scale-90 transition-all"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
