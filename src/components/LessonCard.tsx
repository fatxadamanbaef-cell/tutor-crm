'use client';

import React, { useState } from 'react';
import { Lesson, Student, LessonStatus } from '@/types';
import { Clock, Check, X, CalendarClock, ChevronDown } from 'lucide-react';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/telegram';

interface LessonCardProps {
  lesson: Lesson;
  student?: Student;
  onToggleStatus: (id: string) => void;
  onSetStatus?: (id: string, status: LessonStatus, missReason?: string, needsMakeup?: boolean) => void;
  onDeleteLesson?: (id: string) => void;
  onEditLesson?: (lesson: Lesson) => void;
}

export const LessonCard: React.FC<LessonCardProps> = ({
  lesson,
  student,
  onToggleStatus,
  onSetStatus,
  onEditLesson,
}) => {
  const isCompleted = lesson.status === 'completed';
  const isMissed = lesson.status === 'missed' || lesson.status === 'missed_excused' || lesson.status === 'missed_penalty';
  const isPlanned = lesson.status === 'planned';

  const [showMissOptions, setShowMissOptions] = useState(false);

  const studentColor = student?.color || '#3B82F6';
  const target = student?.monthly_target_lessons || 12;
  const conducted = student?.conducted_this_month || 0;

  const handleQuickComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticNotification('success');
    setShowMissOptions(false);
    if (onSetStatus) {
      // If already completed, toggle back to planned
      onSetStatus(lesson.id, isCompleted ? 'planned' : 'completed');
    } else {
      onToggleStatus(lesson.id);
    }
  };

  const handleMissWithMakeup = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticNotification('warning');
    setShowMissOptions(false);
    if (onSetStatus) {
      onSetStatus(lesson.id, 'missed', 'Пропуск (в отработку)', true);
    }
  };

  const handleMissNoMakeup = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticSelection();
    setShowMissOptions(false);
    if (onSetStatus) {
      onSetStatus(lesson.id, 'missed', 'Пропуск без отработки', false);
    }
  };

  return (
    <div
      onClick={() => onEditLesson && onEditLesson(lesson)}
      className={`w-full text-left select-none cursor-pointer rounded-2xl bg-white border p-3.5 transition-all duration-150 active:scale-[0.99] shadow-xs space-y-3 ${
        isCompleted
          ? 'border-emerald-300/80 bg-emerald-50/20'
          : isMissed
          ? 'border-rose-300/80 bg-rose-50/20'
          : 'border-gray-200/80 hover:border-gray-300'
      }`}
      style={{ borderLeftWidth: '4px', borderLeftColor: studentColor }}
    >
      {/* Top Header: Time + Student + Progress + Status Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 font-semibold">
            <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="font-mono text-gray-900 font-extrabold tracking-tight">
              {lesson.time_str || '18:00 - 19:30'}
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-50 text-blue-700 shrink-0">
              {conducted}/{target} ур.
            </span>
          </div>

          <div className="font-black text-sm text-gray-900 truncate mt-1">
            {lesson.student_name || student?.name || 'Ученик'}
          </div>

          {lesson.notes && (
            <div className="text-[11px] text-gray-500 truncate mt-0.5">
              <span className="text-amber-600 font-bold mr-1">Заметка:</span>
              <span>{lesson.notes}</span>
            </div>
          )}

          {isMissed && lesson.miss_reason && (
            <div className="text-[11px] text-rose-600 font-bold truncate mt-0.5">
              <span>Причина: {lesson.miss_reason}</span>
              {lesson.needs_makeup && <span className="ml-1 text-amber-600">• Отработка в ВС</span>}
            </div>
          )}
        </div>

        {/* Status Badge */}
        <div className="shrink-0">
          {isCompleted && (
            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg">
              <Check className="w-3 h-3 stroke-[3]" />
              <span>Проведен</span>
            </span>
          )}
          {isMissed && (
            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-lg">
              <X className="w-3 h-3 stroke-[3]" />
              <span>{lesson.needs_makeup ? 'В ВС' : 'Пропуск'}</span>
            </span>
          )}
          {isPlanned && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-lg">
              <span>⏳ План</span>
            </span>
          )}
        </div>
      </div>

      {/* Quick Action Buttons (1-Tap) */}
      <div className="pt-2 border-t border-gray-100/90 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-3 gap-1.5">
          {/* Button 1: Conducted */}
          <button
            type="button"
            onClick={handleQuickComplete}
            className={`py-2 px-1 text-center text-xs font-bold rounded-xl border transition-all active:scale-95 flex items-center justify-center gap-1 ${
              isCompleted
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                : 'bg-gray-50 text-emerald-700 border-gray-200 hover:bg-emerald-50'
            }`}
          >
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>{isCompleted ? 'Был ✅' : 'Был'}</span>
          </button>

          {/* Button 2: Missed Toggle */}
          <button
            type="button"
            onClick={() => {
              hapticImpact('light');
              setShowMissOptions(!showMissOptions);
            }}
            className={`py-2 px-1 text-center text-xs font-bold rounded-xl border transition-all active:scale-95 flex items-center justify-center gap-0.5 ${
              isMissed
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : 'bg-gray-50 text-rose-700 border-gray-200 hover:bg-rose-50'
            }`}
          >
            <X className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Пропуск</span>
            <ChevronDown className={`w-3 h-3 transition-transform ${showMissOptions ? 'rotate-180' : ''}`} />
          </button>

          {/* Button 3: Reschedule / Edit */}
          <button
            type="button"
            onClick={() => {
              hapticImpact('light');
              if (onEditLesson) onEditLesson(lesson);
            }}
            className="py-2 px-1 text-center text-xs font-bold rounded-xl border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 transition-all active:scale-95 flex items-center justify-center gap-1"
          >
            <CalendarClock className="w-3.5 h-3.5 text-blue-600" />
            <span>Перенести</span>
          </button>
        </div>

        {/* Quick Miss Options Submenu */}
        {showMissOptions && (
          <div className="grid grid-cols-2 gap-1.5 pt-1 animate-in fade-in duration-150">
            <button
              type="button"
              onClick={handleMissWithMakeup}
              className="py-1.5 px-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95"
            >
              <span>🔄 В отработку (ВС)</span>
            </button>
            <button
              type="button"
              onClick={handleMissNoMakeup}
              className="py-1.5 px-2 bg-rose-50 text-rose-800 border border-rose-200 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 active:scale-95"
            >
              <span>❌ Без отработки</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
