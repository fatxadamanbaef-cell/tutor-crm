'use client';

import React, { useState, useMemo } from 'react';
import { Student, Lesson, LessonStatus } from '@/types';
import { X, Check, Trash2, AlertTriangle, Sparkles, Clock, Flame, Ban, FileText } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { format, addDays, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getTashkentNow } from '@/lib/formatters';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

interface EditLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  lesson: Lesson | null;
  student: Student | null;
  lessons?: Lesson[];
  onSave: (lessonId: string, updates: Partial<Lesson>) => Promise<void>;
  onDelete: (lessonId: string) => Promise<void>;
}

function getDurationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 90;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff >= 15 && diff <= 360 ? diff : 90;
}

function addMinutesToTime(start: string, durationMin: number): string {
  const [sh, sm] = start.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm)) return '17:30';
  const total = (sh * 60 + sm + durationMin) % (24 * 60);
  const eh = Math.floor(total / 60);
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

function parseMinutesRange(timeStr?: string): { start: number; end: number } | null {
  if (!timeStr) return null;
  const parts = timeStr.split(' - ').map((s) => s.trim());
  const [sh, sm] = (parts[0] || '').split(':').map(Number);
  if (isNaN(sh) || isNaN(sm)) return null;
  const start = sh * 60 + sm;
  let end = start + 90;
  if (parts[1]) {
    const [eh, em] = parts[1].split(':').map(Number);
    if (!isNaN(eh) && !isNaN(em)) end = eh * 60 + em;
  }
  return { start, end };
}

export const EditLessonModal: React.FC<EditLessonModalProps> = ({
  isOpen,
  onClose,
  lesson,
  student,
  lessons = [],
  onSave,
  onDelete,
}) => {
  if (!isOpen || !lesson) return null;
  return (
    <EditLessonModalContent
      key={lesson.id}
      lesson={lesson}
      student={student}
      lessons={lessons}
      onClose={onClose}
      onSave={onSave}
      onDelete={onDelete}
    />
  );
};

interface EditLessonModalContentProps {
  lesson: Lesson;
  student: Student | null;
  lessons: Lesson[];
  onClose: () => void;
  onSave: (lessonId: string, updates: Partial<Lesson>) => Promise<void>;
  onDelete: (lessonId: string) => Promise<void>;
}

