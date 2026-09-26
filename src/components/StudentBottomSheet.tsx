'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Student, Lesson, LessonStatus } from '@/types';
import {
  X,
  CreditCard,
  MessageSquare,
  Trash2,
  Check,
  Send,
  Sparkles,
  FileText,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Flame,
} from 'lucide-react';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/telegram';
import {
  formatUZS,
  getTashkentTodayStr,
  getTashkentNow,
  getStudentBillingPeriod,
  formatRuDateWithDay,
} from '@/lib/formatters';
import { getTutorSettings } from '@/lib/settings';
import { getStudentHistory, StudentHistoryRecord, toggleStudentCalendarDate, updateStudentBillingDay } from '@/lib/storage';
import {
  isSameDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  parseISO,
  addMonths
} from 'date-fns';
import { ru } from 'date-fns/locale';

const fireConfetti = () => {
  if (typeof window !== 'undefined') {
    import('canvas-confetti').then((mod) => {
      mod.default({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    }).catch(() => {});
  }
};

interface StudentBottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  lessons: Lesson[];
  onAddPayment: (studentId: string, amountUzs: number, lessonsAdded: number, paymentDate?: string) => void;
  onDeleteStudent: (studentId: string) => void;
  onToggleCalendarDate?: (studentId: string, dateStr: string) => void;
}

export const StudentBottomSheet: React.FC<StudentBottomSheetProps> = ({
  isOpen,
  onClose,
  student,
  lessons,
  onAddPayment,
  onDeleteStudent,
  onToggleCalendarDate,
}) => {
  const [localLessons, setLocalLessons] = useState<Lesson[]>(lessons);
  const [monthOffset, setMonthOffset] = useState(0);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [lessonsToAdd, setLessonsToAdd] = useState(8);
  const [customAmount, setCustomAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState(getTashkentTodayStr());

  const [showHistory, setShowHistory] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<StudentHistoryRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [limitWarning, setLimitWarning] = useState(false);

  const [copiedReminder, setCopiedReminder] = useState(false);
  const [copiedReport, setCopiedReport] = useState(false);

  const [customBillingDay, setCustomBillingDay] = useState<string | number>(student?.billing_day || 10);
  const [showBillingDayPicker, setShowBillingDayPicker] = useState(false);
  const processingRef = useRef<{ [date: string]: boolean }>({});

  // Sync localLessons with prop
  useEffect(() => {
    setLocalLessons(lessons);
  }, [lessons]);

  // Reset states on open
  useEffect(() => {
    if (isOpen && student) {
      setMonthOffset(0);
      setShowPaymentForm(false);
      setShowHistory(false);
      setLimitWarning(false);
      setCustomBillingDay(student.billing_day || 10);
      setShowBillingDayPicker(false);
      setLocalLessons(lessons);
    }
  }, [isOpen, student?.id, student?.billing_day]);

  if (!isOpen || !student) return null;

  const currentPrice = student.price_per_lesson || 150000;
  const billingDay = student.billing_day || 10;
  const totalLimit = student.package_total_lessons || 8;

  // Calculate current billing period (e.g. 10 сентября - 09 октября)
  const period = getStudentBillingPeriod(customBillingDay, getTashkentNow(), monthOffset);

  // Month grid for current viewed month
  const viewedDate = addMonths(getTashkentNow(), monthOffset);
  const monthStart = startOfMonth(viewedDate);
  const monthEnd = endOfMonth(viewedDate);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarGridDays = eachDayOfInterval({ start: startDate, end: endDate });

  // Filter lessons for this student inside the period range
  const periodLessons = localLessons
    .filter(
      (l) =>
        l.student_id === student.id &&
        l.date.substring(0, 10) >= period.startDate &&
        l.date.substring(0, 10) <= period.endDate
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const completedLessons = periodLessons.filter((l) => l.status === 'completed');
  const burnedLessons = periodLessons.filter((l) => l.status === 'missed_penalty');
  const greenCount = completedLessons.length;
  const redCount = burnedLessons.length;
  const usedCount = greenCount + redCount;
  const remainingCount = student.prepaid_balance;

  const calculatedPayment = customAmount > 0 ? customAmount : currentPrice * lessonsToAdd;

  // 3-State Day Click Handler on the Calendar (Instant Optimistic UI)
  const handleDateCellClick = async (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');

    if (processingRef.current[dateStr]) return;

    // Block clicks outside the current billing period
    if (dateStr < period.startDate || dateStr > period.endDate) return;

    const existingLesson = periodLessons.find((l) => l.date.substring(0, 10) === dateStr);
    const currentStatus = existingLesson?.status;

    let nextStatus: 'completed' | null = null;
    if (!existingLesson || currentStatus !== 'completed') {
      // 1st click: NONE -> GREEN (Completed)
      nextStatus = 'completed';
      hapticNotification('success');
      fireConfetti();
    } else {
      // 2nd click: GREEN -> NONE (Unmark)
      nextStatus = null;
      hapticSelection();
    }

    processingRef.current[dateStr] = true;

    // 1. Optimistic UI update (instant)
    const prevLessons = [...localLessons];
    if (nextStatus === null) {
      setLocalLessons((prev) =>
        prev.filter((l) => !(l.student_id === student.id && l.date.substring(0, 10) === dateStr))
      );
    } else if (existingLesson) {
      setLocalLessons((prev) =>
        prev.map((l) =>
          l.student_id === student.id && l.date.substring(0, 10) === dateStr
            ? { ...l, status: nextStatus!, notes: nextStatus === 'completed' ? 'Проведенный урок' : 'Пропуск (сгорел)' }
            : l
        )
      );
    } else {
      const optimisticLesson: Lesson = {
        id: 'temp-' + Date.now(),
        student_id: student.id,
        student_name: student.name,
        price_per_lesson: currentPrice,
        date: `${dateStr}T18:00:00+05:00`,
        time_str: '18:00 - 19:30',
        status: nextStatus,
        notes: nextStatus === 'completed' ? 'Проведенный урок' : 'Пропуск (сгорел)',
        created_at: new Date().toISOString(),
      };
      setLocalLessons((prev) => [...prev, optimisticLesson]);
    }

    // 2. Persist to Supabase
    try {
      const result = await toggleStudentCalendarDate(student.id, dateStr);
      // Replace temp optimistic lesson id with real one from server
      if (result.lesson && nextStatus !== null) {
        setLocalLessons((prev) =>
          prev.map((l) =>
            l.student_id === student.id && l.date.substring(0, 10) === dateStr && l.id.startsWith('temp-')
              ? { ...result.lesson!, status: nextStatus! }
              : l
          )
        );
      }
      if (onToggleCalendarDate) {
        onToggleCalendarDate(student.id, dateStr);
      }
    } catch (e) {
      console.error('Failed to toggle calendar date:', e);
      // Rollback on error
      setLocalLessons(prevLessons);
    } finally {
      processingRef.current[dateStr] = false;
    }
  };

  const handleToggleHistory = async () => {
    hapticImpact('light');
    if (!showHistory) {
      setLoadingHistory(true);
      setShowHistory(true);
      const hist = await getStudentHistory(student.id);
      setHistoryRecords(hist);
      setLoadingHistory(false);
    } else {
      setShowHistory(false);
    }
  };

  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    onAddPayment(student.id, calculatedPayment, 8, paymentDate);
    fireConfetti();
    hapticNotification('success');
    setShowPaymentForm(false);
  };

  const handleCopyReport = async () => {
    hapticImpact('medium');
    const settings = getTutorSettings();

    // Build crystal clear parent report text based on the 8-slot period
    let text = `Здравствуйте! 📚 Отчет по занятиям: ${student.name}n`;
    text += `🗓 Период: ${period.startFormatted} — ${period.endFormatted}nn`;

    if (periodLessons.length > 0) {
      text += `Занятия в текущем периоде:n`;
      periodLessons.forEach((l, idx) => {
        const dStr = formatRuDateWithDay(l.date);
        const icon = l.status === 'completed' ? '🟢 Проведен' : '🔴 Пропуск (сгорел)';
        text += `• ${dStr} — ${icon}n`;
      });
      text += `n`;
    } else {
      text += `Занятия в текущем периоде: пока не отмеченыnn`;
    }

    text += `📊 Зачтено уроков: ${usedCount} из ${totalLimit}n`;
    text += `   (Проведено: ${greenCount} | Сгорело: ${redCount})n`;
    text += `⏳ Осталось провести: ${remainingCount} ${
      remainingCount === 1 ? 'урок' : remainingCount < 5 ? 'урока' : 'уроков'
    }n`;
    text += `🔔 Следующий расчетный день: ${period.nextBillingFormatted}nn`;
    text += `Реквизиты (${settings.bankName}): ${settings.cardNumber} (${settings.cardHolder})n`;
    text += `Спасибо! 🙌`;

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setCopiedReport(true);
      hapticNotification('success');
      setTimeout(() => setCopiedReport(false), 3000);
    }
  };

  const handleDelete = () => {
    if (confirm(`Удалить ученика «${student.name}» и все его уроки?`)) {
      hapticNotification('warning');
      onDeleteStudent(student.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-zinc-900 border-t border-zinc-800 rounded-t-3xl p-5 space-y-4 max-h-[94vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs text-zinc-200 shadow-2xl pb-8">
        
        {/* HEADER */}
        <div className="flex items-start justify-between pb-2 border-b border-zinc-800/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-teal-600 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-md shadow-teal-500/20">
              {student.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-base font-black text-white leading-tight">
                {student.name}
              </h2>
              <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5">
                <span className="font-semibold text-zinc-300">{formatUZS(currentPrice)}/ур.</span>
                <button
                  type="button"
                  onClick={() => setShowBillingDayPicker(!showBillingDayPicker)}
                  className="text-teal-400 hover:text-teal-300 underline font-semibold max-w-[150px] truncate"
                  title="Нажмите, чтобы изменить расчетный день"
                >
                  • Оплата: {customBillingDay}
                </button>
              </div>

              {showBillingDayPicker && (
                <div className="mt-2 p-2 bg-zinc-950 border border-zinc-700 rounded-2xl space-y-1.5 animate-in fade-in duration-150">
                  <div className="text-[10px] text-zinc-300 font-bold">Изменить условие оплаты:</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customBillingDay}
                      onChange={(e) => setCustomBillingDay(e.target.value)}
                      placeholder="Например: 10 число"
                      className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-teal-500"
                    />
                    <button
                      type="button"
                      onClick={async () => {
                        setShowBillingDayPicker(false);
                        hapticNotification('success');
                        if (student) {
                          try {
                            await updateStudentBillingDay(student.id, String(customBillingDay));
                          } catch (e) {
                            console.error('Failed to save billing day:', e);
                          }
                        }
                      }}
                      className="bg-teal-600 hover:bg-teal-500 text-white font-bold px-3 rounded-lg text-xs"
                    >
                      OK
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-200 bg-zinc-800/80 active:bg-zinc-700"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* 📅 ИНТЕРАКТИВНЫЙ КАЛЕНДАРЬ АБОНЕМЕНТА (3-STATE TOGGLE В 1 КЛИК) */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div className="p-3.5 rounded-3xl bg-zinc-950 border border-zinc-800 space-y-3 shadow-lg">
          
          {/* Period Navigator */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                hapticImpact('light');
                setMonthOffset((prev) => prev - 1);
              }}
              className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white active:bg-zinc-800"
              title="Предыдущий период"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-center">
              <span className="text-[10px] uppercase font-bold text-teal-400 block tracking-wider">
                Расчетный период
              </span>
              <span className="font-extrabold text-xs text-white">
                {period.startFormatted} — {period.endFormatted}
              </span>
            </div>

            <button
              onClick={() => {
                hapticImpact('light');
                setMonthOffset((prev) => prev + 1);
              }}
              className="p-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white active:bg-zinc-800"
              title="Следующий период"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Limit Warning Toast */}
          {limitWarning && (
            <div className="p-2.5 bg-amber-950/50 border border-amber-500/50 rounded-2xl text-[11px] text-amber-200 font-bold text-center animate-in fade-in zoom-in-95 duration-150">
              ⚠️ Лимит 8 уроков исчерпан! Снимите отметку с другого дня.
            </div>
          )}

          {/* Calendar Weekday Names */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-zinc-400 uppercase">
            <span>Пн</span>
            <span>Вт</span>
            <span>Ср</span>
            <span>Чт</span>
            <span>Пт</span>
            <span>Сб</span>
            <span className="text-amber-400">Вс</span>
          </div>

          {/* Calendar 7-column Interactive Grid */}
          <div className="grid grid-cols-7 gap-1.5">
            {calendarGridDays.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const isInsidePeriod = dateStr >= period.startDate && dateStr <= period.endDate;
              const lesson = isInsidePeriod ? periodLessons.find((l) => l.date.substring(0, 10) === dateStr) : undefined;
              const isCompleted = lesson?.status === 'completed';
              const isBurned = lesson?.status === 'missed_penalty';
              const isToday = isSameDay(day, getTashkentNow());

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => isInsidePeriod ? handleDateCellClick(day) : undefined}
                  disabled={!isInsidePeriod}
                  style={{ touchAction: 'manipulation' }}
                  className={`h-11 rounded-2xl flex flex-col items-center justify-center transition-all text-xs font-black relative border select-none ${
                    isInsidePeriod ? 'cursor-pointer active:scale-95' : 'cursor-default pointer-events-none'
                  } ${
                    isCompleted
                      ? 'bg-teal-600 text-white border-teal-400 shadow-md shadow-teal-600/30'
                      : isBurned
                      ? 'bg-rose-600 text-white border-rose-400 shadow-md shadow-rose-600/30'
                      : isToday && isInsidePeriod
                      ? 'bg-zinc-900 text-teal-300 border-teal-500/80 ring-1 ring-teal-500/30 active:bg-zinc-800'
                      : isInsidePeriod
                      ? 'bg-zinc-800/80 text-zinc-200 border-zinc-700 hover:border-zinc-500 active:bg-zinc-700'
                      : 'bg-zinc-950/20 text-zinc-700 border-transparent opacity-30'
                  }`}
                >
                  <span className="leading-none">{day.getDate()}</span>

                  {/* Micro Icon / Dot */}
                  <span className="text-[9px] mt-0.5 leading-none">
                    {isCompleted ? '✓' : isBurned ? '🔥' : ''}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 2-State Legend */}
          <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-400 font-bold px-1 max-w-[200px] mx-auto">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
              <span>1-й клик: 🟢 Был</span>
            </span>
            <span className="flex items-center gap-1 text-zinc-400">
              <span>2-й клик: ⚪ Снять</span>
            </span>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* 📊 ЖИВАЯ ПАНЕЛЬ ИТОГОВ (ИНВАРИАНТ 8 СЛОТОВ) */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded-2xl bg-teal-950/25 border border-teal-500/30">
            <span className="text-[9px] uppercase font-bold text-zinc-400 block">Проведено</span>
            <div className="text-base font-black text-teal-400 mt-0.5">
              🟢 {greenCount}
            </div>
          </div>

          <div className="p-2.5 rounded-2xl bg-rose-950/25 border border-rose-500/30">
            <span className="text-[9px] uppercase font-bold text-zinc-400 block">Сгорело</span>
            <div className="text-base font-black text-rose-400 mt-0.5">
              🔴 {redCount}
            </div>
          </div>

          <div className="p-2.5 rounded-2xl bg-teal-950/25 border border-teal-500/30">
            <span className="text-[9px] uppercase font-bold text-zinc-400 block">{remainingCount >= 0 ? 'Осталось' : 'Баланс'}</span>
            <div className="text-base font-black text-teal-300 mt-0.5">
              ⏳ {remainingCount >= 0 ? remainingCount : `Долг: ${Math.abs(remainingCount)}`} из {totalLimit}
            </div>
          </div>
        </div>

        {/* PAYMENT BUTTON & INLINE FORM */}
        {!showPaymentForm ? (
          <button
            onClick={() => {
              hapticImpact('medium');
              setCustomAmount(currentPrice * 8);
              setLessonsToAdd(8);
              setPaymentDate(getTashkentTodayStr());
              setShowPaymentForm(true);
            }}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-gradient-to-r from-teal-600 to-green-600 hover:from-teal-500 hover:to-green-500 text-white font-black text-xs shadow-lg shadow-teal-600/25 active:scale-95 transition-all"
          >
            <CreditCard className="w-4 h-4" />
            <span>+ Внести оплату (8 уроков)</span>
          </button>
        ) : (
          <form
            onSubmit={handleSubmitPayment}
            className="p-3.5 rounded-2xl bg-teal-950/30 border border-teal-500/40 space-y-3 animate-in fade-in duration-150 shadow-lg"
          >
            <div className="font-extrabold text-teal-300 text-xs flex items-center justify-between">
              <span>Внесение оплаты</span>
              <button
                type="button"
                onClick={() => setShowPaymentForm(false)}
                className="text-zinc-400 hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-zinc-300 font-medium text-[11px]">Дата оплаты:</label>
                <input
                  type="date"
                  required
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-zinc-100 font-bold focus:outline-none focus:border-teal-500 text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-zinc-300 font-medium text-[11px]">Сумма (UZS):</label>
                <input
                  type="number"
                  step="10000"
                  value={customAmount > 0 ? customAmount : currentPrice * lessonsToAdd || ''}
                  onChange={(e) => setCustomAmount(e.target.value === '' ? 0 : Number(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-2.5 py-1.5 text-teal-300 font-bold text-xs focus:outline-none focus:border-teal-500"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-500 text-white font-extrabold py-2.5 rounded-xl shadow-lg active:scale-95 transition-all text-xs"
            >
              ✓ Сохранить оплату ({formatUZS(calculatedPayment)})
            </button>
          </form>
        )}

        {/* ══════════════════════════════════════════════════════════════ */}
        {/* КНОПКА ОТЧЕТА ДЛЯ РОДИТЕЛЕЙ & ДОПОЛНИТЕЛЬНЫЕ ДЕЙСТВИЯ */}
        {/* ══════════════════════════════════════════════════════════════ */}
        <div className="space-y-2 pt-1">
          {/* Button: Скопировать отчет */}
          <button
            onClick={handleCopyReport}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-gradient-to-r from-indigo-900/70 to-teal-900/70 hover:from-indigo-900/90 hover:to-teal-900/90 active:scale-[0.98] border border-indigo-500/40 text-indigo-100 font-black text-xs transition-all shadow-md shadow-indigo-950/40"
          >
            <div className="flex items-center gap-2.5">
              {copiedReport ? (
                <Check className="w-4 h-4 text-teal-400" />
              ) : (
                <FileText className="w-4 h-4 text-indigo-300" />
              )}
              <span>
                {copiedReport ? 'Отчет скопирован в буфер!' : '📋 Скопировать отчет для родителей'}
              </span>
            </div>
            <span className="text-[11px] text-indigo-300 font-semibold">
              {copiedReport ? '✓ Готово' : 'Скопировать'}
            </span>
          </button>

          {/* Button: История оплат и посещений */}
          <button
            onClick={handleToggleHistory}
            className="w-full flex items-center justify-between p-2.5 rounded-2xl bg-zinc-800/80 hover:bg-zinc-800 active:bg-zinc-700 border border-zinc-700/60 text-zinc-300 font-bold transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs">📜</span>
              <span>История всех платежей и посещений</span>
            </div>
            <span className="text-[10px] text-teal-400 font-semibold">
              {showHistory ? 'Скрыть ▲' : 'Показать ▼'}
            </span>
          </button>

          {/* Collapsible History Section */}
          {showHistory && (
            <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-800/80 space-y-2 animate-in fade-in duration-150">
              <div className="text-[10px] uppercase font-bold text-zinc-400 pb-1 border-b border-zinc-800">
                Хронология событий:
              </div>

              {loadingHistory ? (
                <div className="py-4 text-center text-zinc-400 text-[11px]">Загрузка истории...</div>
              ) : historyRecords.length === 0 ? (
                <div className="py-3 text-center text-zinc-400 text-[11px]">История пока пуста</div>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {historyRecords.map((item) => (
                    <div
                      key={item.id}
                      className="p-2 rounded-xl bg-zinc-900 border border-zinc-800/60 flex items-center justify-between text-[11px]"
                    >
                      <div className="min-w-0 pr-2">
                        <div className="font-bold text-zinc-200 truncate">{item.title}</div>
                        {item.subtitle && (
                          <div className="text-[10px] text-zinc-400 truncate">{item.subtitle}</div>
                        )}
                        <div className="text-[9px] text-zinc-400 mt-0.5 font-mono">{item.date.substring(0, 10)}</div>
                      </div>
                      <span
                        className={`shrink-0 px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                          item.type === 'payment'
                            ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                            : item.status === 'completed'
                            ? 'bg-teal-500/20 text-teal-300 border-teal-500/30'
                            : item.status === 'missed_penalty'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* DELETE OPTION */}
        <div className="pt-2 border-t border-zinc-800/60 flex justify-center">
          <button
            onClick={handleDelete}
            className="flex items-center gap-1.5 text-[11px] text-rose-400/80 hover:text-rose-400 py-1 px-3 rounded-lg active:bg-rose-500/10 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Удалить ученика</span>
          </button>
        </div>
      </div>
    </div>
  );
};
