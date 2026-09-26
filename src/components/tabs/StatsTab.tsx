'use client';

import React from 'react';
import { FinanceSummary } from '@/types';
import { formatUZS } from '@/lib/formatters';

interface StatsTabProps {
  summary: FinanceSummary;
}

export const StatsTab: React.FC<StatsTabProps> = ({ summary }) => {
  return (
    <div className="flex flex-col h-full bg-gray-50 pb-24 px-4 pt-6">
      <h1 className="text-2xl font-bold text-black tracking-tight mb-6">Статистика</h1>
      
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl p-5 text-white shadow-md shadow-blue-500/20">
          <div className="text-xs font-semibold text-blue-100 mb-2">Занятий на сумму</div>
          <div className="text-xl font-black">{formatUZS(summary.earnedThisMonthUzs)}</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-3xl p-5 text-white shadow-md shadow-green-500/20">
          <div className="text-xs font-semibold text-green-100 mb-2">Проведено уроков</div>
          <div className="text-2xl font-black">{summary.completedLessonsCount}</div>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50 mt-10">
        <span className="text-4xl mb-4">📊</span>
        <p className="text-gray-500 font-semibold">Детальная статистика в разработке (Этап 4)</p>
      </div>
    </div>
  );
};