const EditLessonModalContent: React.FC<EditLessonModalContentProps> = ({
  lesson,
  student,
  lessons,
  onClose,
  onSave,
  onDelete,
}) => {
  const initialParts = (lesson.time_str || '16:00 - 17:30').split(' - ');
  const initialStart = initialParts[0] || '16:00';
  const initialEnd = initialParts[1] || '17:30';
  const rawInitialNotes = lesson.notes || '';
  const initialNotes =
    rawInitialNotes.startsWith('Регулярный урок') || rawInitialNotes.startsWith('Авто-слот')
      ? ''
      : rawInitialNotes;

  const [lessonDate, setLessonDate] = useState(lesson.date.substring(0, 10));
  const [startTime, setStartTime] = useState(initialStart);
  const [endTime, setEndTime] = useState(initialEnd);
  const [durationMin, setDurationMin] = useState(() => getDurationMinutes(initialStart, initialEnd));
  const [notes, setNotes] = useState(initialNotes);
  const [currentStatus, setCurrentStatus] = useState<LessonStatus>(lesson.status || 'planned');
  const [missReason, setMissReason] = useState(lesson.miss_reason || '');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Other active lessons on the selected date (to prevent blind rescheduling conflicts)
  const otherDayLessons = useMemo(() => {
    if (!lessonDate) return [];
    return lessons
      .filter(
        (l) =>
          l.id !== lesson.id &&
          l.date.startsWith(lessonDate) &&
          l.status !== 'missed_excused'
      )
      .sort((a, b) => (a.time_str || '').localeCompare(b.time_str || ''));
  }, [lessons, lessonDate, lesson]);

  // Check if selected startTime - endTime conflicts with any other lesson on that day
  const conflictingLesson = useMemo(() => {
    const currentRange = parseMinutesRange(`${startTime} - ${endTime}`);
    if (!currentRange) return null;
    for (const other of otherDayLessons) {
      const otherRange = parseMinutesRange(other.time_str);
      if (!otherRange) continue;
      if (currentRange.start < otherRange.end && currentRange.end > otherRange.start) {
        return other;
      }
    }
    return null;
  }, [otherDayLessons, startTime, endTime]);

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    setEndTime(addMinutesToTime(newStart, durationMin));
  };

  const handleEndTimeChange = (newEnd: string) => {
    setEndTime(newEnd);
    setDurationMin(getDurationMinutes(startTime, newEnd));
  };

  const handleSelectDuration = (mins: number) => {
    hapticImpact('light');
    setDurationMin(mins);
    setEndTime(addMinutesToTime(startTime, mins));
  };

  const handleSave = async () => {
    hapticImpact('light');
    const timeStr = `${startTime} - ${endTime}`;

    await onSave(lesson.id, {
      date: `${lessonDate}T${startTime}:00+05:00`,
      time_str: timeStr,
      notes: notes.trim(),
      status: currentStatus,
      miss_reason:
        currentStatus === 'missed_penalty' ||
        currentStatus === 'missed_excused' ||
        currentStatus === 'missed'
          ? missReason.trim()
          : undefined,
      needs_makeup: false,
    });
    hapticNotification('success');
    onClose();
  };

  const isMissedState =
    currentStatus === 'missed_penalty' ||
    currentStatus === 'missed_excused' ||
    currentStatus === 'missed';

  return (
    <div className="fixed inset-0 z-[60] bg-[#F7F5F0] flex flex-col animate-in slide-in-from-bottom duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pb-2.5 bg-white border-b border-[#E7E2D8]">
        <button
          type="button"
          aria-label="Закрыть"
          onClick={() => {
            hapticImpact('light');
            onClose();
          }}
          className="touch-hit w-9 h-9 flex items-center justify-center rounded-full bg-[#F2EFE9] text-[#44403C] active:scale-90"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="text-center">
          <h2 className="text-sm font-bold text-[#1C1917]">Урок и перенос</h2>
          <p className="text-[11px] font-semibold text-[#78716C]">
            {lesson.student_name || student?.name}
          </p>
        </div>
        <button
          onClick={handleSave}
          className="h-9 px-3.5 flex items-center justify-center gap-1 rounded-full bg-[#2F6FED] text-white text-xs font-semibold shadow-xs active:scale-90"
        >
          <Check className="w-4 h-4 stroke-[2.5]" />
          <span>Готово</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3.5 space-y-3 pb-24">
        {/* Student Summary Header */}
        <div className="bento-card rounded-2xl p-3.5 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[#1C1917] truncate">
              {lesson.student_name || student?.name}
            </h3>
            <p className="text-xs text-[#78716C] font-medium mt-0.5 tabular-nums">
              Ставка: {(student?.lesson_rate || 300000).toLocaleString('ru-RU')} сум · Норма:{' '}
              {student?.monthly_target_lessons || 12} ур.
            </p>
          </div>
          <span
            className={`text-xs font-semibold px-2.5 py-0.5 rounded-full shrink-0 border tabular-nums ${
              (student?.lessons_balance ?? 0) <= 0
                ? 'bg-[#FDECE8] text-[#B93815] border-[#F6BFA9]'
                : (student?.lessons_balance ?? 0) <= 2
                ? 'bg-[#FEF6E7] text-amber-800 border-[#F3DCAC]'
                : 'bg-[#F2EFE9] text-[#44403C] border-[#E7E2D8]'
            }`}
          >
            Баланс: {student?.lessons_balance ?? 0} ур.
          </span>
        </div>

        {/* Status Selector (3-State Attendance + Planned) */}
        <div className="bento-card rounded-2xl p-4 space-y-2.5">
          <label className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wide block">
            Статус занятия
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                id: 'completed',
                label: 'Проведён (-1)',
                Icon: Check,
                activeClass: 'bg-emerald-600 text-white border-emerald-600',
              },
              {
                id: 'planned',
                label: 'По плану',
                Icon: Clock,
                activeClass: 'bg-[#2F6FED] text-white border-[#2F6FED]',
              },
              {
                id: 'missed_penalty',
                label: 'Сгорел (-1)',
                Icon: Flame,
                activeClass: 'bg-[#E85D3F] text-white border-[#E85D3F]',
              },
              {
                id: 'missed_excused',
                label: 'Отмена (0)',
                Icon: Ban,
                activeClass: 'bg-rose-600 text-white border-rose-600',
              },
            ].map((st) => {
              const Icon = st.Icon;
              const isSelected =
                currentStatus === st.id ||
                (st.id === 'missed_penalty' && currentStatus === 'missed');
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    setCurrentStatus(st.id as LessonStatus);
                  }}
                  className={`py-2.5 px-2 text-center text-xs font-semibold rounded-xl border transition-colors active:scale-95 flex items-center justify-center gap-1.5 ${
                    isSelected
                      ? `${st.activeClass} shadow-xs`
                      : 'bg-[#F7F5F0] text-[#44403C] border-[#E7E2D8] hover:bg-[#EFEBE2]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{st.label}</span>
                </button>
              );
            })}
          </div>

          {/* If missed/cancelled, show reason input */}
          {isMissedState && (
            <div className="pt-2.5 space-y-2 border-t border-[#EFECE5]">
              <label className="text-[11px] font-semibold text-[#78716C] uppercase block">
                Причина пропуска / отмены
              </label>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'Болеет',
                  'Семейные обстоятельства',
                  'Уехал',
                  'Предупредил заранее',
                  'Не вышел на связь',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setMissReason(chip)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                      missReason === chip
                        ? 'bg-[#1C1917] text-white'
                        : 'bg-[#F2EFE9] hover:bg-[#E7E2D8] text-[#44403C]'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={missReason}
                onChange={(e) => setMissReason(e.target.value)}
                placeholder="Или введите свою причину..."
                className="w-full text-xs font-semibold text-[#1C1917] bg-[#F7F5F0] px-3 py-2 rounded-xl border border-[#E7E2D8] focus:bg-white focus:border-[#2F6FED] focus:outline-hidden"
              />
            </div>
          )}
        </div>

        {/* Notes / Homework */}
        <div className="bento-card rounded-2xl p-4 space-y-2">
          <label className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wide flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
            <span>Тема урока / Домашнее задание</span>
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Что прошли сегодня, что задано на следующий урок..."
            className="w-full text-xs font-medium text-[#1C1917] bg-[#F7F5F0] px-3 py-2.5 rounded-xl border border-[#E7E2D8] focus:bg-white focus:border-[#2F6FED] focus:outline-hidden"
          />
        </div>

        {/* Date & Time Settings with Live Day Occupancy Preview */}
        <div className="bento-card rounded-2xl p-4 space-y-3.5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold text-[#78716C] uppercase tracking-wide">
                Дата и перенос
              </label>
              {lessonDate && (
                <span className="text-[11px] font-semibold text-[#2F6FED]">
                  {format(parseISO(`${lessonDate}T12:00:00+05:00`), 'd MMMM, EEEE', { locale: ru })}
                </span>
              )}
            </div>
            <input
              type="date"
              value={lessonDate}
              onChange={(e) => {
                const val = e.target.value;
                setLessonDate(val);
                if (currentStatus !== 'planned') {
                  setCurrentStatus('planned');
                }
              }}
              className="w-full text-xs font-semibold text-[#1C1917] bg-[#F7F5F0] px-3 py-2.5 rounded-xl border border-[#E7E2D8] focus:bg-white focus:border-[#2F6FED] focus:outline-hidden"
            />

            {/* Quick Reschedule Shortcuts */}
            <div className="grid grid-cols-4 gap-1.5 pt-2">
              {[
                { label: 'Сегодня', offset: 0 },
                { label: 'Завтра', offset: 1 },
                { label: '+2 дня', offset: 2 },
                { label: '+1 нед.', offset: 7 },
              ].map((btn) => {
                const targetStr = format(addDays(getTashkentNow(), btn.offset), 'yyyy-MM-dd');
                const isSelectedDate = lessonDate === targetStr;
                return (
                  <button
                    key={btn.label}
                    type="button"
                    onClick={() => {
                      hapticImpact('light');
                      setLessonDate(targetStr);
                      setCurrentStatus('planned');
                    }}
                    className={`py-1.5 px-2 text-[11px] font-semibold rounded-xl border transition-colors active:scale-95 ${
                      isSelectedDate
                        ? 'bg-[#2F6FED] text-white border-[#2F6FED]'
                        : 'bg-[#F7F5F0] text-[#44403C] border-[#E7E2D8] hover:bg-[#EFEBE2]'
                    }`}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Occupancy Preview of Selected Date */}
          <div className="p-2.5 rounded-xl bg-[#F7F5F0] border border-[#E7E2D8] space-y-1.5">
            <span className="text-[10px] font-semibold text-[#78716C] uppercase block">
              Занятость на выбранный день ({otherDayLessons.length} ур.):
            </span>
            {otherDayLessons.length === 0 ? (
              <div className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" />
                <span>День полностью свободен</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {otherDayLessons.map((ol) => (
                  <span
                    key={ol.id}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-white border border-[#E7E2D8] text-[#44403C]"
                  >
                    <b className="tabular-nums text-[#1C1917]">{ol.time_str}</b> ·{' '}
                    {ol.student_name || 'Ученик'}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Time & Auto-Duration Controls */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-semibold text-[#78716C] uppercase block mb-1">
                  Начало
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  className="w-full text-xs font-semibold tabular-nums text-[#1C1917] bg-[#F7F5F0] px-3 py-2.5 rounded-xl border border-[#E7E2D8] focus:bg-white focus:border-[#2F6FED] focus:outline-hidden"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[#78716C] uppercase block mb-1">
                  Конец ({durationMin} мин)
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => handleEndTimeChange(e.target.value)}
                  className="w-full text-xs font-semibold tabular-nums text-[#1C1917] bg-[#F7F5F0] px-3 py-2.5 rounded-xl border border-[#E7E2D8] focus:bg-white focus:border-[#2F6FED] focus:outline-hidden"
                />
              </div>
            </div>

            {/* Quick Duration Pills */}
            <div className="flex items-center gap-1.5">
              {[45, 60, 90, 120].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleSelectDuration(d)}
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-semibold border transition-colors active:scale-95 ${
                    durationMin === d
                      ? 'bg-[#1C1917] text-white border-[#1C1917]'
                      : 'bg-[#F7F5F0] text-[#57534E] border-[#E7E2D8]'
                  }`}
                >
                  {d} мин
                </button>
              ))}
            </div>

            {/* Conflict Warning */}
            {conflictingLesson && (
              <div className="p-2.5 rounded-xl bg-[#FEF6E7] border border-[#F3DCAC] text-amber-950 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Внимание: накладка с уроком «{conflictingLesson.student_name}» (
                  {conflictingLesson.time_str})
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Save & Delete Actions */}
        <div className="space-y-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            className="w-full py-3.5 rounded-2xl bg-[#2F6FED] hover:bg-[#255CE0] text-white text-xs font-semibold shadow-sm flex items-center justify-center gap-1.5 active:scale-98 transition-colors"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Сохранить изменения</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDeleteConfirmOpen(true)}
            className="w-full py-3 rounded-2xl bg-[#FDECE8] text-[#B93815] text-xs font-semibold border border-[#F6BFA9] flex items-center justify-center gap-1.5 active:scale-98"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>Удалить урок из расписания</span>
          </button>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        danger
        title="Удалить урок?"
        description="Если урок был списан с баланса, +1 урок автоматически вернётся ученику."
        confirmLabel="Удалить"
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={async () => {
          setIsDeleteConfirmOpen(false);
          await onDelete(lesson.id);
          onClose();
        }}
      />
    </div>
  );
};
