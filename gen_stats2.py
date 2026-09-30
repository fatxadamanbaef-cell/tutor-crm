import sys

new_content = """'use client';

import React, { useMemo } from 'react';
import { FinanceSummary, Lesson, Student } from '@/types';
import { formatUZS } from '@/lib/formatters';
import { startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { getTashkentNow } from '@/lib/formatters';
import { TrendingUp, CheckCircle2, XCircle, AlertCircle, CalendarClock, Trophy } from 'lucide-react';

interface StatsTabProps {
  summary: FinanceSummary;
  lessons: Lesson[];
  students: Student[];
}

export const StatsTab: React.FC<StatsTabProps> = ({ summary, lessons, students }) => {
  const stats = useMemo(() => {
    const now = getTashkentNow();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const monthLessons = lessons.filter(l => {
      try {
        const d = parseISO(l.date);
        return isWithinInterval(d, { start: monthStart, end: monthEnd });
      } catch { return false; }
    });

    let plannedCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let excusedCount = 0;
    let projectedIncome = summary.earnedThisMonthUzs;

    const studentIncome: Record<string, number> = {};

    monthLessons.forEach(l => {
      const student = students.find(s => s.id === l.student_id);
      const price = student?.price_per_lesson || 0;

      if (l.status === 'completed' || l.status === 'missed_penalty') {
        if (!studentIncome[l.student_id]) studentIncome[l.student_id] = 0;
        studentIncome[l.student_id] += price;
      }

      if (l.status === 'completed') completedCount++;
      else if (l.status === 'missed_penalty') cancelledCount++;
      else if (l.status === 'missed_excused') excusedCount++;
      else if (l.status === 'planned') {
        plannedCount++;
        projectedIncome += price;
      }
    });

    const topStudents = Object.entries(studentIncome)
      .map(([id, income]) => ({
        student: students.find(s => s.id === id),
        income
      }))
      .filter(x => x.student)
      .sort((a, b) => b.income - a.income)
      .slice(0, 3);

    const totalResolved = completedCount + cancelledCount;
    const completionRate = totalResolved > 0 ? Math.round((completedCount / totalResolved) * 100) : 0;

    return {
      plannedCount,
      completedCount,
      cancelledCount,
      excusedCount,
      projectedIncome,
      topStudents,
      completionRate
    };
  }, [lessons, students, summary]);

  return (
    <div className="flex flex-col h-full bg-gray-50 pb-24 px-4 pt-6 overflow-y-auto">
      <h1 className="text-2xl font-bold text-black tracking-tight mb-6">Аналитика</h1>
      
      {/* Главные карточки */}
      <div className="grid grid-cols-1 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl p-5 text-white shadow-lg shadow-blue-500/30">
          <div className="flex justify-between items-start mb-2">
            <div className="text-xs font-semibold text-blue-100 uppercase tracking-wider">Фактический доход</div>
            <TrendingUp className="w-4 h-4 text-blue-200" />
          </div>
          <div className="text-3xl font-black mb-1">{formatUZS(summary.earnedThisMonthUzs)}</div>
          <div className="text-xs text-blue-200">В этом месяце (за {summary.completedLessonsCount} ур.)</div>
        </div>
        
        <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm">
          <div className="flex justify-between items-start mb-1">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Ожидаемый доход</div>
            <CalendarClock className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-xl font-black text-black">{formatUZS(stats.projectedIncome)}</div>
          <div className="text-[10px] text-gray-400 mt-1">Если все запланированные уроки пройдут ({stats.plannedCount} ур.)</div>
        </div>
      </div>

      {/* Статистика уроков */}
      <h2 className="text-sm font-bold text-gray-900 mb-3 px-1">Уроки в этом месяце</h2>
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-xs font-bold text-gray-500">Проведено</span>
          </div>
          <div className="text-2xl font-black text-black">{stats.completedCount}</div>
        </div>
        
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <XCircle className="w-4 h-4 text-red-500" />
            <span className="text-xs font-bold text-gray-500">Списано</span>
          </div>
          <div className="text-2xl font-black text-black">{stats.cancelledCount}</div>
        </div>
        
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-bold text-gray-500">Долги</span>
          </div>
          <div className="text-2xl font-black text-black">{stats.excusedCount}</div>
        </div>
        
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col justify-center">
          <div className="text-[10px] font-bold text-gray-400 mb-1 uppercase text-center">Доходимость</div>
          <div className="text-2xl font-black text-blue-600 text-center">{stats.completionRate}%</div>
        </div>
      </div>

      {/* Топ ученики */}
      {stats.topStudents.length > 0 && (
        <>
          <h2 className="text-sm font-bold text-gray-900 mb-3 px-1 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-yellow-500" />
            Топ учеников за месяц
          </h2>
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 space-y-4 mb-6">
            {stats.topStudents.map((item, index) => (
              <div key={item.student?.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                    index === 0 ? 'bg-yellow-100 text-yellow-700' :
                    index === 1 ? 'bg-gray-100 text-gray-600' :
                    'bg-orange-50 text-orange-700'
                  }`}>
                    {index + 1}
                  </div>
                  <div className="font-bold text-sm text-black">{item.student?.name}</div>
                </div>
                <div className="font-black text-sm text-gray-700">{formatUZS(item.income)}</div>
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
};
"""

with open(r'd:\mathvibe project\tutor-crm\src\components\tabs\StatsTab.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)
