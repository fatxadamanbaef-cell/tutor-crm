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

  const target = student?.cycle_total_lessons || student?.monthly_target_lessons || 12;
  const conducted = student?.cycle_used_lessons ?? student?.conducted_this_month ?? 0;
  const balance = student?.lessons_balance ?? 0;

  const timeParts = (lesson.time_str || '18:00 - 19:30').split(' - ');
  const startTime = timeParts[0] || '18:00';
  const endTime = timeParts[1] || '';

  const hasRealNote = isRealNote(lesson.notes);

  const studentName = lesson.student_name || student?.name || 'Ученик';
  const avatarColor = student?.color || '#2F6FED';
  const avatarInitial = studentName.trim().charAt(0).toUpperCase() || 'У';

  const statusBarClass = isCompleted
    ? 'bg-emerald-500'
    : isPenalty
    ? 'bg-[#E85D3F]'
    : isExcused
    ? 'bg-rose-400'
    : 'bg-[#2F6FED]';

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
      className={`w-full text-left select-none cursor-pointer rounded-2xl bento-card-soft border transition-colors duration-150 overflow-hidden ${
        timeState === 'now'
          ? 'bg-[#F4F8FF] border-[#2F6FED]/45 ring-1 ring-[#2F6FED]/15'
          : timeState === 'next' && isPlanned
          ? 'bg-white border-[#2F6FED]/25'
          : isCompleted
          ? 'border-emerald-200/80 bg-white'
          : isPenalty
          ? 'border-[#E85D3F]/35 bg-white'
          : isExcused
          ? 'border-[#E7E2D8] bg-[#F5F3EE] opacity-80'
          : 'border-[#E7E2D8]/90 hover:border-[#D6CFC2]'
      }`}
    >
      {/* Compact Main Row (~52-56px height so 6-8 lessons fit on 1 viewport) */}
      <div className="px-2.5 py-2 flex items-center gap-2">
        {/* Left Vertical Status Bar + Compact Time Column */}
        <div className="flex items-stretch gap-2 shrink-0 self-stretch">
          <div className={`w-1 rounded-full shrink-0 my-0.5 ${statusBarClass}`} />
          <div className={`w-[40px] flex flex-col justify-center ${isCompleted ? 'opacity-75' : ''}`}>
            <span className="text-[13px] font-bold text-[#1C1917] leading-tight tabular-nums">
              {startTime}
            </span>
            {endTime && (
              <span className="text-[10px] text-[#78716C] leading-tight tabular-nums">
                {endTime}
              </span>
            )}
          </div>
        </div>

        {/* Soft Pastel Student Avatar */}
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
            isCompleted ? 'opacity-80' : ''
          }`}
          style={{
            backgroundColor: `${avatarColor}1F`,
            color: avatarColor,
          }}
          aria-hidden="true"
        >
          {avatarInitial}
        </div>

        {/* Center: Student Name + Inline Live Tag + Compact Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className={`font-semibold text-[13.5px] text-[#1C1917] truncate leading-tight ${
                isCompleted ? 'opacity-75' : ''
              }`}
            >
              {studentName}
            </span>

            {timeState === 'now' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-[#2F6FED] text-white text-[9.5px] font-semibold leading-none shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-white motion-safe:animate-pulse" />
                <span>Сейчас</span>
              </span>
            )}

            {timeState === 'next' && isPlanned && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#EEF3FE] text-[#2F6FED] text-[9.5px] font-semibold leading-none shrink-0">
                Далее
              </span>
            )}

            {!expanded && hasRealNote && (
              <FileText
                className="w-3 h-3 text-amber-600 shrink-0"
                aria-label="Есть заметка или ДЗ"
              />
            )}
          </div>

          <div className="flex items-center gap-1 text-[11px] text-[#78716C] truncate tabular-nums leading-tight mt-0.5">
            <span
              className={
                balance <= 0
                  ? 'text-[#B93815] font-semibold'
                  : balance <= 2
                  ? 'text-amber-700 font-semibold'
                  : 'text-[#78716C]'
              }
            >
              {balance} ур.
            </span>
            <span className="text-[#D6CFC2]">·</span>
            <span>
              {conducted}/{target}
            </span>
          </div>
        </div>

        {/* Right Edge: Compact Pill Quick Confirm OR Status Badge */}
        {(!isPlanned || !expanded) && (
          <div className="shrink-0 flex items-center">
            {isPlanned ? (
              <button
                type="button"
                onClick={handleCompleted}
                className="touch-hit h-7 px-2.5 rounded-full bg-[#E7F7F0] hover:bg-[#D1F0E2] border border-emerald-200/80 text-emerald-800 text-[11px] font-semibold inline-flex items-center gap-1 active:scale-95 transition-colors"
                title="Проведён (-1 баланс)"
              >
                <Check className="w-3 h-3 stroke-[2.5]" aria-hidden="true" />
                <span>Был</span>
              </button>
            ) : (
              <span
                className={`inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${
                  isCompleted
                    ? 'bg-emerald-100/80 text-emerald-800'
                    : isPenalty
                    ? 'bg-[#FDECE8] text-[#B93815]'
                    : 'bg-rose-100/80 text-rose-700'
                }`}
              >
                {isCompleted && (
                  <>
                    <Check className="w-3 h-3 stroke-[2.5]" aria-hidden="true" />
                    <span>Был</span>
                  </>
                )}
                {isPenalty && (
                  <>
                    <Flame className="w-3 h-3" aria-hidden="true" />
                    <span>Сгорел</span>
                  </>
                )}
                {isExcused && (
                  <>
                    <Ban className="w-3 h-3" aria-hidden="true" />
                    <span>Отмена</span>
                  </>
                )}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Conditionally Mounted Bottom Panel (eliminates layout reflow & unused DOM nodes on mobile WebView) */}
      {expanded && (
        <div
          className="px-2.5 pb-2.5 pt-2 border-t border-[#EFECE5] space-y-2"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Full Homework / Lesson Note */}
          {hasRealNote && !isEditingNote && (
            <div className="text-xs text-[#44403C] bg-[#FFF9EB] border border-[#F3DCAC] rounded-xl px-2.5 py-2 flex items-start gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <span className="font-medium leading-snug break-words">{lesson.notes}</span>
            </div>
          )}

          {/* Previous Lesson Note Context */}
          {!hasRealNote && lastCompletedNote && !isEditingNote && isPlanned && (
            <div className="text-[11px] text-[#78716C] bg-[#F7F5F0] border border-[#E7E2D8] rounded-xl px-2.5 py-1.5 flex items-center gap-1.5">
              <History className="w-3 h-3 text-[#8C857B] shrink-0" />
              <span className="truncate">
                Прошлый раз: <b className="font-semibold text-[#1C1917]">{lastCompletedNote}</b>
              </span>
            </div>
          )}

          {/* Miss Reason */}
          {lesson.miss_reason && !isPlanned && (
            <div className="text-[11px] text-[#78716C] font-medium">
              Причина: <span className="text-[#1C1917] font-semibold">{lesson.miss_reason}</span>
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
                className="flex-1 text-xs font-medium text-[#1C1917] bg-[#F7F5F0] border border-[#D6CFC2] rounded-xl px-3 py-2 focus:bg-white focus:border-[#2F6FED] focus:outline-hidden"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-[#2F6FED] text-white text-xs font-semibold shrink-0 active:scale-95"
              >
                Ок
              </button>
              <button
                type="button"
                onClick={() => setIsEditingNote(false)}
                className="px-2.5 py-2 rounded-xl bg-[#F2EFE9] text-[#57534E] text-xs font-semibold shrink-0 active:scale-95"
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
                  className="text-xs font-semibold text-[#2F6FED] hover:text-[#255CE0] inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#EEF3FE] hover:bg-[#E2EBFC] active:scale-95 transition-colors"
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
                  className="text-xs font-semibold text-[#57534E] hover:text-[#2F6FED] inline-flex items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-[#F2EFE9] active:scale-95 transition-colors"
                >
                  <span>Профиль ученика</span>
                  <ChevronRight className="w-3.5 h-3.5 text-[#8C857B]" />
                </button>
              )}
            </div>
          )}

          {/* Status Switcher Row */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleCompleted}
              className={`touch-hit flex-1 py-2 px-2 text-center text-xs font-semibold rounded-xl border transition-colors active:scale-95 flex items-center justify-center gap-1 ${
                isCompleted
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                  : 'bg-[#E7F7F0] text-emerald-800 border-emerald-200/80 hover:bg-[#D1F0E2]'
              }`}
              title="Проведён (-1 с баланса)"
            >
              <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
              <span>Был</span>
            </button>

            <button
              type="button"
              onClick={handlePenalty}
              className={`touch-hit flex-1 py-2 px-2 text-center text-xs font-semibold rounded-xl border transition-colors active:scale-95 flex items-center justify-center gap-1 ${
                isPenalty
                  ? 'bg-[#E85D3F] text-white border-[#E85D3F] shadow-xs'
                  : 'bg-[#FDECE8] text-[#B93815] border-[#F6BFA9]/80 hover:bg-[#FADCD4]'
              }`}
              title="Пропуск без предупреждения (-1 с баланса)"
            >
              <Flame className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Сгорел</span>
            </button>

            <button
              type="button"
              onClick={handleExcused}
              className={`touch-hit flex-1 py-2 px-2 text-center text-xs font-semibold rounded-xl border transition-colors active:scale-95 flex items-center justify-center gap-1 ${
                isExcused
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-rose-50/80 text-rose-800 border-rose-200/80 hover:bg-rose-100/80'
              }`}
              title="Уважительная отмена (баланс сохраняется)"
            >
              <Ban className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Отмена</span>
            </button>

            <button
              type="button"
              onClick={() => {
                hapticImpact('light');
                if (onEditLesson) onEditLesson(lesson);
              }}
              className="touch-hit w-9 h-9 rounded-xl border border-[#E7E2D8] bg-[#F2EFE9] text-[#57534E] hover:bg-[#EAE5DC] transition-colors active:scale-95 flex items-center justify-center shrink-0"
              title="Перенести или изменить урок"
              aria-label="Перенести или изменить урок"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
