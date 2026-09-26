'use client';

import React from 'react';
import { FinanceSummary } from '@/types';
import { formatUZS } from '@/lib/formatters';
import { TrendingUp, CheckCircle2 } from 'lucide-react';

interface FinanceSummaryCardProps {
  summary: FinanceSummary;
  onOpenMonthlyReport?: () => void;
}

export const FinanceSummaryCard: React.FC<FinanceSummaryCardProps> = ({ summary, onOpenMonthlyReport }) => {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/70 border border-slate-800 p-5 shadow-xl shadow-black/40">
      {/* Background glow */}
      <div className="absolute -right-10 -top-10 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

      <div className="relative z-10 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400">
            Заработано в этом месяце
          </span>
          {onOpenMonthlyReport ? (
            <button
              onClick={onOpenMonthlyReport}
              className="flex items-center gap-1 text-[11px] font-bold text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 px-2.5 py-1 rounded-full active:scale-95 transition-all shadow-sm"
            >
              <TrendingUp className="w-3 h-3" />
              <span>Итоги & Экспорт</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
              <TrendingUp className="w-3 h-3" />
              <span>Актуально</span>
            </div>
          )}
        </div>

        <div className="text-3xl font-extrabold tracking-tight text-white mt-1">
          {formatUZS(summary.earnedThisMonthUzs)}
        </div>

        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
            <span>
              Проведено уроков: <strong className="text-slate-200 font-bold">{summary.completedLessonsCount}</strong>
            </span>
          </div>

          {onOpenMonthlyReport && (
            <button
              onClick={onOpenMonthlyReport}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Детализация →
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
