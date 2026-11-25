'use client';

import React, { useState, useEffect, useRef, useId, useMemo } from 'react';
import { Student, Payment, PaymentMethod } from '@/types';
import { X, Wallet, Loader2, RotateCcw } from 'lucide-react';
import { recordStudentPayment, updateStudentSettings } from '@/lib/storage';
import { getTashkentTodayStr, formatShortRuDate } from '@/lib/formatters';
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
  const isOpenRef = useRef(isOpen);

  const baseId = useId();
  const titleId = `${baseId}-title`;

  // Open/close native <dialog> via showModal() / close()
  useEffect(() => {
    isOpenRef.current = isOpen;
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

  const handleDialogClose = () => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = '';
    }
    if (isOpenRef.current) {
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={handleDialogClose}
      {...({ closedby: 'any' } as Record<string, string>)}
      className="m-auto mb-0 sm:mb-auto w-full max-w-md rounded-t-3xl sm:rounded-3xl p-0 border border-[#E7E2D8] bg-white text-[#1C1917] shadow-2xl open:flex open:flex-col max-h-[90vh] overflow-hidden"
    >
      {isOpen && student && (
        <AddPaymentModalBody
          key={student.id}
          student={student}
          baseId={baseId}
          titleId={titleId}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
    </dialog>
  );
};

interface AddPaymentModalBodyProps {
  student: Student;
  baseId: string;
  titleId: string;
  onClose: () => void;
  onSaved: (result: { payment: Payment; newBalance: number; studentId: string }) => void | Promise<void>;
}

const AddPaymentModalBody: React.FC<AddPaymentModalBodyProps> = ({
  student,
  baseId,
  titleId,
  onClose,
  onSaved,
}) => {
  const lessonsInputRef = useRef<HTMLInputElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  const lessonsInputId = `${baseId}-lessons`;
  const amountInputId = `${baseId}-amount`;
  const dateInputId = `${baseId}-date`;
  const noteInputId = `${baseId}-note`;
  const errorId = `${baseId}-error`;

  const lessonRate = student.lesson_rate || 300000;
  const currentBalance = student.lessons_balance ?? 0;
  const defaultLessons = Math.max(1, Number(student.monthly_target_lessons) || 8);

  const [lessonsStr, setLessonsStr] = useState<string>(String(defaultLessons));
  const [amountStr, setAmountStr] = useState<string>(String(defaultLessons * lessonRate));
  const [isAmountCustom, setIsAmountCustom] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('payme');
  const [paidDate, setPaidDate] = useState<string>(getTashkentTodayStr());
  const [note, setNote] = useState<string>('');
  const isPackageStudent = student.billing_type === 'package';
  const [startNewPackage, setStartNewPackage] = useState<boolean>(
    isPackageStudent && currentBalance <= 0
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const lessonsCount = parseDigits(lessonsStr);
  const amountUzs = parseDigits(amountStr);
  const autoAmount = lessonsCount * lessonRate;
  const projectedBalance = currentBalance + lessonsCount;

  const lessonPresets = useMemo(() => {
    const target = Math.max(1, Number(student.monthly_target_lessons) || 8);
    const set = new Set<number>([4, 8, 12, target]);
    return Array.from(set).sort((a, b) => a - b).slice(0, 4);
  }, [student.monthly_target_lessons]);

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

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

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

      if (isPackageStudent && startNewPackage && lessonsCount > 0) {
        await updateStudentSettings(student.id, {
          billing_day: paidDate,
          monthly_target_lessons: lessonsCount,
        });
      }

      hapticNotification('success');
      await onSaved({ payment, newBalance, studentId: student.id });
      onClose();
    } catch (err: unknown) {
      console.error('Failed to record payment:', err);
      hapticNotification('error');
      setErrorMsg(
        err instanceof Error && err.message
          ? err.message
          : 'Не удалось сохранить оплату. Проверьте подключение.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col max-h-[90vh] overflow-y-auto p-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:pb-5 space-y-4 text-xs">
          <div className="w-9 h-1 rounded-full bg-[#DDD6C9] mx-auto sm:hidden" aria-hidden="true" />
          {/* Header */}
          <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-[#EFECE5]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#E7F7F0] flex items-center justify-center text-emerald-700 shrink-0">
                <Wallet className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h3 id={titleId} className="text-base font-bold text-[#1C1917] leading-tight truncate">
                  Оплата · {student.name}
                </h3>
                <p className="text-[11px] font-medium text-[#78716C] tabular-nums mt-0.5">
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
              className="w-8 h-8 rounded-full bg-[#F2EFE9] hover:bg-[#EAE5DC] flex items-center justify-center text-[#78716C] transition-colors shrink-0"
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
                  className="text-[11px] font-semibold text-[#57534E] uppercase tracking-wide"
                >
                  Количество уроков
                </label>
                <div className="flex items-center gap-1">
                  {lessonPresets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSelectLessonPreset(preset)}
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums border transition-colors active:scale-95 ${
                        lessonsCount === preset
                          ? 'bg-[#1C1917] text-white border-[#1C1917]'
                          : 'bg-[#F7F5F0] text-[#57534E] border-[#E7E2D8] hover:bg-[#EFEBE2]'
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
                className="w-full px-3.5 py-2.5 text-base sm:text-sm font-bold tabular-nums text-[#1C1917] bg-[#F7F5F0] border border-[#E7E2D8] rounded-xl focus:bg-white focus:border-emerald-600 focus:outline-hidden transition-colors"
              />
            </div>

            {/* Amount in UZS */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor={amountInputId}
                  className="text-[11px] font-semibold text-[#57534E] uppercase tracking-wide"
                >
                  Сумма (UZS)
                </label>
                {isAmountCustom && amountUzs !== autoAmount ? (
                  <button
                    type="button"
                    onClick={handleResetAmountAuto}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2F6FED] hover:text-[#255CE0] tabular-nums"
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
                className="w-full px-3.5 py-2.5 text-base sm:text-sm font-bold tabular-nums text-[#1C1917] bg-[#F7F5F0] border border-[#E7E2D8] rounded-xl focus:bg-white focus:border-emerald-600 focus:outline-hidden transition-colors"
              />
            </div>

            {/* Payment Method Chips */}
            <fieldset className="space-y-1.5">
              <legend className="text-[11px] font-semibold text-[#57534E] uppercase tracking-wide">
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
                        className={`flex items-center justify-center py-2 px-1 rounded-xl text-[11px] font-semibold border cursor-pointer transition-colors select-none peer-focus-visible:ring-2 peer-focus-visible:ring-[#2F6FED] peer-focus-visible:ring-offset-1 active:scale-95 ${
                          checked
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : 'bg-[#F7F5F0] text-[#44403C] border-[#E7E2D8] hover:bg-[#EFEBE2]'
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
                  className="block text-[11px] font-semibold text-[#57534E] uppercase tracking-wide mb-1"
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
                  className="w-full px-3 py-2 text-xs font-semibold tabular-nums text-[#1C1917] bg-[#F7F5F0] border border-[#E7E2D8] rounded-xl focus:bg-white focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div>
                <label
                  htmlFor={noteInputId}
                  className="block text-[11px] font-semibold text-[#57534E] uppercase tracking-wide mb-1"
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
                  className="w-full px-3 py-2 text-xs font-medium text-[#1C1917] bg-[#F7F5F0] border border-[#E7E2D8] rounded-xl placeholder:text-[#8C857B] focus:bg-white focus:border-emerald-600 focus:outline-hidden"
                />
              </div>
            </div>

            {/* Start New Package Toggle (for package students) */}
            {isPackageStudent && lessonsCount > 0 && (
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#EEF3FE] border border-[#2F6FED]/20 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={startNewPackage}
                  onChange={(e) => {
                    hapticImpact('light');
                    setStartNewPackage(e.target.checked);
                  }}
                  className="mt-0.5 w-4 h-4 rounded border-[#2F6FED]/40 text-[#2F6FED] focus:ring-[#2F6FED] shrink-0"
                />
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-[#1C1917] block">
                    Начать новый пакет с {formatShortRuDate(paidDate)}
                  </span>
                  <span className="text-[11px] text-[#57534E] leading-snug block mt-0.5">
                    {startNewPackage
                      ? `Счётчик пакета обновится: ${lessonsCount} ур. с ${formatShortRuDate(paidDate)}`
                      : `Текущий пакет (ост. ${currentBalance} ур.) продолжит считаться до закрытия`}
                  </span>
                </div>
              </label>
            )}

            {/* Balance Preview Strip */}
            <div className="px-3 py-2 rounded-xl bg-[#E7F7F0] border border-emerald-200/80 flex items-center justify-between text-xs tabular-nums">
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
                className="px-3 py-2 rounded-xl bg-[#FDECE8] border border-[#F6BFA9] text-[#B93815] text-xs font-semibold"
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
                className="px-4 py-3 rounded-2xl border border-[#E7E2D8] bg-[#F7F5F0] text-[#44403C] font-semibold text-xs hover:bg-[#EFEBE2] active:scale-95 transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-xs shadow-sm flex items-center justify-center gap-1.5 active:scale-[0.98] transition-colors tabular-nums"
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
  );
};
