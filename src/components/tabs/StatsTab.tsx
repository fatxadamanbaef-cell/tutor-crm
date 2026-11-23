'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Lesson, Student, Payment } from '@/types';
import { format, parseISO, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getTashkentTodayStr } from '@/lib/formatters';
import { getLessonsByRange, getPaymentsByRange } from '@/lib/storage';
import {
  CheckCircle2,
  Flame,
  Ban,
  Clock,
  Copy,
  Check,
  Download,
  Wallet,
  Banknote,
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

    for (const l of periodLessons) {
      const st = studentMap.get(l.student_id);
      const rate = st?.lesson_rate || 300000;
      const entry = st ? ensureEntry(st) : undefined;

      if (l.status === 'completed') {
        conducted++;
        earned += rate;
        if (entry) {
          entry.conducted++;
          entry.earnedUzs += rate;
        }
      } else if (l.status === 'missed_penalty' || (l.status === 'missed' && !l.needs_makeup)) {
        burned++;
        earned += rate;
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
      const st = studentMap.get(p.student_id);
      if (st) {
        const entry = ensureEntry(st);
        entry.paidUzs += p.amount_uzs || 0;
        entry.paidCount += 1;
      }
    }

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

  return (
    <div className="flex flex-col h-full bg-[#f4f5f8] pb-28 px-4 pt-safe overflow-y-auto space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">
            Аналитика и доход
          </h1>
          <p className="text-xs text-slate-500 font-semibold mt-0.5 truncate">{periodTitle}</p>
        </div>

        {/* Period Switcher */}
        <div className="bg-slate-200/80 p-0.5 rounded-xl flex shrink-0">
          <button
            type="button"
            onClick={() => {
              hapticImpact('light');
              setPeriod('week');
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              period === 'week' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
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
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              period === 'month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
            }`}
          >
            Месяц
          </button>
        </div>
      </div>

      {/* Month Archive Switcher (Visible in Month mode) */}
      {period === 'month' && (
        <div className="bg-white rounded-2xl p-1.5 shadow-xs border border-gray-200/80 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              hapticImpact('light');
              setMonthOffset((prev) => prev - 1);
            }}
            aria-label="Предыдущий месяц"
            className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 flex items-center justify-center active:scale-95 transition-all shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="flex items-center justify-center gap-2 min-w-0">
            <span className="text-sm font-bold text-gray-900 tabular-nums truncate">
              {monthLabel}
            </span>
            {isLoadingRange && <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin shrink-0" />}
            {monthOffset < 0 && !isLoadingRange && (
              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  setMonthOffset(0);
                }}
                className="px-2 py-0.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-semibold inline-flex items-center gap-1 active:scale-95 transition-all shrink-0"
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
            className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 disabled:opacity-35 disabled:hover:bg-gray-50 text-gray-700 flex items-center justify-center active:scale-95 transition-all shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Dual Financial Metrics: Cash Flow vs Accrued by Lessons */}
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          {/* Card 1: Received Cash Flow */}
          <div className="bg-white rounded-3xl p-3.5 shadow-xs border border-emerald-200/80 space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold text-emerald-700 uppercase leading-tight">
                Получено (касса)
              </span>
              <div className="w-7 h-7 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <Banknote className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-1">
              <span className="text-[17px] font-bold text-gray-900 tabular-nums leading-tight">
                {cashFlowUzs.toLocaleString('ru-RU')}
              </span>
              <span className="text-[11px] font-semibold text-gray-500">сум</span>
            </div>

            <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50/80 border border-emerald-200/70 px-2 py-0.5 rounded-lg inline-flex items-center gap-1 self-start tabular-nums">
              <span>
                {paymentsCount} {getPaymentsPlural(paymentsCount)}
              </span>
              {paymentsLessonsTotal > 0 && (
                <span className="text-emerald-600/80">· +{paymentsLessonsTotal} ур.</span>
              )}
            </div>
          </div>

          {/* Card 2: Accrued by Lessons */}
          <div className="bg-white rounded-3xl p-3.5 shadow-xs border border-gray-200/80 space-y-2 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-1">
              <span className="text-[10px] font-semibold text-gray-500 uppercase leading-tight">
                Начислено по урокам
              </span>
              <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <Wallet className="w-3.5 h-3.5" />
              </div>
            </div>

            <div className="flex flex-wrap items-baseline gap-x-1">
              <span className="text-[17px] font-bold text-gray-900 tabular-nums leading-tight">
                {earnedUzs.toLocaleString('ru-RU')}
              </span>
              <span className="text-[11px] font-semibold text-gray-500">сум</span>
            </div>

            <div className="text-[11px] font-semibold text-blue-700 bg-blue-50/80 border border-blue-200/70 px-2 py-0.5 rounded-lg inline-flex items-center self-start tabular-nums">
              {conductedCount + burnedCount} опл. ур.
            </div>
          </div>
        </div>

        {/* Monthly Plan & Balance Debt */}
        <div className="bg-white rounded-3xl p-3 shadow-xs border border-gray-100 grid grid-cols-2 gap-2">
          <div className="bg-blue-50/70 rounded-2xl p-2.5 border border-blue-100">
            <span className="text-[10px] font-semibold text-blue-700 uppercase block">План на месяц</span>
            <span className="text-xs font-bold text-blue-900 mt-0.5 block tabular-nums">
              {expectedMonthUzs.toLocaleString('ru-RU')} сум
            </span>
          </div>
          <div
            className={`rounded-2xl p-2.5 border ${
              totalDebtUzs > 0
                ? 'bg-rose-50/80 border-rose-200'
                : 'bg-gray-50 border-gray-200/80'
            }`}
          >
            <span
              className={`text-[10px] font-semibold uppercase block ${
                totalDebtUzs > 0 ? 'text-rose-700' : 'text-gray-500'
              }`}
            >
              Долг по балансу
            </span>
            <span
              className={`text-xs font-bold mt-0.5 block tabular-nums ${
                totalDebtUzs > 0 ? 'text-rose-800' : 'text-gray-700'
              }`}
            >
              {totalDebtUzs.toLocaleString('ru-RU')} сум
            </span>
          </div>
        </div>
      </div>

      {/* 3-State Attendance + Planned Grid */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-white rounded-3xl p-3.5 shadow-xs border border-gray-100 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-emerald-700 uppercase">Проведено</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-gray-900 tabular-nums">{conductedCount}</div>
          <div className="text-[10px] text-gray-500 font-semibold tabular-nums">
            План: {targetCount} ({completionRate}%)
          </div>
          <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-3xl p-3.5 shadow-xs border border-gray-100 grid grid-rows-3 gap-1.5">
          <div className="flex items-center justify-between bg-orange-50/70 px-2.5 py-1 rounded-xl">
            <span className="text-[11px] font-semibold text-orange-800 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-orange-600" /> Сгорело
            </span>
            <span className="text-xs font-bold text-orange-900 tabular-nums">{burnedCount}</span>
          </div>
          <div className="flex items-center justify-between bg-rose-50/70 px-2.5 py-1 rounded-xl">
            <span className="text-[11px] font-semibold text-rose-800 flex items-center gap-1">
              <Ban className="w-3.5 h-3.5 text-rose-600" /> Отменено
            </span>
            <span className="text-xs font-bold text-rose-900 tabular-nums">{excusedCount}</span>
          </div>
          <div className="flex items-center justify-between bg-blue-50/70 px-2.5 py-1 rounded-xl">
            <span className="text-[11px] font-semibold text-blue-800 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-600" /> В плане
            </span>
            <span className="text-xs font-bold text-blue-900 tabular-nums">{plannedCount}</span>
          </div>
        </div>
      </div>

      {/* Action Buttons: Copy Summary & Download CSV */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={handleCopySummary}
          className="py-3 px-3 rounded-2xl bg-white border border-gray-200 text-gray-800 text-xs font-bold shadow-xs flex items-center justify-center gap-1.5 active:scale-98 transition-all"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-emerald-600" />
              <span className="text-emerald-600">Скопировано!</span>
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 text-gray-500" />
              <span>Скопировать сводку</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleDownloadCsv}
          className="py-3 px-3 rounded-2xl bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 active:scale-98 transition-all"
        >
          <Download className="w-4 h-4" />
          <span>Скачать CSV (Excel)</span>
        </button>
      </div>

      {/* Low Balance / Payment Alerts */}
      {lowBalanceStudents.length > 0 && (
        <div className="bg-white rounded-3xl p-4 shadow-xs border border-amber-200/80 space-y-2.5">
          <h3 className="text-xs font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>Требуют оплаты / Низкий баланс ({lowBalanceStudents.length})</span>
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
                  className="w-full p-2.5 rounded-2xl bg-amber-50/60 hover:bg-amber-100/70 border border-amber-200/60 flex items-center justify-between text-left transition-all active:scale-[0.99]"
                >
                  <div>
                    <div className="text-xs font-semibold text-gray-900">{s.name}</div>
                    <div className="text-[10px] text-gray-500 font-medium tabular-nums">
                      {s.billing_type === 'package' ? 'Пакет' : `Оплата: ${s.billing_day || '10'}`} · Ставка {(s.lesson_rate || 300000).toLocaleString('ru-RU')} сум
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-lg tabular-nums ${
                        bal <= 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {bal} ур.
                    </span>
                    {onOpenStudent && <ChevronRight className="w-4 h-4 text-gray-400" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Breakdown by Student */}
      <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-100 space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide tabular-nums">
            Детализация по ученикам ({studentBreakdown.length})
          </h3>
          {isLoadingRange && <Loader2 className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
        </div>

        {studentBreakdown.length === 0 ? (
          <p className="text-xs text-gray-400 py-3 text-center font-medium">
            Нет данных за выбранный период
          </p>
        ) : (
          <div className="space-y-2">
            {studentBreakdown.map((item) => (
              <div
                key={item.student.id}
                onClick={() => {
                  if (onOpenStudent) {
                    hapticImpact('light');
                    onOpenStudent(item.student);
                  }
                }}
                className="p-2.5 rounded-2xl bg-gray-50 flex items-center justify-between gap-2 cursor-pointer hover:bg-gray-100/80 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-gray-900 truncate">{item.student.name}</div>
                  <div className="text-[10px] text-gray-500 font-medium flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 tabular-nums">
                    <span className="text-emerald-700 font-semibold">✅ {item.conducted}</span>
                    {item.burned > 0 && <span className="text-orange-700 font-semibold">🔥 {item.burned}</span>}
                    {item.excused > 0 && <span className="text-rose-700 font-semibold">🛑 {item.excused}</span>}
                    {item.paidUzs > 0 && (
                      <span className="text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 rounded-md font-semibold">
                        Касса: +{item.paidUzs.toLocaleString('ru-RU')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs font-bold text-gray-900 tabular-nums">
                    {item.earnedUzs.toLocaleString('ru-RU')} сум
                  </div>
                  <div className="text-[10px] text-gray-400 font-semibold tabular-nums">
                    Баланс: {item.student.lessons_balance ?? 0} ур.
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
