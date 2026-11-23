'use client';

import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { hapticImpact } from '@/lib/telegram';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  danger = false,
  isLoading = false,
  onConfirm,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const isOpenRef = useRef(isOpen);
  const titleId = useId();

  useEffect(() => {
    isOpenRef.current = isOpen;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || typeof HTMLDialogElement === 'undefined') return;
    if ('closedBy' in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };

    let pressedOutside = false;
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e) && dialog.open) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const handleDialogClose = () => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    if (isOpenRef.current && !isLoading) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleDialogClose}
      {...({ closedby: 'any' } as Record<string, string>)}
      className="m-auto mb-0 sm:mb-auto w-full max-w-sm rounded-t-3xl sm:rounded-3xl p-0 border border-slate-200/80 bg-white text-slate-900 shadow-2xl overflow-hidden"
    >
      {isOpen && (
        <div className="p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:pb-5 space-y-4">
          <div className="flex items-start gap-3">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                danger ? 'bg-rose-50 text-rose-600' : 'bg-blue-50 text-blue-600'
              }`}
            >
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id={titleId} className="text-base font-bold text-slate-900 leading-snug">
                {title}
              </h3>
              {description && (
                <p className="text-xs text-slate-600 font-medium mt-1 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                hapticImpact('light');
                onClose();
              }}
              className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={isLoading}
              onClick={() => {
                hapticImpact('medium');
                void onConfirm();
              }}
              className={`flex-1 py-3 rounded-2xl text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-all disabled:opacity-60 ${
                danger
                  ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
              }`}
            >
              {isLoading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              <span>{confirmLabel}</span>
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
};
