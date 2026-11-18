'use client';

import React, { useState, useMemo } from 'react';
import { Lesson, Student } from '@/types';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getTashkentNow, getTashkentTodayStr } from '@/lib/formatters';
import { CheckCircle2, Flame, Ban, Clock, Copy, Check, Download, Wallet, AlertTriangle, ChevronRight } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';

interface StatsTabProps {
  lessons: Lesson[];
  students: Student[];
  onOpenStudent?: (student: Student) => void;
  summary?: any; // legacy compatibility
}

export const StatsTab: React.FC<StatsTabProps> = ({ lessons, students, onOpenStudent }) => {
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [copied, setCopied] = useState(false);

  const todayStr = getTashkentTodayStr();

  const {
    periodTitle,
    startStr,
    endStr,
    conductedCount,
    burnedCount,
    excusedCount,
    plannedCount,
    targetCount,
    completionRate,
    earnedUzs,
    expectedMonthUzs,
    totalDebtUzs,
    lowBalanceStudents,
    studentBreakdown,
  } = useMemo(() => {
    const now = getTashkentNow();
    const start = period === 'week' ? startOfWeek(now, { weekStartsOn: 1 }) : startOfMonth(now);
    const end = period === 'week' ? endOfWeek(now, { weekStartsOn: 1 }) : endOfMonth(now);
    const sStr = format(start, 'yyyy-MM-dd');
    const eStr = format(end, 'yyyy-MM-dd');

    const activeStudents = students.filter((s) => s.is_active !== false);
    const studentMap = new Map<string, Student>();
    students.forEach((s) => studentMap.set(s.id, s));

    const periodLessons = lessons.filter((l) => {
      const d = l.date.substring(0, 10);
      return d >= sStr && d <= eStr;
    });

    let conducted = 0;
    let burned = 0;
    let excused = 0;
    let planned = 0;
    let earned = 0;

    const perStudentMap = new Map<
      string,
      { student: Student; conducted: number; burned: number; excused: number; earnedUzs: number }
    >();

    for (const s of activeStudents) {
      perStudentMap.set(s.id, {
        student: s,
        conducted: 0,
        burned: 0,
        excused: 0,
        earnedUzs: 0,
      });
    }

    for (const l of periodLessons) {
      const st = studentMap.get(l.student_id);
      const rate = st?.lesson_rate || 300000;

      if (st && !perStudentMap.has(st.id)) {
        perStudentMap.set(st.id, {
          student: st,
          conducted: 0,
          burned: 0,
          excused: 0,
          earnedUzs: 0,
        });
      }
      const entry = perStudentMap.get(l.student_id);

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
      .filter((item) => item.conducted + item.burned + item.excused > 0 || item.student.is_active !== false)
      .sort((a, b) => b.earnedUzs - a.earnedUzs || a.student.name.localeCompare(b.student.name, 'ru'));

    const pTitle =
      period === 'week'
        ? `Неделя (${format(start, 'd MMM', { locale: ru })} – ${format(end, 'd MMM', { locale: ru })})`
        : format(now, 'LLLL yyyy', { locale: ru });

    return {
      periodTitle: pTitle,
      startStr: sStr,
      endStr: eStr,
      conductedCount: conducted,
      burnedCount: burned,
      excusedCount: excused,
      plannedCount: planned,
      targetCount: totalTarget,
      completionRate: ratePct,
      earnedUzs: earned,
      expectedMonthUzs: expectedMonth,
      totalDebtUzs: debtSum,
      lowBalanceStudents: lowBal,
      studentBreakdown: breakdown,
    };
  }, [lessons, students, period, todayStr]);

  const handleCopySummary = () => {
    hapticImpact('light');
    let text = `📊 Сводка — ${periodTitle}\n\n`;
    text += `✅ Проведено: ${conductedCount} ур. (план ${targetCount}, ${completionRate}%)\n`;
    text += `🔥 Сгорело (оплачено): ${burnedCount} ур.\n`;
    text += `🛑 Отменено (сохранено): ${excusedCount} ур.\n`;
    text += `⏳ В плане: ${plannedCount} ур.\n\n`;
    text += `💰 Заработано за период: ${earnedUzs.toLocaleString('ru-RU')} сум\n`;
    text += `🎯 План дохода на месяц: ${expectedMonthUzs.toLocaleString('ru-RU')} сум\n`;
    if (totalDebtUzs > 0) {
      text += `⚠️ Задолженность учеников: ${totalDebtUzs.toLocaleString('ru-RU')} сум\n`;
    }

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
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadCsv = () => {
    hapticImpact('light');
    const rows = [
      'Ученик,Ставка (UZS),Проведено,Сгорело,Отменено,Заработано (UZS),Баланс (ур.),Долг (UZS)',
    ];
    for (const item of studentBreakdown) {
      const rate = item.student.lesson_rate || 300000;
      const bal = item.student.lessons_balance ?? 0;
      const debt = bal < 0 ? Math.abs(bal) * rate : 0;
      rows.push(
        `"${item.student.name.replace(/"/g, '""')}",${rate},${item.conducted},${item.burned},${item.excused},${item.earnedUzs},${bal},${debt}`
      );
    }
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tutor-crm-${period}-${startStr}_${endStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    hapticNotification('success');
  };

  return (
    <div className="flex flex-col h-full bg-[#f2f2f7] pb-28 px-4 pt-5 overflow-y-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Аналитика и доход</h1>
          <p className="text-xs text-gray-500 font-semibold capitalize mt-0.5">{periodTitle}</p>
        </div>

        {/* Period Switcher */}
        <div className="bg-gray-200 p-0.5 rounded-xl flex">
          <button
            onClick={() => { hapticImpact('light'); setPeriod('week'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              period === 'week' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'
            }`}
          >
            Неделя
          </button>
          <button
            onClick={() => { hapticImpact('light'); setPeriod('month'); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              period === 'month' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'
            }`}
          >
            Месяц
          </button>
        </div>
      </div>

      {/* Finance Summary Card */}
      <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[10px] font-bold text-gray-400 uppercase block">
                Заработано за {period === 'week' ? 'неделю' : 'месяц'}
              </span>
              <span className="text-xl font-black text-gray-900">
                {earnedUzs.toLocaleString('ru-RU')} <span className="text-xs text-gray-500 font-bold">сум</span>
              </span>
            </div>
          </div>
          <span className="text-[11px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-xl">
            {conductedCount + burnedCount} опл. ур.
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100">
          <div className="bg-blue-50/70 rounded-2xl p-2.5 border border-blue-100">
            <span className="text-[10px] font-bold text-blue-700 uppercase block">План на месяц</span>
            <span className="text-xs font-black text-blue-900 mt-0.5 block">
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
              className={`text-[10px] font-bold uppercase block ${
                totalDebtUzs > 0 ? 'text-rose-700' : 'text-gray-500'
              }`}
            >
              Долг по балансу
            </span>
            <span
              className={`text-xs font-black mt-0.5 block ${
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
            <span className="text-[10px] font-bold text-emerald-700 uppercase">Проведено</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-gray-900">{conductedCount}</div>
          <div className="text-[10px] text-gray-500 font-semibold">
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
            <span className="text-[11px] font-bold text-orange-800 flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 text-orange-600" /> Сгорело
            </span>
            <span className="text-xs font-black text-orange-900">{burnedCount}</span>
          </div>
          <div className="flex items-center justify-between bg-rose-50/70 px-2.5 py-1 rounded-xl">
            <span className="text-[11px] font-bold text-rose-800 flex items-center gap-1">
              <Ban className="w-3.5 h-3.5 text-rose-600" /> Отменено
            </span>
            <span className="text-xs font-black text-rose-900">{excusedCount}</span>
          </div>
          <div className="flex items-center justify-between bg-blue-50/70 px-2.5 py-1 rounded-xl">
            <span className="text-[11px] font-bold text-blue-800 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-blue-600" /> В плане
            </span>
            <span className="text-xs font-black text-blue-900">{plannedCount}</span>
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
          <h3 className="text-xs font-black text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
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
                    <div className="text-xs font-bold text-gray-900">{s.name}</div>
                    <div className="text-[10px] text-gray-500 font-medium">
                      {s.billing_type === 'package' ? 'Пакет' : `Оплата: ${s.billing_day || '10'}`} · Ставка {(s.lesson_rate || 300000).toLocaleString('ru-RU')} сум
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-xs font-black px-2 py-0.5 rounded-lg ${
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
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide">
          Детализация по ученикам ({studentBreakdown.length})
        </h3>

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
                  <div className="text-xs font-bold text-gray-900 truncate">{item.student.name}</div>
                  <div className="text-[10px] text-gray-500 font-medium flex items-center gap-2 mt-0.5">
                    <span className="text-emerald-700 font-bold">✅ {item.conducted}</span>
                    {item.burned > 0 && <span className="text-orange-700 font-bold">🔥 {item.burned}</span>}
                    {item.excused > 0 && <span className="text-rose-700 font-bold">🛑 {item.excused}</span>}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-xs font-black text-gray-900">
                    {item.earnedUzs.toLocaleString('ru-RU')} сум
                  </div>
                  <div className="text-[10px] text-gray-400 font-semibold">
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
