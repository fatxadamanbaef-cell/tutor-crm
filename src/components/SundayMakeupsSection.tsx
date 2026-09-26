'use client';

import React from 'react';
import { Lesson, Student } from '@/types';
import { Sparkles, Calendar, Flame, Check } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { hapticImpact, hapticNotification } from '@/lib/telegram';

interface SundayMakeupsSectionProps {
  lessons: Lesson[];
  students: Student[];
  onScheduleSundayMakeup: (lesson: Lesson) => void;
  onBurnLesson: (lessonId: string) => void;
}

export const SundayMakeupsSection: React.FC<SundayMakeupsSectionProps> = ({
  lessons,
  students,
  onScheduleSundayMakeup,
  onBurnLesson,
}) => {
  const makeupLessons = lessons.filter((l) => l.status === 'missed_excused');

  if (makeupLessons.length === 0) return null;

  const formatRuDate = (dateStr: string) => {
    try {
      const raw = dateStr.includes('T') ? dateStr.substring(0, 10) : dateStr;
      const d = parseISO(raw);
      const dayName = format(d, 'EEE', { locale: ru });
      const capDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      return `${format(d, 'd MMMM', { locale: ru })} (${capDay})`;
    } catch {
      return dateStr;
    }
  };

  return (
    <section className="space-y-2 animate-in fade-in duration-200">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs font-black text-amber-300">
          <span className="text-sm">🎯</span>
          <span>Отработки на это Воскресенье</span>
          <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-mono text-[10px] border border-amber-500/30">
            {makeupLessons.length}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {makeupLessons.map((l) => {
          const student = students.find((s) => s.id === l.student_id);

          return (
            <div
              key={l.id}
              className="p-3 rounded-2xl bg-amber-950/25 border border-amber-500/40 flex items-center justify-between gap-3 shadow-md shadow-amber-950/20"
            >
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-100 text-xs truncate">
                  {l.student_name || student?.name || 'Ученик'}
                </div>
                <div className="text-[10px] text-amber-300/90 flex items-center gap-1 mt-0.5 font-medium">
                  <span>Пропуск:</span>
                  <span className="font-semibold text-slate-200">{formatRuDate(l.date)}</span>
                </div>
                {l.notes && (
                  <div className="text-[9px] text-slate-400 truncate mt-0.5">
                    {l.notes}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    onScheduleSundayMakeup(l);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 active:bg-blue-600 border border-blue-500/40 text-blue-200 text-[10px] font-bold active:scale-95 transition-all"
                  title="Назначить слот в воскресенье"
                >
                  <Calendar className="w-3 h-3 text-blue-300" />
                  <span>В ВС</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        `Списать урок для «${l.student_name || 'Ученик'}» как сгоревший (-1 с баланса)?`
                      )
                    ) {
                      hapticNotification('warning');
                      onBurnLesson(l.id);
                    }
                  }}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 active:bg-rose-900 border border-rose-800/60 text-rose-300 text-[10px] font-bold active:scale-95 transition-all"
                  title="Сжечь урок без отработки"
                >
                  <Flame className="w-3 h-3 text-rose-400" />
                  <span>Сжечь</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};
