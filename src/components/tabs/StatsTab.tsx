'use client';

import React, { useState, useMemo } from 'react';
import { Lesson, Student } from '@/types';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, parseISO, isWithinInterval } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getTashkentNow } from '@/lib/formatters';
import { CheckCircle2, XCircle, RotateCcw, Copy, Check, Calendar, Users, Award } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';

interface StatsTabProps {
  lessons: Lesson[];
  students: Student[];
  summary?: any; // legacy compatibility
}

export const StatsTab: React.FC<StatsTabProps> = ({ lessons, students }) => {
  const [period, setPeriod] = useState<'week' | 'month'>('month');
  const [copied, setCopied] = useState(false);

  const now = getTashkentNow();

  const {
    periodTitle,
    conductedCount,
    missedCount,
    plannedCount,
    makeupsCount,
    targetCount,
    completionRate,
    missedList,
    makeupList,
  } = useMemo(() => {
    const start = period === 'week' ? startOfWeek(now, { weekStartsOn: 1 }) : startOfMonth(now);
    const end = period === 'week' ? endOfWeek(now, { weekStartsOn: 1 }) : endOfMonth(now);

    const periodLessons = lessons.filter((l) => {
      try {
        const d = parseISO(l.date);
        return isWithinInterval(d, { start, end });
      } catch {
        return false;
      }
    });

    let conducted = 0;
    let missed = 0;
    let planned = 0;
    let makeups = 0;

    const missedItems: Array<{ studentName: string; date: string; reason: string; needsMakeup: boolean }> = [];
    const makeupItems: Array<{ studentName: string; date: string; time: string; status: string }> = [];

    periodLessons.forEach((l) => {
      const student = students.find((s) => s.id === l.student_id);
      const studentName = student?.name || l.student_name || 'Ученик';

      if (l.status === 'completed') {
        conducted++;
        if (l.is_makeup) {
          makeups++;
          makeupItems.push({
            studentName,
            date: l.date.substring(0, 10),
            time: (l.time_str || '').split(' - ')[0],
            status: 'Проведена',
          });
        }
      } else if (l.status === 'missed' || l.status === 'missed_excused' || l.status === 'missed_penalty') {
        missed++;
        missedItems.push({
          studentName,
          date: l.date.substring(0, 10),
          reason: l.miss_reason || l.notes || 'Пропуск',
          needsMakeup: Boolean(l.needs_makeup || l.status === 'missed_excused'),
        });
      } else {
        planned++;
        if (l.is_makeup) {
          makeupItems.push({
            studentName,
            date: l.date.substring(0, 10),
            time: (l.time_str || '').split(' - ')[0],
            status: 'Запланирована в ВС',
          });
        }
      }
    });

    const totalTarget = period === 'month'
      ? students.reduce((acc, s) => acc + (s.monthly_target_lessons || 12), 0)
      : Math.round(students.reduce((acc, s) => acc + (s.monthly_target_lessons || 12), 0) / 4);

    const totalDoneOrMissed = conducted + missed;
    const rate = totalTarget > 0 ? Math.min(100, Math.round((conducted / totalTarget) * 100)) : 0;

    const pTitle = period === 'week'
      ? `Неделя (${format(start, 'd MMM', { locale: ru })} – ${format(end, 'd MMM', { locale: ru })})`
      : format(now, 'LLLL yyyy', { locale: ru });

    return {
      periodTitle: pTitle,
      conductedCount: conducted,
      missedCount: missed,
      plannedCount: planned,
      makeupsCount: makeups,
      targetCount: totalTarget,
      completionRate: rate,
      missedList: missedItems,
      makeupList: makeupItems,
    };
  }, [lessons, students, period, now]);

  const handleCopySummary = () => {
    hapticImpact('light');
    let text = `📊 Сводка посещаемости — ${periodTitle}\n\n`;
    text += `✅ Всего проведено: ${conductedCount} уроков (из плана ${targetCount}, выполнение ${completionRate}%)\n`;
    text += `❌ Пропущено: ${missedCount} уроков\n`;
    text += `🔄 Отработки: ${makeupsCount}\n\n`;

    if (missedList.length > 0) {
      text += `Список пропусков:\n`;
      missedList.forEach((m, idx) => {
        text += `${idx + 1}. ${m.studentName} (${m.date}) — ${m.reason}${m.needsMakeup ? ' [на отработке]' : ''}\n`;
      });
      text += `\n`;
    }

    if (makeupList.length > 0) {
      text += `Отработки в воскресенье:\n`;
      makeupList.forEach((mk, idx) => {
        text += `${idx + 1}. ${mk.studentName} (${mk.date} в ${mk.time}) — ${mk.status}\n`;
      });
      text += `\n`;
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      hapticNotification('success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f2f2f7] pb-28 px-4 pt-5 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Сводка посещаемости</h1>
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

      {/* Main Stats Cards */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {/* Conducted */}
        <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase">Проведено</span>
            <div className="w-7 h-7 rounded-full bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-gray-900">{conductedCount}</div>
            <div className="text-[11px] text-gray-500 font-semibold mt-0.5">
              План: {targetCount} ({completionRate}%)
            </div>
          </div>
          <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
            <div
              className="bg-green-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        {/* Missed */}
        <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-100 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-500 uppercase">Пропущено</span>
            <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center">
              <XCircle className="w-4 h-4 text-red-600" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-3xl font-black text-gray-900">{missedCount}</div>
            <div className="text-[11px] text-gray-500 font-semibold mt-0.5">
              Уроков не состоялось
            </div>
          </div>
          <div className="text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-1 rounded-lg mt-3 flex items-center justify-between">
            <span>Отработки в ВС:</span>
            <span>{makeupsCount}</span>
          </div>
        </div>
      </div>

      {/* Copy Summary Button */}
      <button
        type="button"
        onClick={handleCopySummary}
        className="w-full mb-4 py-3 px-4 rounded-2xl bg-white border border-gray-200 text-gray-800 text-xs font-bold shadow-xs flex items-center justify-center gap-2 active:scale-98 transition-all"
      >
        {copied ? (
          <>
            <Check className="w-4 h-4 text-green-600" />
            <span className="text-green-600">Сводка скопирована в буфер!</span>
          </>
        ) : (
          <>
            <Copy className="w-4 h-4 text-gray-500" />
            <span>Скопировать готовую сводку</span>
          </>
        )}
      </button>

      {/* Missed Lessons List */}
      <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-100 mb-4">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <XCircle className="w-4 h-4 text-red-500" />
          <span>Пропуски за период ({missedList.length})</span>
        </h3>

        {missedList.length === 0 ? (
          <p className="text-xs text-gray-400 py-3 text-center font-medium">
            Отлично! За этот период не было пропусков 🎉
          </p>
        ) : (
          <div className="space-y-2">
            {missedList.map((item, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-gray-50 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-gray-900">{item.studentName}</span>
                  <span className="text-gray-400 text-[11px] ml-2">{item.date}</span>
                  <p className="text-gray-600 text-[11px] mt-0.5 italic">«{item.reason}»</p>
                </div>
                {item.needsMakeup ? (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                    В ВС
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-gray-400 bg-gray-200 px-2 py-0.5 rounded-md">
                    В архив
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sunday Makeups List */}
      <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-100 mb-4">
        <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <RotateCcw className="w-4 h-4 text-blue-500" />
          <span>Отработки в воскресенье ({makeupList.length})</span>
        </h3>

        {makeupList.length === 0 ? (
          <p className="text-xs text-gray-400 py-3 text-center font-medium">
            Нет назначенных отработок
          </p>
        ) : (
          <div className="space-y-2">
            {makeupList.map((item, idx) => (
              <div key={idx} className="p-2.5 rounded-xl bg-blue-50/50 flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-gray-900">{item.studentName}</span>
                  <span className="text-gray-500 text-[11px] ml-2">
                    {item.date} {item.time && `(${item.time})`}
                  </span>
                </div>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md">
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
