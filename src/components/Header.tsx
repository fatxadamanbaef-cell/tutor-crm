'use client';

import React from 'react';
import { Plus, Database, Sparkles, CheckCircle2 } from 'lucide-react';
import { hapticImpact } from '@/lib/telegram';

interface HeaderProps {
  onAddLesson: () => void;
  onConductLesson: () => void;
  onOpenSync: () => void;
  isCloudConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onAddLesson,
  onConductLesson,
  onOpenSync,
  isCloudConnected,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/60 px-3 py-2.5">
      <div className="max-w-md mx-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20 shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-100 leading-none">
              Tutor Tracker
            </h1>
            <button
              onClick={() => {
                hapticImpact('light');
                onOpenSync();
              }}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 transition-colors mt-0.5"
            >
              <Database className={`w-2.5 h-2.5 ${isCloudConnected ? 'text-emerald-400' : 'text-amber-400'}`} />
              <span>{isCloudConnected ? 'Supabase' : 'Демо (локально)'}</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => {
              hapticImpact('medium');
              onConductLesson();
            }}
            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl shadow-md shadow-emerald-600/20 transition-all active:scale-95"
            title="Отметить проведенный урок"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Проведен</span>
          </button>

          <button
            onClick={() => {
              hapticImpact('medium');
              onAddLesson();
            }}
            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-[11px] font-semibold px-2.5 py-1.5 rounded-xl shadow-md shadow-blue-600/20 transition-all active:scale-95"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>План</span>
          </button>
        </div>
      </div>
    </header>
  );
};
