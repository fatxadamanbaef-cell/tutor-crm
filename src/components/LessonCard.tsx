'use client';

import React, { useState } from 'react';
import { Lesson, Student, LessonStatus } from '@/types';
import {
  Check,
  Flame,
  Ban,
  ChevronRight,
  SlidersHorizontal,
  PenLine,
  History,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/telegram';

interface LessonCardProps {
  lesson: Lesson;
  student?: Student;
  lastCompletedNote?: string;
  timeState?: 'now' | 'next' | null;
  onToggleStatus: (id: string) => void;
  onSetStatus?: (id: string, status: LessonStatus, missReason?: string) => void;
  onDeleteLesson?: (id: string) => void;
  onEditLesson?: (lesson: Lesson) => void;
  onOpenStudent?: (student: Student) => void;
  onUpdateNote?: (lessonId: string, notes: string) => Promise<void> | void;
}

export const LessonCard: React.FC<LessonCardProps> = React.memo(function LessonCardInner({
  lesson,
  student,
  lastCompletedNote,
  timeState,
  onToggleStatus,
  onSetStatus,
  onEditLesson,
  onOpenStudent,
  onUpdateNote,
}) {
  const isCompleted = lesson.status === 'completed';
  const isPenalty =
    lesson.status === 'missed_penalty' || (lesson.status === 'missed' && !lesson.needs_makeup);
  const isExcused = lesson.status === 'missed_excused';
  const isPlanned = lesson.status === 'planned' || (lesson.status as string) === 'scheduled';

  // For already marked lessons, collapse the 3 status buttons by default to save vertical space
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(lesson.notes || '');

  const studentColor = student?.color || '#3B82F6';
  const target = student?.monthly_target_lessons || 12;
  const conducted = student?.conducted_this_month || 0;
  const balance = student?.lessons_balance ?? 0;

  const timeParts = (lesson.time_str || '18:00 - 19:30').split(' - ');
  const startTime = timeParts[0] || '18:00';
  const endTime = timeParts[1] || '';

  // Filter out auto-generated schedule template notes so we only show meaningful notes
  const hasCustomNote = Boolean(
    lesson.notes &&
      !lesson.notes.startsWith('Регулярный урок') &&
      !lesson.notes.startsWith('Авто-слот')
  );

  const handleCompleted = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticNotification('success');
    setShowStatusPicker(false);
    if (onSetStatus) {
      onSetStatus(lesson.id, isCompleted ? 'planned' : 'completed');
    } else {
      onToggleStatus(lesson.id);
    }
  };

  const handlePenalty = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticNotification('warning');
    setShowStatusPicker(false);
    if (onSetStatus) {
      onSetStatus(
        lesson.id,
        isPenalty ? 'planned' : 'missed_penalty',
        'Пропуск без предупреждения'
      );
    }
  };

  const handleExcused = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticSelection();
    setShowStatusPicker(false);
    if (onSetStatus) {
      onSetStatus(lesson.id, isExcused ? 'planned' : 'missed_excused', 'Уважительная отмена');
    }
  };

  const handleSaveInlineNote = async (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    hapticNotification('success');
    setIsEditingNote(false);
    if (onUpdateNote) {
      await onUpdateNote(lesson.id, noteDraft.trim());
    }
  };

  return (
    <div
      onClick={() => onEditLesson && onEditLesson(lesson)}
      className={`w-full text-left select-none cursor-pointer rounded-2xl bg-white border transition-all duration-150 active:scale-[0.99] shadow-xs overflow-hidden ${
        timeState === 'now'
          ? 'border-blue-500 ring-2 ring-blue-500/15'
          : isCompleted
          ? 'border-emerald-200/90 bg-white'
          : isPenalty
          ? 'border-orange-200/90 bg-white'
          : isExcused
          ? 'border-rose-200/80 bg-slate-50/60 opacity-85'
          : 'border-slate-200/90 hover:border-slate-300'
      }`}
    >
      {/* Live "Now" or "Next" Banner */}
      {timeState === 'now' && (
        <div className="bg-blue-600 text-white px-3.5 py-1 text-[11px] font-bold flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>Идёт сейчас</span>
          </span>
          <span className="text-blue-100 font-medium text-[10px]">Нажмите для деталей</span>
        </div>
      )}
      {timeState === 'next' && isPlanned && (
        <div className="bg-blue-50/90 border-b border-blue-100 text-blue-700 px-3.5 py-1 text-[11px] font-bold flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-blue-600" />
          <span>Ближайший урок по расписанию</span>
        </div>
      )}

      <div className="p-3.5 space-y-2.5">
        {/* Main Row: Time Column + Student Info + Status/Balance */}
        <div className="flex items-start gap-3">
          {/* Left Time Column with Student Color Accent */}
          <div className="flex items-stretch gap-2.5 shrink-0">
            <div
              className="w-1 rounded-full shrink-0 my-0.5"
              style={{ backgroundColor: studentColor }}
            />
            <div className="w-12 flex flex-col justify-center">
              <span className="font-mono text-[15px] font-black text-slate-900 leading-tight tracking-tight">
                {startTime}
              </span>
              {endTime && (
                <span className="font-mono text-[11px] font-semibold text-slate-400 leading-tight mt-0.5">
                  {endTime}
                </span>
              )}
            </div>
          </div>

          {/* Center: Student Name + Context Notes */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              {student && onOpenStudent ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    hapticImpact('light');
                    onOpenStudent(student);
                  }}
                  className="inline-flex items-center gap-0.5 font-extrabold text-[15px] text-slate-900 hover:text-blue-600 active:opacity-70 transition-colors max-w-full text-left leading-snug"
                  title="Открыть карточку ученика"
                >
                  <span className="truncate">{lesson.student_name || student.name}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              ) : (
                <div className="font-extrabold text-[15px] text-slate-900 truncate leading-snug">
                  {lesson.student_name || student?.name || 'Ученик'}
                </div>
              )}

              {/* Right: Status or Balance Pill */}
              <div className="shrink-0 flex items-center gap-1">
                {!isPlanned && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      hapticImpact('light');
                      setShowStatusPicker((prev) => !prev);
                    }}
                    className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-all active:scale-95 ${
                      isCompleted
                        ? 'text-emerald-800 bg-emerald-50 border-emerald-200'
                        : isPenalty
                        ? 'text-orange-800 bg-orange-50 border-orange-200'
                        : 'text-rose-800 bg-rose-50 border-rose-200'
                    }`}
                    title="Нажмите, чтобы изменить статус"
                  >
                    {isCompleted && (
                      <>
                        <Check className="w-3 h-3 stroke-[3] text-emerald-600" />
                        <span>Был</span>
                      </>
                    )}
                    {isPenalty && (
                      <>
                        <Flame className="w-3 h-3 text-orange-600" />
                        <span>Сгорел</span>
                      </>
                    )}
                    {isExcused && (
                      <>
                        <Ban className="w-3 h-3 text-rose-600" />
                        <span>Отмена</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Subtitle Row: Balance + Monthly Progress + Quick Note Trigger */}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span
                className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 ${
                  balance <= 0
                    ? 'bg-rose-50 text-rose-700 border border-rose-200/80 font-extrabold'
                    : balance <= 2
                    ? 'bg-amber-50 text-amber-800 border border-amber-200/80 font-extrabold'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {balance <= 0 && <AlertCircle className="w-3 h-3 text-rose-600 shrink-0" />}
                <span>Баланс: {balance} ур.</span>
              </span>

              <span className="text-[11px] font-medium text-slate-400">
                • {conducted}/{target} в мес.
              </span>

              {onUpdateNote && !isEditingNote && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    hapticImpact('light');
                    setNoteDraft(hasCustomNote ? lesson.notes || '' : '');
                    setIsEditingNote(true);
                  }}
                  className="ml-auto text-[11px] font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-blue-50 active:scale-95"
                >
                  <PenLine className="w-3 h-3" />
                  <span>{hasCustomNote ? 'Изменить ДЗ' : '+ Тема / ДЗ'}</span>
                </button>
              )}
            </div>

            {/* Current Lesson Note or Miss Reason */}
            {hasCustomNote && !isEditingNote && (
              <div className="mt-1.5 text-xs text-slate-700 bg-amber-50/70 border border-amber-200/60 rounded-xl px-2.5 py-1.5 flex items-start gap-1.5">
                <span className="text-amber-600 font-bold shrink-0">📝</span>
                <span className="font-medium leading-snug break-words">{lesson.notes}</span>
              </div>
            )}

            {/* Previous Lesson Note Context (shown when current lesson has no note yet) */}
            {!hasCustomNote && lastCompletedNote && !isEditingNote && isPlanned && (
              <div className="mt-1.5 text-[11px] text-slate-500 bg-slate-50 border border-slate-200/60 rounded-xl px-2.5 py-1 flex items-center gap-1.5">
                <History className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate">
                  Прошлый раз: <b className="font-semibold text-slate-700">{lastCompletedNote}</b>
                </span>
              </div>
            )}

            {lesson.miss_reason && !isPlanned && (
              <div className="text-[11px] text-slate-500 font-medium truncate mt-1">
                Причина: <span className="text-slate-700 font-semibold">{lesson.miss_reason}</span>
              </div>
            )}
          </div>
        </div>

        {/* Inline Quick Note Editor */}
        {isEditingNote && (
          <form
            onSubmit={handleSaveInlineNote}
            onClick={(e) => e.stopPropagation()}
            className="pt-1 flex items-center gap-1.5 animate-in fade-in duration-150"
          >
            <input
              type="text"
              autoFocus
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Тема урока или домашнее задание..."
              className="flex-1 text-xs font-medium text-slate-900 bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 focus:bg-white focus:border-blue-600 focus:outline-hidden"
            />
            <button
              type="submit"
              className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold shrink-0 active:scale-95"
            >
              Ок
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingNote(false);
              }}
              className="px-2.5 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold shrink-0 active:scale-95"
            >
              Отмена
            </button>
          </form>
        )}

        {/* Quick Action Buttons: Shown for Planned lessons OR when user taps status badge to change it */}
        {(isPlanned || showStatusPicker) && (
          <div
            className="pt-2 border-t border-slate-100 flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Button 1: Conducted (Был) */}
            <button
              type="button"
              onClick={handleCompleted}
              className={`flex-1 py-2 px-2 text-center text-xs font-bold rounded-xl border transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                isCompleted
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-emerald-50/70 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100/80'
              }`}
              title="Проведен (-1 с баланса)"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Был</span>
            </button>

            {/* Button 2: Burned / Penalty (Сгорел) */}
            <button
              type="button"
              onClick={handlePenalty}
              className={`flex-1 py-2 px-2 text-center text-xs font-bold rounded-xl border transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                isPenalty
                  ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                  : 'bg-orange-50/70 text-orange-800 border-orange-200/80 hover:bg-orange-100/80'
              }`}
              title="Пропуск без предупреждения (-1 с баланса)"
            >
              <Flame className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Сгорел</span>
            </button>

            {/* Button 3: Excused (Отмена) */}
            <button
              type="button"
              onClick={handleExcused}
              className={`flex-1 py-2 px-2 text-center text-xs font-bold rounded-xl border transition-all active:scale-95 flex items-center justify-center gap-1.5 ${
                isExcused
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-rose-50/70 text-rose-800 border-rose-200/80 hover:bg-rose-100/80'
              }`}
              title="Уважительная отмена (баланс сохраняется)"
            >
              <Ban className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Отмена</span>
            </button>

            {/* Subtle Edit / Reschedule icon button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                hapticImpact('light');
                if (onEditLesson) onEditLesson(lesson);
              }}
              className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center shrink-0"
              title="Перенести или изменить урок"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
