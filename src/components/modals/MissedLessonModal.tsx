'use client';

import React, { useState } from 'react';
import { Lesson } from '@/types';
import { X, AlertCircle, RefreshCw, XCircle } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';

interface MissedLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  lesson: Lesson | null;
  onConfirm: (options: { needsMakeup: boolean; reason: string }) => void;
}

export const MissedLessonModal: React.FC<MissedLessonModalProps> = ({
  isOpen,
  onClose,
  lesson,
  onConfirm,
}) => {
  const [needsMakeup, setNeedsMakeup] = useState(true);
  const [reason, setReason] = useState('Предупредил заранее');

  if (!isOpen || !lesson) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm({
      needsMakeup,
      reason,
    });
    hapticNotification('warning');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 space-y-4 animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            <span>Отметка о пропуске урока</span>
          </h3>
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-1 rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80">
          <h4 className="text-sm font-bold text-slate-200">
            {lesson.student_name}
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            Урок на {lesson.lesson_date} в {lesson.start_time}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">
              Что делаем с этим уроком?
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setNeedsMakeup(true)}
                className={`p-3 rounded-xl border font-semibold text-xs flex flex-col items-center gap-1.5 transition-all text-center ${
                  needsMakeup
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500 shadow-md'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                <RefreshCw className="w-4 h-4 text-amber-400" />
                <span>Нужна отработка</span>
              </button>

              <button
                type="button"
                onClick={() => setNeedsMakeup(false)}
                className={`p-3 rounded-xl border font-semibold text-xs flex flex-col items-center gap-1.5 transition-all text-center ${
                  !needsMakeup
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500 shadow-md'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                <XCircle className="w-4 h-4 text-rose-400" />
                <span>Просто отменить</span>
              </button>
            </div>
          </div>

          {needsMakeup && (
            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                Причина пропуска
              </label>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {['Болезнь', 'Предупредил заранее', 'Семейные обстоятельства', 'Спектакль / поездка'].map(
                  (preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setReason(preset)}
                      className={`py-1.5 px-2 rounded-lg border text-[11px] font-medium transition-all truncate text-left ${
                        reason === preset
                          ? 'bg-blue-600/30 text-blue-300 border-blue-500'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      {preset}
                    </button>
                  )
                )}
              </div>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Другая причина..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-rose-600/30 transition-all active:scale-95 text-xs"
            >
              Подтвердить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
