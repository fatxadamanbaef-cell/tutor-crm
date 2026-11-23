'use client';

import React, { useState, useMemo } from 'react';
import { Student, Lesson, LessonStatus } from '@/types';
import { X, Check, Trash2, AlertTriangle, Sparkles } from 'lucide-react';
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
    <div className="fixed inset-0 z-[60] bg-[#f4f5f8] flex flex-col animate-in slide-in-from-bottom duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe pb-3 bg-white border-b border-slate-200">
        <button
          type="button"
          aria-label="Закрыть"
          onClick={() => {
            hapticImpact('light');
            onClose();
          }}
          className="touch-hit w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 text-slate-700 active:scale-90"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="text-center">
          <h2 className="text-sm font-bold text-slate-900">Урок и перенос</h2>
          <p className="text-[11px] font-semibold text-slate-500">
            {lesson.student_name || student?.name}
          </p>
        </div>
        <button
          onClick={handleSave}
          className="h-9 px-3.5 flex items-center justify-center gap-1 rounded-full bg-blue-600 text-white text-xs font-bold shadow-sm shadow-blue-500/20 active:scale-90"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          <span>Готово</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 pb-24">
        {/* Student Summary Header */}
        <div className="bg-white rounded-2xl p-3.5 shadow-2xs border border-slate-200/80 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate">
              {lesson.student_name || student?.name}
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5 tabular-nums">
              Ставка: {(student?.lesson_rate || 300000).toLocaleString('ru-RU')} сум • Норма:{' '}
              {student?.monthly_target_lessons || 12} ур.
            </p>
          </div>
          <span
            className={`text-xs font-semibold px-2.5 py-1 rounded-xl shrink-0 border tabular-nums ${
              (student?.lessons_balance ?? 0) <= 0
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : (student?.lessons_balance ?? 0) <= 2
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            Баланс: {student?.lessons_balance ?? 0} ур.
          </span>
        </div>

        {/* Status Selector (3-State Attendance + Planned) */}
        <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200/80 space-y-3">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">
            Статус занятия
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              {
                id: 'completed',
                label: '✅ Проведён (-1)',
                activeClass: 'bg-emerald-600 text-white border-emerald-600',
              },
              {
                id: 'planned',
                label: '⏳ По плану',
                activeClass: 'bg-blue-600 text-white border-blue-600',
              },
              {
                id: 'missed_penalty',
                label: '🔥 Сгорел (-1)',
                activeClass: 'bg-orange-600 text-white border-orange-600',
              },
              {
                id: 'missed_excused',
                label: '🛑 Отмена (0)',
                activeClass: 'bg-rose-600 text-white border-rose-600',
              },
            ].map((st) => {
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
                  className={`py-2.5 px-2 text-center text-xs font-bold rounded-xl border transition-all active:scale-95 ${
                    isSelected
                      ? `${st.activeClass} shadow-xs`
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {st.label}
                </button>
              );
            })}
          </div>

          {/* If missed/cancelled, show reason input */}
          {isMissedState && (
            <div className="pt-2.5 space-y-2 border-t border-slate-100">
              <label className="text-[11px] font-bold text-slate-500 uppercase block">
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
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      missReason === chip
                        ? 'bg-slate-800 text-white'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
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
                className="w-full text-xs font-semibold text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-hidden"
              />
            </div>
          )}
        </div>

        {/* Notes / Homework (Placed prominently so tutor can quickly write homework) */}
        <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200/80 space-y-2">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide block">
            📝 Тема урока / Домашнее задание
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Что прошли сегодня, что задано на следующий урок..."
            className="w-full text-xs font-medium text-slate-900 bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-hidden"
          />
        </div>

        {/* Date & Time Settings with Live Day Occupancy Preview */}
        <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200/80 space-y-3.5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                Дата и перенос
              </label>
              {lessonDate && (
                <span className="text-[11px] font-bold text-blue-600">
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
              className="w-full text-xs font-bold text-slate-900 bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-hidden"
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
                    className={`py-1.5 px-2 text-[11px] font-bold rounded-xl border transition-all active:scale-95 ${
                      isSelectedDate
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Occupancy Preview of Selected Date */}
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase block">
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
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-white border border-slate-200 text-slate-700"
                  >
                    <b className="tabular-nums text-slate-900">{ol.time_str}</b> ·{' '}
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
                <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                  Начало
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  className="w-full text-xs font-semibold tabular-nums text-slate-900 bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                  Конец ({durationMin} мин)
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => handleEndTimeChange(e.target.value)}
                  className="w-full text-xs font-semibold tabular-nums text-slate-900 bg-slate-50 px-3 py-2.5 rounded-xl border border-slate-200 focus:bg-white focus:border-blue-500 focus:outline-hidden"
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
                  className={`flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition-all active:scale-95 ${
                    durationMin === d
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-600 border-slate-200'
                  }`}
                >
                  {d} мин
                </button>
              ))}
            </div>

            {/* Conflict Warning */}
            {conflictingLesson && (
              <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-2">
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
            className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 active:scale-98 transition-all"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Сохранить изменения</span>
          </button>

          <button
            type="button"
            onClick={() => setIsDeleteConfirmOpen(true)}
            className="w-full py-3 rounded-2xl bg-rose-50 text-rose-600 text-xs font-bold border border-rose-200/80 flex items-center justify-center gap-1.5 active:scale-98"
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
