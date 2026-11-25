'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Lesson, Student, Payment } from '@/types';
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getTashkentTodayStr } from '@/lib/formatters';
import { getLessonsByRange, getPaymentsByRange } from '@/lib/storage';
import {
  Check,
  Flame,
  Ban,
  Clock,
  Copy,
  Download,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { useToast } from '@/components/ui/ToastProvider';

interface StatsTabProps {
  lessons: Lesson[];
  students: Student[];
  paymentsVersion?: number;
  onOpenStudent?: (student: Student) => void;
  summary?: unknown; // legacy compatibility
}

function getPaymentsPlural(n: number): string {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return 'платежей';
  if (rem > 1 && rem < 5) return 'платежа';
  if (rem === 1) return 'платёж';
  return 'платежей';
}

export const StatsTab: React.FC<StatsTabProps> = ({
  lessons,
  students,
  paymentsVersion = 0,
  onOpenStudent,
}) => {
  const { showToast } = useToast();
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [monthOffset, setMonthOffset] = useState<number>(0);
  const [archiveLessons, setArchiveLessons] = useState<Lesson[] | null>(null);
  const [periodPayments, setPeriodPayments] = useState<Payment[]>([]);
  const [loadedRangeKey, setLoadedRangeKey] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const todayStr = getTashkentTodayStr();

  const { startStr, endStr, periodTitle, monthLabel, isArchiveMonth } = useMemo(() => {
    const now = parseISO(`${todayStr}T12:00:00+05:00`);
    if (period === 'week') {
      const start = startOfWeek(now, { weekStartsOn: 1 });
      const end = endOfWeek(now, { weekStartsOn: 1 });
      return {
        startStr: format(start, 'yyyy-MM-dd'),
        endStr: format(end, 'yyyy-MM-dd'),
        periodTitle: `Неделя (${format(start, 'd MMM', { locale: ru })} – ${format(end, 'd MMM', { locale: ru })})`,
        monthLabel: '',
        isArchiveMonth: false,
      };
    }

    const baseMonth = monthOffset === 0 ? startOfMonth(now) : addMonths(startOfMonth(now), monthOffset);
    const start = startOfMonth(baseMonth);
    const end = endOfMonth(baseMonth);
    const rawMonth = format(baseMonth, 'LLLL yyyy', { locale: ru });
    const capitalizedMonth = rawMonth.charAt(0).toUpperCase() + rawMonth.slice(1);

    return {
      startStr: format(start, 'yyyy-MM-dd'),
      endStr: format(end, 'yyyy-MM-dd'),
      periodTitle: capitalizedMonth,
      monthLabel: capitalizedMonth,
      isArchiveMonth: monthOffset < 0,
    };
  }, [period, monthOffset, todayStr]);

  const rangeKey = `${startStr}_${endStr}_${isArchiveMonth}_${paymentsVersion}`;
  const isLoadingRange = loadedRangeKey !== rangeKey;

  // Fetch payments (always) and lessons (when viewing archive months outside default window)
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        if (isArchiveMonth) {
          const [fetchedLessons, fetchedPayments] = await Promise.all([
            getLessonsByRange(startStr, endStr),
            getPaymentsByRange(startStr, endStr),
          ]);
          if (!cancelled) {
            setArchiveLessons(fetchedLessons);
            setPeriodPayments(fetchedPayments);
          }
        } else {
          const fetchedPayments = await getPaymentsByRange(startStr, endStr);
          if (!cancelled) {
            setArchiveLessons(null);
            setPeriodPayments(fetchedPayments);
          }
        }
      } catch (err) {
        console.error('[StatsTab] Failed to load range analytics:', err);
      } finally {
        if (!cancelled) {
          setLoadedRangeKey(rangeKey);
        }
      }
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [startStr, endStr, isArchiveMonth, paymentsVersion, rangeKey]);

  const {
    conductedCount,
    burnedCount,
    excusedCount,
    plannedCount,
    targetCount,
    completionRate,
    earnedUzs,
    cashFlowUzs,
    paymentsCount,
    paymentsLessonsTotal,
    expectedMonthUzs,
    totalDebtUzs,
    lowBalanceStudents,
    studentBreakdown,
    chartBars,
    chartMaxVal,
  } = useMemo(() => {
    const effectiveLessons = isArchiveMonth ? (archiveLessons ?? []) : lessons;
    const activeStudents = students.filter((s) => s.is_active !== false);
    const studentMap = new Map<string, Student>();
    students.forEach((s) => studentMap.set(s.id, s));

    const periodLessons = effectiveLessons.filter((l) => {
      const d = l.date.substring(0, 10);
      return d >= startStr && d <= endStr;
    });

    let conducted = 0;
    let burned = 0;
    let excused = 0;
    let planned = 0;
    let earned = 0;

    const perStudentMap = new Map<
      string,
      {
        student: Student;
        conducted: number;
        burned: number;
        excused: number;
        earnedUzs: number;
        paidUzs: number;
        paidCount: number;
      }
    >();

    const ensureEntry = (st: Student) => {
      if (!perStudentMap.has(st.id)) {
        perStudentMap.set(st.id, {
          student: st,
          conducted: 0,
          burned: 0,
          excused: 0,
          earnedUzs: 0,
          paidUzs: 0,
          paidCount: 0,
        });
      }
      return perStudentMap.get(st.id)!;
    };

    for (const s of activeStudents) {
      ensureEntry(s);
    }

    const buckets: Array<{ label: string; accrued: number; cash: number }> =
      period === 'month'
        ? [
            { label: '1 нед', accrued: 0, cash: 0 },
            { label: '2 нед', accrued: 0, cash: 0 },
            { label: '3 нед', accrued: 0, cash: 0 },
            { label: '4 нед', accrued: 0, cash: 0 },
          ]
        : ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((label) => ({
            label,
            accrued: 0,
            cash: 0,
          }));

    const getBucketIndex = (isoDate: string): number => {
      const dStr = isoDate.substring(0, 10);
      if (period === 'month') {
        const dayNum = Number(dStr.substring(8, 10));
        if (isNaN(dayNum) || dayNum <= 7) return 0;
        if (dayNum <= 14) return 1;
        if (dayNum <= 21) return 2;
        return 3;
      }
      const dow = parseISO(`${dStr}T12:00:00+05:00`).getDay();
      return dow === 0 ? 6 : dow - 1;
    };

    for (const l of periodLessons) {
      const st = studentMap.get(l.student_id);
      const rate = st?.lesson_rate || 300000;
      const entry = st ? ensureEntry(st) : undefined;

      if (l.status === 'completed') {
        conducted++;
        earned += rate;
        buckets[getBucketIndex(l.date)].accrued += rate;
        if (entry) {
          entry.conducted++;
          entry.earnedUzs += rate;
        }
      } else if (l.status === 'missed_penalty' || (l.status === 'missed' && !l.needs_makeup)) {
        burned++;
        earned += rate;
        buckets[getBucketIndex(l.date)].accrued += rate;
        if (entry) {
          entry.burned++;
          entry.earnedUzs += rate;
        }
      } else if (l.status === 'missed_excused' || (l.status === 'missed' && l.needs_makeup)) {
        excused++;
        if (entry) {
          entry.excused++;
        }
      } else {
        planned++;
      }
    }

    let cashTotal = 0;
    let paidLessonsSum = 0;
    for (const p of periodPayments) {
      cashTotal += p.amount_uzs || 0;
      paidLessonsSum += p.lessons_added || 0;
      if (p.paid_at) {
        const idx = getBucketIndex(p.paid_at);
        if (buckets[idx]) buckets[idx].cash += p.amount_uzs || 0;
      }
      const st = studentMap.get(p.student_id);
      if (st) {
        const entry = ensureEntry(st);
        entry.paidUzs += p.amount_uzs || 0;
        entry.paidCount += 1;
      }
    }

    const maxBar = buckets.reduce(
      (mx, b) => Math.max(mx, b.accrued, b.cash),
      0
    );

    const totalTarget =
      period === 'month'
        ? activeStudents.reduce((acc, s) => acc + (s.monthly_target_lessons || 12), 0)
        : Math.round(activeStudents.reduce((acc, s) => acc + (s.monthly_target_lessons || 12), 0) / 4);

    const ratePct = totalTarget > 0 ? Math.min(100, Math.round((conducted / totalTarget) * 100)) : 0;

    const expectedMonth = activeStudents.reduce(
      (acc, s) => acc + (s.monthly_target_lessons || 12) * (s.lesson_rate || 300000),
      0
    );

    const debtSum = activeStudents.reduce((acc, s) => {
      const bal = s.lessons_balance ?? 0;
      if (bal < 0) return acc + Math.abs(bal) * (s.lesson_rate || 300000);
      return acc;
    }, 0);

    const lowBal = activeStudents
      .filter((s) => (s.lessons_balance ?? 0) <= 2)
      .sort((a, b) => (a.lessons_balance ?? 0) - (b.lessons_balance ?? 0));

    const breakdown = Array.from(perStudentMap.values())
      .filter(
        (item) =>
          item.conducted + item.burned + item.excused > 0 ||
          item.paidUzs > 0 ||
          (!isArchiveMonth && item.student.is_active !== false)
      )
      .sort(
        (a, b) =>
          b.earnedUzs - a.earnedUzs ||
          b.paidUzs - a.paidUzs ||
          a.student.name.localeCompare(b.student.name, 'ru')
      );

    return {
      conductedCount: conducted,
      burnedCount: burned,
      excusedCount: excused,
      plannedCount: planned,
      targetCount: totalTarget,
      completionRate: ratePct,
      earnedUzs: earned,
      cashFlowUzs: cashTotal,
      paymentsCount: periodPayments.length,
      paymentsLessonsTotal: paidLessonsSum,
      expectedMonthUzs: expectedMonth,
      totalDebtUzs: debtSum,
      lowBalanceStudents: lowBal,
      studentBreakdown: breakdown,
      chartBars: buckets,
      chartMaxVal: maxBar,
    };
  }, [archiveLessons, lessons, periodPayments, students, period, startStr, endStr, isArchiveMonth]);

  const handleCopySummary = () => {
    hapticImpact('light');
    let text = `📊 Сводка — ${periodTitle}\n\n`;
    text += `💵 Получено (касса): ${cashFlowUzs.toLocaleString('ru-RU')} сум (${paymentsCount} ${getPaymentsPlural(paymentsCount)})\n`;
    text += `📚 Начислено по урокам: ${earnedUzs.toLocaleString('ru-RU')} сум (${conductedCount + burnedCount} опл. ур.)\n`;
    text += `🎯 План дохода на месяц: ${expectedMonthUzs.toLocaleString('ru-RU')} сум\n`;
    if (totalDebtUzs > 0) {
      text += `⚠️ Задолженность учеников: ${totalDebtUzs.toLocaleString('ru-RU')} сум\n`;
    }
    text += `\n✅ Проведено: ${conductedCount} ур. (план ${targetCount}, ${completionRate}%)\n`;
    text += `🔥 Сгорело (оплачено): ${burnedCount} ур.\n`;
    text += `🛑 Отменено (сохранено): ${excusedCount} ур.\n`;
    text += `⏳ В плане: ${plannedCount} ур.\n`;

    if (lowBalanceStudents.length > 0) {
      text += `\n🔔 Требуют оплаты (низкий баланс):\n`;
      lowBalanceStudents.forEach((s) => {
        text += `• ${s.name}: ${s.lessons_balance ?? 0} ур.\n`;
      });
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      hapticNotification('success');
      showToast({ message: 'Сводка скопирована в буфер', tone: 'success' });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadCsv = () => {
    hapticImpact('light');
    const rows = [
      'Ученик,Ставка (UZS),Проведено,Сгорело,Отменено,Начислено (UZS),Оплачено в кассу (UZS),Баланс (ур.),Долг (UZS)',
    ];
    for (const item of studentBreakdown) {
      const rate = item.student.lesson_rate || 300000;
      const bal = item.student.lessons_balance ?? 0;
      const debt = bal < 0 ? Math.abs(bal) * rate : 0;
      rows.push(
        `"${item.student.name.replace(/"/g, '""')}",${rate},${item.conducted},${item.burned},${item.excused},${item.earnedUzs},${item.paidUzs},${bal},${debt}`
      );
    }
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fileName = `tutor-crm-${period}-${startStr}_${endStr}.csv`;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    hapticNotification('success');
    showToast({ message: `Отчёт ${fileName} скачан`, tone: 'success' });
  };

  const ringRadius = 26;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - completionRate / 100);

  return (
    <div className="flex flex-col h-full bg-[#F7F5F0] pb-28 px-3.5 pt-safe overflow-y-auto space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-[#1C1917] tracking-tight leading-tight">
            Доход
          </h1>
          <p className="text-xs text-[#78716C] font-medium mt-0.5 truncate">{periodTitle}</p>
        </div>

        {/* Period Switcher */}
        <div className="bg-[#EBE7DF] p-0.5 rounded-full flex shrink-0">
          <button
            type="button"
            onClick={() => {
              hapticImpact('light');
              setPeriod('week');
            }}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              period === 'week' ? 'bg-white text-[#1C1917] shadow-xs' : 'text-[#78716C]'
            }`}
          >
            Неделя
          </button>
          <button
            type="button"
            onClick={() => {
              hapticImpact('light');
              setPeriod('month');
            }}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              period === 'month' ? 'bg-white text-[#1C1917] shadow-xs' : 'text-[#78716C]'
            }`}
          >
            Месяц
          </button>
        </div>
      </div>

      {/* Month Archive Switcher (Visible in Month mode) */}
      {period === 'month' && (
        <div className="bento-card rounded-2xl p-1.5 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              hapticImpact('light');
              setMonthOffset((prev) => prev - 1);
            }}
            aria-label="Предыдущий месяц"
            className="w-8 h-8 rounded-xl bg-[#F2EFE9] hover:bg-[#EAE5DC] text-[#44403C] flex items-center justify-center active:scale-95 transition-colors shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center justify-center gap-2 min-w-0">
            <span className="text-sm font-bold text-[#1C1917] tabular-nums truncate">
              {monthLabel}
            </span>
            {isLoadingRange && <Loader2 className="w-3.5 h-3.5 text-[#2F6FED] animate-spin shrink-0" />}
            {monthOffset < 0 && !isLoadingRange && (
              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  setMonthOffset(0);
                }}
                className="px-2 py-0.5 rounded-full bg-[#EEF3FE] hover:bg-[#E2EBFC] text-[#2F6FED] text-[11px] font-semibold inline-flex items-center gap-1 active:scale-95 transition-colors shrink-0"
                title="Вернуться к текущему месяцу"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Сейчас</span>
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={monthOffset >= 0}
            onClick={() => {
              hapticImpact('light');
              setMonthOffset((prev) => Math.min(0, prev + 1));
            }}
            aria-label="Следующий месяц"
            className="w-8 h-8 rounded-xl bg-[#F2EFE9] hover:bg-[#EAE5DC] disabled:opacity-35 disabled:hover:bg-[#F2EFE9] text-[#44403C] flex items-center justify-center active:scale-95 transition-colors shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Hero Revenue Bento Card with Bar Chart */}
      <div className="bento-card rounded-3xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-baseline gap-x-1.5">
              <span className="text-2xl font-bold text-[#1C1917] tabular-nums tracking-tight leading-none">
                {cashFlowUzs.toLocaleString('ru-RU')}
              </span>
              <span className="text-sm font-semibold text-[#78716C]">сум</span>
            </div>
            <p className="text-xs font-medium text-[#78716C] mt-1 tabular-nums">
              Получено в кассу · {paymentsCount} {getPaymentsPlural(paymentsCount)}
              {paymentsLessonsTotal > 0 ? ` (+${paymentsLessonsTotal} ур.)` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2 text-[10px] font-semibold text-[#78716C] shrink-0 pt-0.5">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#2F6FED]" />
              Уроки
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#D8C7AE]" />
              Касса
            </span>
          </div>
        </div>

        {/* Pure CSS Bar Chart */}
        <div className="h-20 flex items-end justify-between gap-2 pt-1">
          {chartBars.map((bar) => {
            const accruedPct =
              chartMaxVal > 0 && bar.accrued > 0
                ? Math.max(10, Math.round((bar.accrued / chartMaxVal) * 100))
                : 6;
            const cashPct =
              chartMaxVal > 0 && bar.cash > 0
                ? Math.max(10, Math.round((bar.cash / chartMaxVal) * 100))
                : 6;

            return (
              <div key={bar.label} className="flex-1 h-full flex flex-col items-center justify-end gap-1">
                <div className="w-full flex-1 flex items-end justify-center gap-1">
                  <div
                    className={`w-2.5 sm:w-3 rounded-t-md transition-all duration-300 ${
                      bar.accrued > 0 ? 'bg-[#2F6FED]' : 'bg-[#EFECE5]'
                    }`}
                    style={{ height: `${accruedPct}%` }}
                    title={`Начислено: ${bar.accrued.toLocaleString('ru-RU')} сум`}
                  />
                  <div
                    className={`w-2.5 sm:w-3 rounded-t-md transition-all duration-300 ${
                      bar.cash > 0 ? 'bg-[#D8C7AE]' : 'bg-[#F2EFE9]'
                    }`}
                    style={{ height: `${cashPct}%` }}
                    title={`Касса: ${bar.cash.toLocaleString('ru-RU')} сум`}
                  />
                </div>
                <span className="text-[10px] font-medium text-[#78716C] tabular-nums leading-none">
                  {bar.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Signature 2-Column Bento Row: Completion Ring + 3 Pastel Status Pills */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bento-card rounded-3xl p-3.5 flex flex-col items-center justify-center text-center space-y-2">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
              <circle
                cx="32"
                cy="32"
                r={ringRadius}
                fill="none"
                stroke="#EFECE5"
                strokeWidth="6"
              />
              <circle
                cx="32"
                cy="32"
                r={ringRadius}
                fill="none"
                stroke="#2F6FED"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                className="transition-all duration-500"
              />
            </svg>
            <span className="absolute text-sm font-bold text-[#1C1917] tabular-nums">
              {completionRate}%
            </span>
          </div>
          <div className="text-[11px] text-[#78716C] font-semibold tabular-nums leading-tight">
            Проведено <b className="text-[#1C1917]">{conductedCount}/{targetCount}</b>
          </div>
        </div>

        <div className="bento-card rounded-3xl p-3 flex flex-col justify-center gap-1.5">
          <div className="flex items-center justify-between bg-[#FDECE8] px-2.5 py-1.5 rounded-xl">
            <span className="text-[11px] font-semibold text-[#B93815] flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-[#E85D3F]" aria-hidden="true" /> Сгорело
            </span>
            <span className="text-xs font-bold text-[#B93815] tabular-nums">{burnedCount}</span>
          </div>
          <div className="flex items-center justify-between bg-[#F6EBD8] px-2.5 py-1.5 rounded-xl">
            <span className="text-[11px] font-semibold text-[#92400E] flex items-center gap-1.5">
              <Ban className="w-3.5 h-3.5 text-amber-700" aria-hidden="true" /> Отменено
            </span>
            <span className="text-xs font-bold text-[#92400E] tabular-nums">{excusedCount}</span>
          </div>
          <div className="flex items-center justify-between bg-[#EEF3FE] px-2.5 py-1.5 rounded-xl">
            <span className="text-[11px] font-semibold text-[#1D4ED8] flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-[#2F6FED]" aria-hidden="true" /> В плане
            </span>
            <span className="text-xs font-bold text-[#1D4ED8] tabular-nums">{plannedCount}</span>
          </div>
        </div>
      </div>

      {/* Compact 2-Column Financial Bento Strip */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bento-card rounded-2xl p-3 space-y-1">
          <span className="text-[10px] font-semibold text-[#78716C] uppercase block">
            Начислено по урокам
          </span>
          <div className="flex flex-wrap items-baseline gap-x-1">
            <span className="text-sm font-bold text-[#1C1917] tabular-nums">
              {earnedUzs.toLocaleString('ru-RU')}
            </span>
            <span className="text-[11px] font-medium text-[#78716C]">сум</span>
          </div>
          <span className="text-[10.5px] font-semibold text-[#2F6FED] tabular-nums block">
            {conductedCount + burnedCount} опл. ур.
          </span>
        </div>

        <div className="bento-card rounded-2xl p-3 space-y-1">
          <span className="text-[10px] font-semibold text-[#78716C] uppercase block">
            План и долг
          </span>
          <div className="flex flex-wrap items-baseline gap-x-1">
            <span className="text-sm font-bold text-[#1C1917] tabular-nums">
              {expectedMonthUzs.toLocaleString('ru-RU')}
            </span>
            <span className="text-[11px] font-medium text-[#78716C]">сум</span>
          </div>
          <span
            className={`text-[10.5px] font-semibold tabular-nums block ${
              totalDebtUzs > 0 ? 'text-[#B93815]' : 'text-[#78716C]'
            }`}
          >
            Долг: {totalDebtUzs.toLocaleString('ru-RU')} сум
          </span>
        </div>
      </div>

      {/* Action Buttons: Copy Summary & Download CSV */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleCopySummary}
          className="bento-card py-2.5 px-3 rounded-2xl text-[#1C1917] text-xs font-semibold flex items-center justify-center gap-1.5 active:scale-98 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-emerald-700">Скопировано!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5 text-[#78716C]" />
              <span>Скопировать сводку</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleDownloadCsv}
          className="py-2.5 px-3 rounded-2xl bg-[#2F6FED] hover:bg-[#255CE0] text-white text-xs font-semibold shadow-sm flex items-center justify-center gap-1.5 active:scale-98 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Скачать CSV</span>
        </button>
      </div>

      {/* Low Balance / Payment Alerts */}
      {lowBalanceStudents.length > 0 && (
        <div className="bento-card rounded-3xl p-3.5 border-[#F3DCAC] space-y-2">
          <h3 className="text-[11px] font-semibold text-amber-900 uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            <span>Требуют оплаты ({lowBalanceStudents.length})</span>
          </h3>

          <div className="space-y-1.5">
            {lowBalanceStudents.map((s) => {
              const bal = s.lessons_balance ?? 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    onOpenStudent?.(s);
                  }}
                  className="w-full p-2.5 rounded-2xl bg-[#FEF9EE] hover:bg-[#FDF2D8] border border-[#F3DCAC]/80 flex items-center justify-between text-left transition-colors active:scale-[0.99]"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#1C1917] truncate">{s.name}</div>
                    <div className="text-[10.5px] text-[#78716C] font-medium tabular-nums">
                      {s.billing_type === 'package' ? 'Пакет' : `Оплата: ${s.billing_day || '10'}`} · {(s.lesson_rate || 300000).toLocaleString('ru-RU')} сум
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full tabular-nums ${
                        bal <= 0 ? 'bg-[#FDECE8] text-[#B93815]' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {bal} ур.
                    </span>
                    {onOpenStudent && <ChevronRight className="w-4 h-4 text-[#8C857B]" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Breakdown by Student ("Топ ученики / Детализация") */}
      <div className="bento-card rounded-3xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wide tabular-nums">
            Детализация по ученикам ({studentBreakdown.length})
          </h3>
          {isLoadingRange && <Loader2 className="w-3.5 h-3.5 text-[#8C857B] animate-spin" />}
        </div>

        {studentBreakdown.length === 0 ? (
          <p className="text-xs text-[#8C857B] py-3 text-center font-medium">
            Нет данных за выбранный период
          </p>
        ) : (
          <div className="space-y-1.5">
            {studentBreakdown.map((item) => {
              const avatarColor = item.student.color || '#2F6FED';
              return (
                <div
                  key={item.student.id}
                  onClick={() => {
                    if (onOpenStudent) {
                      hapticImpact('light');
                      onOpenStudent(item.student);
                    }
                  }}
                  className="p-2.5 rounded-2xl bg-[#F7F5F0] hover:bg-[#EFEBE2] flex items-center justify-between gap-2.5 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                      style={{
                        backgroundColor: `${avatarColor}1F`,
                        color: avatarColor,
                      }}
                      aria-hidden="true"
                    >
                      {item.student.name.trim().charAt(0).toUpperCase() || 'У'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#1C1917] truncate">
                        {item.student.name}
                      </div>
                      <div className="text-[10.5px] text-[#78716C] font-medium flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 tabular-nums">
                        <span className="text-emerald-700 font-semibold inline-flex items-center gap-0.5">
                          <Check className="w-3 h-3 stroke-[2.5]" aria-hidden="true" />
                          {item.conducted}
                        </span>
                        {item.burned > 0 && (
                          <span className="text-[#B93815] font-semibold inline-flex items-center gap-0.5">
                            <Flame className="w-3 h-3" aria-hidden="true" />
                            {item.burned}
                          </span>
                        )}
                        {item.excused > 0 && (
                          <span className="text-rose-700 font-semibold inline-flex items-center gap-0.5">
                            <Ban className="w-3 h-3" aria-hidden="true" />
                            {item.excused}
                          </span>
                        )}
                        {item.paidUzs > 0 && (
                          <span className="text-emerald-800 bg-[#E7F7F0] px-1.5 rounded-full font-semibold">
                            +{item.paidUzs.toLocaleString('ru-RU')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-[#1C1917] tabular-nums">
                      {item.earnedUzs.toLocaleString('ru-RU')} сум
                    </div>
                    <div className="text-[10px] text-[#78716C] font-medium tabular-nums">
                      Баланс: {item.student.lessons_balance ?? 0} ур.
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
