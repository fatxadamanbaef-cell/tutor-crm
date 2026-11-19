'use client';

import React, { useState, useEffect, useRef, useId, useMemo } from 'react';
import { Student, Payment, PaymentMethod } from '@/types';
import { X, Wallet, Loader2, RotateCcw } from 'lucide-react';
import { recordStudentPayment } from '@/lib/storage';
import { getTashkentTodayStr } from '@/lib/formatters';
import { hapticImpact, hapticNotification } from '@/lib/telegram';

export interface AddPaymentModalProps {
  isOpen: boolean;
  student: Student | null;
  onClose: () => void;
  onSaved: (result: { payment: Payment; newBalance: number; studentId: string }) => void | Promise<void>;
}

const PAYMENT_METHODS: Array<{ id: PaymentMethod; label: string }> = [
  { id: 'payme', label: 'Payme' },
  { id: 'click', label: 'Click' },
  { id: 'card', label: 'Карта' },
  { id: 'cash', label: 'Наличные' },
];

function parseDigits(value: string): number {
  const digits = value.replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

export const AddPaymentModal: React.FC<AddPaymentModalProps> = ({
  isOpen,
  student,
  onClose,
  onSaved,
}) => {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const lessonsInputRef = useRef<HTMLInputElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;

  const baseId = useId();
  const titleId = `${baseId}-title`;
  const lessonsInputId = `${baseId}-lessons`;
  const amountInputId = `${baseId}-amount`;
  const dateInputId = `${baseId}-date`;
  const noteInputId = `${baseId}-note`;
  const errorId = `${baseId}-error`;

  const [lessonsStr, setLessonsStr] = useState<string>('12');
  const [amountStr, setAmountStr] = useState<string>('3600000');
  const [isAmountCustom, setIsAmountCustom] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('payme');
  const [paidDate, setPaidDate] = useState<string>(getTashkentTodayStr());
  const [note, setNote] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const lessonRate = student?.lesson_rate || 300000;
  const currentBalance = student?.lessons_balance ?? 0;

  // Reset form values whenever opened for a student
  useEffect(() => {
    if (isOpen && student) {
      const defaultLessons = Math.max(1, Number(student.monthly_target_lessons) || 8);
      const rate = student.lesson_rate || 300000;
      setLessonsStr(String(defaultLessons));
      setAmountStr(String(defaultLessons * rate));
      setIsAmountCustom(false);
      setPaymentMethod('payme');
      setPaidDate(getTashkentTodayStr());
      setNote('');
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, student]);

  // Open/close native <dialog> via showModal() / close()
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && student) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen, student]);

  // Light-dismiss fallback for browsers without native `closedby` (e.g. Safari / iOS WebView)
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

  const lessonsCount = parseDigits(lessonsStr);
  const amountUzs = parseDigits(amountStr);
  const autoAmount = lessonsCount * lessonRate;
  const projectedBalance = currentBalance + lessonsCount;

  const lessonPresets = useMemo(() => {
    const target = Math.max(1, Number(student?.monthly_target_lessons) || 8);
    const set = new Set<number>([4, 8, 12, target]);
    return Array.from(set).sort((a, b) => a - b).slice(0, 4);
  }, [student?.monthly_target_lessons]);

  const handleLessonsChange = (raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 3);
    setLessonsStr(clean);
    setErrorMsg(null);
    if (!isAmountCustom) {
      const n = clean ? parseInt(clean, 10) : 0;
      setAmountStr(String(n * lessonRate));
    }
  };

  const handleSelectLessonPreset = (count: number) => {
    hapticImpact('light');
    setLessonsStr(String(count));
    setErrorMsg(null);
    if (!isAmountCustom) {
      setAmountStr(String(count * lessonRate));
    }
  };

  const handleAmountChange = (raw: string) => {
    const clean = raw.replace(/\D/g, '').slice(0, 10);
    setAmountStr(clean);
    setIsAmountCustom(true);
    setErrorMsg(null);
  };

  const handleResetAmountAuto = () => {
    hapticImpact('light');
    setAmountStr(String(autoAmount));
    setIsAmountCustom(false);
    setErrorMsg(null);
  };

  const handleDialogClose = () => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    if (isOpenRef.current) {
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!student || isSubmitting) return;

    if (lessonsCount <= 0 && amountUzs <= 0) {
      setErrorMsg('Укажите количество уроков или сумму оплаты.');
      hapticNotification('warning');
      lessonsInputRef.current?.focus();
      return;
    }

    if (!paidDate) {
      setErrorMsg('Укажите дату оплаты.');
      hapticNotification('warning');
      dateInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const { payment, newBalance } = await recordStudentPayment({
        studentId: student.id,
        amountUzs,
        lessonsAdded: lessonsCount,
        paymentMethod,
        paidAt: paidDate,
        note: note.trim() || null,
      });

      hapticNotification('success');
      await onSaved({ payment, newBalance, studentId: student.id });
      onClose();
    } catch (err: any) {
      console.error('Failed to record payment:', err);
      hapticNotification('error');
      setErrorMsg(err?.message || 'Не удалось сохранить оплату. Проверьте подключение.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleDialogClose}
      {...({ closedby: 'any' } as Record<string, string>)}
      className="m-auto mb-0 sm:mb-auto w-full max-w-md rounded-t-3xl sm:rounded-3xl p-0 border border-slate-200/80 bg-white text-slate-900 shadow-2xl open:flex open:flex-col max-h-[90vh] overflow-hidden"
    >
      {student && (
        <div className="flex flex-col max-h-[90vh] overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:pb-5 space-y-4 text-xs">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-100">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <Wallet className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 id={titleId} className="text-base font-bold text-slate-900 leading-tight truncate">
                  Оплата · {student.name}
                </h3>
                <p className="text-[11px] font-medium text-slate-500 tabular-nums mt-0.5">
                  Ставка {lessonRate.toLocaleString('ru-RU')} сум · Баланс: {currentBalance} ур.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                hapticImpact('light');
                onClose();
              }}
              aria-label="Закрыть окно оплаты"
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
            {/* Lessons Count + Presets */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={lessonsInputId}
                  className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide"
                >
                  Количество уроков
                </label>
                <div className="flex items-center gap-1">
                  {lessonPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSelectLessonPreset(preset)}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold tabular-nums border transition-all active:scale-95 ${
                        lessonsCount === preset
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      +{preset}
                    </button>
                  ))}
                </div>
              </div>
              <input
                ref={lessonsInputRef}
                id={lessonsInputId}
                name="lessons_added"
                type="text"
                inputMode="numeric"
                enterKeyHint="next"
                aria-invalid={Boolean(errorMsg && lessonsCount <= 0 && amountUzs <= 0) || undefined}
                aria-describedby={errorMsg ? errorId : undefined}
                value={lessonsStr}
                onChange={(e) => handleLessonsChange(e.target.value)}
                placeholder="12"
                className="w-full px-3.5 py-2.5 text-base sm:text-sm font-bold tabular-nums text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600 focus:outline-hidden transition-colors"
              />
            </div>

            {/* Amount in UZS */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={amountInputId}
                  className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide"
                >
                  Сумма (UZS)
                </label>
                {isAmountCustom && amountUzs !== autoAmount ? (
                  <button
                    type="button"
                    onClick={handleResetAmountAuto}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 tabular-nums"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>По ставке: {autoAmount.toLocaleString('ru-RU')}</span>
                  </button>
                ) : (
                  <span className="text-[11px] font-semibold text-emerald-700 tabular-nums">
                    {amountUzs.toLocaleString('ru-RU')} сум
                  </span>
                )}
              </div>
              <input
                id={amountInputId}
                name="amount_uzs"
                type="text"
                inputMode="numeric"
                enterKeyHint="next"
                aria-invalid={Boolean(errorMsg && lessonsCount <= 0 && amountUzs <= 0) || undefined}
                aria-describedby={errorMsg ? errorId : undefined}
                value={amountStr}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="3600000"
                className="w-full px-3.5 py-2.5 text-base sm:text-sm font-bold tabular-nums text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600 focus:outline-hidden transition-colors"
              />
            </div>

            {/* Payment Method Chips (Semantic radio group inside fieldset) */}
            <fieldset className="space-y-1.5">
              <legend className="text-[11px] font-semibold text-slate-600 uppercase tracking-wide">
                Способ оплаты
              </legend>
              <div className="grid grid-cols-4 gap-1.5">
                {PAYMENT_METHODS.map((method) => {
                  const radioId = `${baseId}-method-${method.id}`;
                  const checked = paymentMethod === method.id;
                  return (
                    <div key={method.id} className="relative">
                      <input
                        id={radioId}
                        type="radio"
                        name="payment_method"
                        value={method.id}
                        checked={checked}
                        onChange={() => {
                          hapticImpact('light');
                          setPaymentMethod(method.id);
                        }}
                        className="sr-only peer"
                      />
                      <label
                        htmlFor={radioId}
                        className={`flex items-center justify-center py-2 px-1 rounded-xl text-[11px] font-semibold border cursor-pointer transition-all select-none peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-1 active:scale-95 ${
                          checked
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {method.label}
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>

            {/* Date & Note */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label
                  htmlFor={dateInputId}
                  className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1"
                >
                  Дата оплаты
                </label>
                <input
                  ref={dateInputRef}
                  id={dateInputId}
                  name="paid_at"
                  type="date"
                  required
                  aria-invalid={Boolean(errorMsg && !paidDate) || undefined}
                  aria-describedby={errorMsg ? errorId : undefined}
                  value={paidDate}
                  onChange={(e) => {
                    setPaidDate(e.target.value);
                    setErrorMsg(null);
                  }}
                  className="w-full px-3 py-2 text-xs font-semibold tabular-nums text-slate-900 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label
                  htmlFor={noteInputId}
                  className="block text-[11px] font-semibold text-slate-600 uppercase tracking-wide mb-1"
                >
                  Заметка
                </label>
                <input
                  id={noteInputId}
                  name="note"
                  type="text"
                  enterKeyHint="done"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Необязательно"
                  className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded-xl placeholder:text-slate-400 focus:bg-white focus:border-emerald-600 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Balance Preview Strip */}
            <div className="px-3 py-2 rounded-xl bg-emerald-50/70 border border-emerald-200/70 flex items-center justify-between text-xs tabular-nums">
              <span className="text-emerald-900 font-medium">Баланс после оплаты</span>
              <span className="font-bold text-emerald-800">
                {currentBalance} ур. → {projectedBalance} ур.
              </span>
            </div>

            {/* Error Alert */}
            {errorMsg && (
              <div
                id={errorId}
                role="alert"
                aria-live="polite"
                className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold"
              >
                {errorMsg}
              </div>
            )}

            {/* Submit & Cancel */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  onClose();
                }}
                className="px-4 py-3 rounded-2xl border border-slate-200 text-slate-700 font-semibold text-xs hover:bg-slate-50 active:scale-95 transition-all"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs shadow-md shadow-emerald-600/20 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all tabular-nums"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Сохранение...</span>
                  </>
                ) : (
                  <span>
                    Зачислить {amountUzs.toLocaleString('ru-RU')} сум
                    {lessonsCount > 0 ? ` (+${lessonsCount} ур.)` : ''}
                  </span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </dialog>
  );
};
