'use client';

import React, { useRef } from 'react';
import { Lesson, Student, LessonStatus } from '@/types';
import { Clock, Check, X, Flame } from 'lucide-react';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/telegram';

const fireConfetti = () => {
  if (typeof window !== 'undefined') {
    import('canvas-confetti').then((mod) => {
      mod.default({ particleCount: 45, spread: 55, origin: { y: 0.7 } });
    }).catch(() => {});
  }
};

interface LessonCardProps {
  lesson: Lesson;
  student?: Student;
  onToggleStatus: (id: string) => void;
  onSetStatus?: (id: string, status: LessonStatus) => void;
  onDeleteLesson?: (id: string) => void;
  onEditLesson?: (lesson: Lesson) => void;
}

export const LessonCard: React.FC<LessonCardProps> = ({
  lesson,
  student,
  onToggleStatus,
  onSetStatus,
  onDeleteLesson,
  onEditLesson,
}) => {
  const isCompleted = lesson.status === 'completed';
  const isMissed = lesson.status === 'missed_excused';
  const isBurned = lesson.status === 'missed_penalty';
  const isPlanned = lesson.status === 'planned';

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleCardClick = () => {
    if (isPlanned) {
      hapticNotification('success');
      fireConfetti();
    } else if (isCompleted) {
      hapticNotification('warning');
    } else if (isMissed) {
      hapticNotification('error');
    } else {
      hapticSelection();
    }
    onToggleStatus(lesson.id);
  };

  // Long press handler to edit/delete
  const handleTouchStart = () => {
    timerRef.current = setTimeout(() => {
      hapticImpact('heavy');
      if (onEditLesson) {
        onEditLesson(lesson);
      } else if (onDeleteLesson) {
        if (confirm(`Удалить урок «${lesson.student_name || 'Ученик'}» из расписания?`)) {
          onDeleteLesson(lesson.id);
        }
      }
    }, 700);
  };

  const handleTouchEnd = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      className={`w-full text-left select-none cursor-pointer rounded-2xl border p-3 transition-all duration-150 active:scale-[0.99] focus:outline-none space-y-2.5 ${
        isCompleted
          ? 'bg-emerald-950/30 border-emerald-500/50 shadow-md shadow-emerald-950/40'
          : isBurned
          ? 'bg-rose-950/30 border-rose-500/50 shadow-md shadow-rose-950/40'
          : isMissed
          ? 'bg-amber-950/30 border-amber-500/50 shadow-md shadow-amber-950/40'
          : 'bg-zinc-900/95 border-zinc-800 hover:border-zinc-700 shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        {/* Left: Time & Student Name & Topic */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
            <Clock className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span className="font-mono text-zinc-200 font-bold tracking-tight">
              {lesson.time_str || '18:00 - 19:30'}
            </span>
            {student && (
              <span className="text-[10px] text-zinc-400">
                • {student.prepaid_balance > 0 ? `+${student.prepaid_balance} ур.` : `${student.prepaid_balance} ур.`}
              </span>
            )}
          </div>

          <div className="font-bold text-sm text-white truncate mt-0.5">
            {lesson.student_name || student?.name || 'Ученик'}
          </div>

          {lesson.notes && (
            <div className="text-[11px] text-zinc-400 truncate mt-0.5 flex items-center gap-1">
              <span className="text-amber-400/90 font-bold text-[10px]">ДЗ / Заметка:</span>
              <span className="truncate">{lesson.notes}</span>
            </div>
          )}
        </div>

        {/* Right: Clean Status Badge & Quick Edit */}
        <div className="shrink-0 flex items-center gap-1.5">
          {onEditLesson && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                hapticImpact('light');
                onEditLesson(lesson);
              }}
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 bg-zinc-800/50 hover:bg-zinc-800 active:scale-95 transition-all"
              title="Перенести или изменить урок"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9"/>
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </button>
          )}

          {isCompleted && (
            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-xl animate-in fade-in zoom-in-95 duration-150">
              <Check className="w-3 h-3 stroke-[3]" />
              <span>Проведен</span>
            </span>
          )}

          {isBurned && (
            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-rose-300 bg-rose-500/20 border border-rose-500/30 px-2 py-0.5 rounded-xl animate-in fade-in zoom-in-95 duration-150">
              <span>🔥 Сгорел</span>
            </span>
          )}

          {isMissed && (
            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded-xl animate-in fade-in zoom-in-95 duration-150">
              <X className="w-3 h-3 stroke-[3]" />
              <span>В ВС</span>
            </span>
          )}

          {isPlanned && (
            <span className="w-2.5 h-2.5 rounded-full bg-teal-500/60 mr-1" />
          )}
        </div>
      </div>

      {/* QUICK STATUS BAR (1-CLICK STATUS SELECTION) */}
      <div
        className="grid grid-cols-2 gap-2 pt-1.5 border-t border-zinc-800/60"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => {
            hapticNotification('success');
            fireConfetti();
            if (onSetStatus) onSetStatus(lesson.id, 'completed');
            else onToggleStatus(lesson.id);
          }}
          className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all active:scale-95 flex items-center justify-center gap-1 ${
            isCompleted
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-sm'
              : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:text-emerald-300'
          }`}
        >
          <span>✅</span>
          <span>Был</span>
        </button>

        <button
          type="button"
          onClick={() => {
            hapticSelection();
            if (onSetStatus) onSetStatus(lesson.id, 'planned');
          }}
          className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all active:scale-95 flex items-center justify-center gap-1 ${
            isPlanned
              ? 'bg-teal-500/20 text-teal-400 border-teal-500/30 shadow-sm'
              : 'bg-zinc-950/60 border-zinc-800/80 text-zinc-400 hover:text-teal-300'
          }`}
        >
          <span>⚪</span>
          <span>Не был (План)</span>
        </button>
      </div>
    </div>
  );
};
