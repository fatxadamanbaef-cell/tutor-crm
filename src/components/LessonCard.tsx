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
  FileText,
  Sparkles,
} from 'lucide-react';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/telegram';
import { isRealNote } from '@/lib/formatters';

export { isRealNote };

interface LessonCardProps {
  lesson: Lesson;
  student?: Student;
  lastCompletedNote?: string;
  timeState?: 'now' | 'next' | null;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
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
  isExpanded,
  onToggleExpand,
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

  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = isExpanded !== undefined ? isExpanded : internalExpanded;

  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(isRealNote(lesson.notes) ? lesson.notes || '' : '');

  const target = student?.monthly_target_lessons || 12;
  const conducted = student?.conducted_this_month || 0;
  const balance = student?.lessons_balance ?? 0;

  const timeParts = (lesson.time_str || '18:00 - 19:30').split(' - ');
  const startTime = timeParts[0] || '18:00';
  const endTime = timeParts[1] || '';

  const hasRealNote = isRealNote(lesson.notes);

  const statusBarClass = isCompleted
    ? 'bg-emerald-500'
    : isPenalty
    ? 'bg-orange-500'
    : isExcused
    ? 'bg-rose-400'
    : 'bg-blue-500';

  const handleCardToggle = () => {
    if (expanded && isEditingNote) {
      setIsEditingNote(false);
    }
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      hapticSelection();
      setInternalExpanded((prev) => !prev);
    }
  };

  const handleCompleted = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticNotification('success');
    if (onSetStatus) {
      onSetStatus(lesson.id, isCompleted ? 'planned' : 'completed');
    } else {
      onToggleStatus(lesson.id);
    }
  };

  const handlePenalty = (e: React.MouseEvent) => {
    e.stopPropagation();
    hapticNotification('warning');
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
      onClick={handleCardToggle}
      className={`w-full text-left select-none cursor-pointer rounded-2xl bg-white border transition-colors duration-150 shadow-2xs overflow-hidden ${
        timeState === 'now'
          ? 'border-blue-500 ring-2 ring-blue-500/15'
          : isCompleted
          ? 'border-emerald-200/80 bg-white'
          : isPenalty
          ? 'border-orange-200/80 bg-white'
          : isExcused
          ? 'border-slate-200/80 bg-slate-50/60 opacity-85'
          : 'border-slate-200/90 hover:border-slate-300'
      }`}
    >
      {/* Live "Now" or "Next" Banner */}
      {timeState === 'now' && (
        <div className="bg-blue-600 text-white px-3 py-1 text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span>Идёт сейчас</span>
          </span>
          <span className="text-blue-100 font-normal text-[11px]">
            {expanded ? 'Свернуть' : 'Детали'}
          </span>
        </div>
      )}
      {timeState === 'next' && isPlanned && (
        <div className="bg-blue-50/90 border-b border-blue-100 text-blue-700 px-3 py-0.5 text-[11px] font-medium flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-blue-600 shrink-0" />
          <span>Ближайший урок</span>
        </div>
      )}

      {/* Compact Main Row */}
      <div className="px-3 py-2.5 flex items-center gap-2.5">
        {/* Left Vertical Status Bar + Time Column */}
        <div className="flex items-stretch gap-2.5 shrink-0 self-stretch">
          <div className={`w-1 rounded-full shrink-0 my-0.5 ${statusBarClass}`} />
          <div className={`w-11 flex flex-col justify-center ${isCompleted ? 'opacity-75' : ''}`}>
            <span className="text-[15px] font-semibold text-slate-900 leading-tight tabular-nums">
              {startTime}
            </span>
            {endTime && (
              <span className="text-xs text-slate-400 leading-tight mt-0.5 tabular-nums">
                {endTime}
              </span>
            )}
          </div>
        </div>

        {/* Center: Student Name + Meta + Optional Single-Line Note Preview */}
        <div className="flex-1 min-w-0">
          <div
            className={`font-semibold text-[15px] text-slate-900 truncate leading-snug ${
              isCompleted ? 'opacity-75' : ''
            }`}
          >
            {lesson.student_name || student?.name || 'Ученик'}
          </div>

          <div className="flex items-center gap-1 text-xs text-slate-500 truncate tabular-nums mt-0.5">
            <span
              className={
                balance <= 0
                  ? 'text-rose-600 font-semibold'
                  : balance <= 2
                  ? 'text-amber-700 font-semibold'
                  : 'text-slate-500'
              }
            >
              Баланс: {balance} ур.
            </span>
            <span className="text-slate-300">·</span>
            <span>
              {conducted}/{target}
            </span>
          </div>

          {!expanded && hasRealNote && (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] text-amber-700 min-w-0">
              <FileText className="w-3 h-3 text-amber-600 shrink-0" />
              <span className="truncate">{lesson.notes}</span>
            </div>
          )}
        </div>

        {/* Right Edge: Quick Confirm Button (collapsed planned only) OR Status Badge */}
        {(!isPlanned || !expanded) && (
          <div className="shrink-0 flex items-center">
            {isPlanned ? (
              <button
                type="button"
                onClick={handleCompleted}
                className="h-8 px-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 active:bg-emerald-100 text-xs font-semibold inline-flex items-center gap-1 shadow-2xs active:scale-95 transition-all"
                title="Проведён (-1 баланс)"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Был</span>
              </button>
            ) : (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                  isCompleted
                    ? 'bg-emerald-100/80 text-emerald-700 border-transparent'
                    : isPenalty
                    ? 'bg-orange-100/80 text-orange-700 border-transparent'
                    : 'bg-rose-100/80 text-rose-700 border-transparent'
                }`}
              >
                {isCompleted && (
                  <>
                    <Check className="w-3 h-3 stroke-[2.5]" />
                    <span>Был</span>
                  </>
                )}
                {isPenalty && (
                  <>
                    <Flame className="w-3 h-3" />
                    <span>Сгорел</span>
                  </>
                )}
                {isExcused && (
                  <>
                    <Ban className="w-3 h-3" />
                    <span>Отмена</span>
                  </>
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Smoothly Expanding Bottom Panel */}
      <div
        className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${
          expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
        aria-hidden={!expanded}
        inert={!expanded}
      >
        <div className="overflow-hidden min-h-0">
          <div
            className="px-3 pb-2.5 pt-2 border-t border-slate-100 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Full Homework / Lesson Note */}
            {hasRealNote && !isEditingNote && (
              <div className="text-xs text-slate-700 bg-amber-50/70 border border-amber-200/60 rounded-xl px-2.5 py-2 flex items-start gap-1.5">
                <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span className="font-medium leading-snug break-words">{lesson.notes}</span>
              </div>
            )}

            {/* Previous Lesson Note Context */}
            {!hasRealNote && lastCompletedNote && !isEditingNote && isPlanned && (
              <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200/60 rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
                <History className="w-3 h-3 text-slate-400 shrink-0" />
                <span className="truncate">
                  Прошлый раз: <b className="font-semibold text-slate-700">{lastCompletedNote}</b>
                </span>
              </div>
            )}

            {/* Miss Reason */}
            {lesson.miss_reason && !isPlanned && (
              <div className="text-[11px] text-slate-500 font-medium">
                Причина: <span className="text-slate-700 font-semibold">{lesson.miss_reason}</span>
              </div>
            )}

            {/* Inline Note Editor OR Toolbar (+ ДЗ / Профиль) */}
            {isEditingNote ? (
              <form
                onSubmit={handleSaveInlineNote}
                className="flex items-center gap-1.5"
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
                  className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold shrink-0 active:scale-95"
                >
                  Ок
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingNote(false)}
                  className="px-2.5 py-2 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold shrink-0 active:scale-95"
                >
                  Отмена
                </button>
              </form>
            ) : (
              <div className="flex items-center justify-between gap-2">
                {onUpdateNote ? (
                  <button
                    type="button"
                    onClick={() => {
                      hapticImpact('light');
                      setNoteDraft(hasRealNote ? lesson.notes || '' : '');
                      setIsEditingNote(true);
                    }}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50/70 hover:bg-blue-50 active:scale-95 transition-all"
                  >
                    <PenLine className="w-3.5 h-3.5" />
                    <span>{hasRealNote ? 'Изменить ДЗ' : '+ ДЗ'}</span>
                  </button>
                ) : (
                  <span />
                )}

                {student && onOpenStudent && (
                  <button
                    type="button"
                    onClick={() => {
                      hapticImpact('light');
                      onOpenStudent(student);
                    }}
                    className="text-xs font-semibold text-slate-600 hover:text-blue-600 inline-flex items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-slate-100 active:scale-95 transition-all"
                  >
                    <span>Профиль ученика</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                )}
              </div>
            )}

            {/* Status Switcher Row */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCompleted}
                className={`flex-1 py-2 px-2 text-center text-xs font-semibold rounded-xl border transition-all active:scale-95 flex items-center justify-center gap-1 ${
                  isCompleted
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                    : 'bg-emerald-50/70 text-emerald-800 border-emerald-200/80 hover:bg-emerald-100/80'
                }`}
                title="Проведён (-1 с баланса)"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>Был</span>
              </button>

              <button
                type="button"
                onClick={handlePenalty}
                className={`flex-1 py-2 px-2 text-center text-xs font-semibold rounded-xl border transition-all active:scale-95 flex items-center justify-center gap-1 ${
                  isPenalty
                    ? 'bg-orange-600 text-white border-orange-600 shadow-xs'
                    : 'bg-orange-50/70 text-orange-800 border-orange-200/80 hover:bg-orange-100/80'
                }`}
                title="Пропуск без предупреждения (-1 с баланса)"
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Сгорел</span>
              </button>

              <button
                type="button"
                onClick={handleExcused}
                className={`flex-1 py-2 px-2 text-center text-xs font-semibold rounded-xl border transition-all active:scale-95 flex items-center justify-center gap-1 ${
                  isExcused
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-rose-50/70 text-rose-800 border-rose-200/80 hover:bg-rose-100/80'
                }`}
                title="Уважительная отмена (баланс сохраняется)"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Отмена</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  if (onEditLesson) onEditLesson(lesson);
                }}
                className="w-9 h-9 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center shrink-0"
                title="Перенести или изменить урок"
                aria-label="Перенести или изменить урок"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
