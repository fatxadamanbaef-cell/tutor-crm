'use client';

import React from 'react';
import { Sparkles, BarChart3, Settings, UserPlus } from 'lucide-react';
import { hapticImpact } from '@/lib/telegram';

interface DashboardHeaderProps {
  onAddStudent: () => void;
  onOpenSettings?: () => void;
  onOpenMonthlyReport?: () => void;
  isCloudConnected: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  onAddStudent,
  onOpenSettings,
  onOpenMonthlyReport,
  isCloudConnected,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-zinc-950/90 backdrop-blur-xl border-b border-zinc-800/60 px-4 py-3">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-teal-600 to-teal-800 flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Sparkles className="w-4 h-4 text-zinc-100" />
          </div>
          <div>
            <h1 className="text-sm font-black text-zinc-100 leading-none tracking-tight">
              Tutor Tracker
            </h1>
            <div className="flex items-center gap-1 text-[9px] text-zinc-400 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-semibold">Онлайн</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5">
          {onOpenMonthlyReport && (
            <button
              onClick={() => {
                hapticImpact('light');
                onOpenMonthlyReport();
              }}
              className="p-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 active:bg-zinc-700 border border-zinc-800 text-zinc-300 transition-all active:scale-95"
              title="Отчёты"
            >
              <BarChart3 className="w-4 h-4 text-emerald-400" />
            </button>
          )}

          {onOpenSettings && (
            <button
              onClick={() => {
                hapticImpact('light');
                onOpenSettings();
              }}
              className="p-2 rounded-xl bg-zinc-950 hover:bg-zinc-800 active:bg-zinc-700 border border-zinc-800 text-zinc-300 transition-all active:scale-95"
              title="Настройки"
            >
              <Settings className="w-4 h-4 text-zinc-400" />
            </button>
          )}

          <button
            onClick={() => {
              hapticImpact('medium');
              onAddStudent();
            }}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-500 active:bg-teal-700 text-zinc-100 text-xs font-bold px-3 py-2 rounded-xl shadow-md shadow-teal-600/20 transition-all active:scale-95"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Ученик</span>
          </button>
        </div>
      </div>
    </header>
  );
};


