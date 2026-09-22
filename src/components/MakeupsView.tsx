'use client';

import React, { useState } from 'react';
import { MakeupLesson, Student } from '@/types';
import {
  RefreshCw,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Clock,
  Sparkles,
  CheckCheck,
} from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

interface MakeupsViewProps {
  makeups: MakeupLesson[];
  students: Student[];
  onResolveMakeup: (makeupId: string) => void;
  onScheduleMakeup: (makeup: MakeupLesson) => void;
}

export const MakeupsView: React.FC<MakeupsViewProps> = ({
  makeups,
  students,
  onResolveMakeup,
  onScheduleMakeup,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending');

  const pendingList = makeups.filter((m) => m.status === 'pending' || m.status === 'scheduled');
  const completedList = makeups.filter((m) => m.status === 'completed');

  const getStudentInfo = (studentId: string) => {
    return students.find((s) => s.id === studentId);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 p-4 rounded-2xl border border-amber-500/20">
        <div className="flex items-center gap-2 mb-1">
          <RefreshCw className="w-4 h-4 text-amber-400" />
          <h2 className="text-sm font-bold text-slate-100">
            Журнал отработок и пропусков
          </h2>
        </div>
        <p className="text-xs text-slate-400">
          Здесь хранятся все пропущенные уроки, которые требуют назначения дополнительного времени.
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-800">
        <button
          onClick={() => {
            hapticImpact('light');
            setActiveTab('pending');
          }}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'pending'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Нужна отработка ({pendingList.length})
        </button>
        <button
          onClick={() => {
            hapticImpact('light');
            setActiveTab('completed');
          }}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
            activeTab === 'completed'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Отработано ({completedList.length})
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {activeTab === 'pending' ? (
          pendingList.length === 0 ? (
            <div className="text-center py-12 px-4 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 mb-3">
                <CheckCheck className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-medium text-slate-200 mb-1">
                Все отработки закрыты!
              </h3>
              <p className="text-xs text-slate-400">
                Нет пропущенных уроков, ожидающих проведения.
              </p>
            </div>
          ) : (
            pendingList.map((item) => {
              const student = getStudentInfo(item.student_id);

              return (
                <div
                  key={item.id}
                  className="bg-slate-900/90 border border-amber-900/40 rounded-2xl p-4 shadow-sm relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Требует отработки
                        </span>
                        {item.missed_date && (
                          <span className="text-xs text-slate-400">
                            Пропуск от {item.missed_date}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-slate-100">
                        {student?.name || item.student_name}
                      </h3>

                      <p className="text-xs text-slate-400 mt-1">
                        Причина: <span className="text-slate-300 font-medium">{item.reason || 'Не указана'}</span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center gap-2">
                    <button
                      onClick={() => {
                        hapticImpact('medium');
                        onScheduleMakeup(item);
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold py-2 px-3 rounded-xl transition-all shadow-sm active:scale-95"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Назначить урок</span>
                    </button>

                    <button
                      onClick={() => {
                        hapticNotification('success');
                        onResolveMakeup(item.id);
                      }}
                      className="flex items-center justify-center gap-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-semibold py-2 px-3 rounded-xl transition-all active:scale-95"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Уже отработан</span>
                    </button>
                  </div>
                </div>
              );
            })
          )
        ) : (
          completedList.length === 0 ? (
            <div className="text-center py-10 text-xs text-slate-400">
              Пока нет истории отработанных уроков.
            </div>
          ) : (
            completedList.map((item) => (
              <div
                key={item.id}
                className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between gap-2"
              >
                <div>
                  <h4 className="text-sm font-semibold text-slate-200">
                    {item.student_name}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    Пропуск: {item.missed_date || 'Ранее'} • {item.reason}
                  </p>
                </div>
                <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  ✓ Отработан
                </span>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
};
