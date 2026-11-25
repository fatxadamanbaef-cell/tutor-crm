'use client';

import React, { useState, useMemo } from 'react';
import { Student, Lesson, LessonStatus } from '@/types';
import { X, CalendarPlus, AlertTriangle, Clock, Check } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { getTashkentTodayStr, dayOfWeekOf } from '@/lib/formatters';
import { format } from 'date-fns';
import { useToast } from '@/components/ui/ToastProvider';

interface AddLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  lessons?: Lesson[];
  initialDate?: Date;
  initialStartTime?: string;
  initialStudentId?: string;
  onSave: (lesson: {
    student_id: string;
    date: string;
    time_str: string;
    notes?: string;
    status?: LessonStatus;
  }) => void;
}

function slotDurationMinutes(start: string, end?: string): number {
  if (!end) return 90;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 90;
  const diff = eh * 60 + em - (sh * 60 + sm);
  return diff >= 15 && diff <= 300 ? diff : 90;
}

function getStudentSlotDefaults(
  students: Student[],
  targetStudentId: string,
  targetDateStr: string
): { startTime: string; duration: number } | null {
  const student = students.find((s) => s.id === targetStudentId);
  const slots = student?.recurring_schedule || [];
  if (slots.length === 0) return null;
  const dow = dayOfWeekOf(targetDateStr);
  const matched = slots.find((sl) => Number(sl.dayOfWeek) === dow) || slots[0];
  if (!matched?.startTime) return null;
  const cleanStart = matched.startTime.substring(0, 5);
  return {
    startTime: cleanStart,
    duration: slotDurationMinutes(cleanStart, matched.endTime?.substring(0, 5)),
  };
}

function formatInitialDate(initialDate?: Date): string {
  if (!initialDate) return getTashkentTodayStr();
  try {
    return format(initialDate, 'yyyy-MM-dd');
  } catch {
    return getTashkentTodayStr();
  }
}

export const AddLessonModal: React.FC<AddLessonModalProps> = ({
  isOpen,
  onClose,
  students,
  lessons = [],
  initialDate,
  initialStartTime,
  initialStudentId,
  onSave,
}) => {
  if (!isOpen) return null;
  return (
    <AddLessonModalContent
      onClose={onClose}
      students={students}
      lessons={lessons}
      initialDate={initialDate}
      initialStartTime={initialStartTime}
      initialStudentId={initialStudentId}
      onSave={onSave}
    />
  );
};

const AddLessonModalContent: React.FC<Omit<AddLessonModalProps, 'isOpen'>> = ({
  onClose,
  students,
  lessons = [],
  initialDate,
  initialStartTime,
  initialStudentId,
  onSave,
}) => {
  const { showToast } = useToast();
  const resolvedStudentId =
    initialStudentId && students.some((s) => s.id === initialStudentId)
      ? initialStudentId
      : students[0]?.id || '';
  const initialDateStr = formatInitialDate(initialDate);
  const initialSlotDefaults = resolvedStudentId
    ? getStudentSlotDefaults(students, resolvedStudentId, initialDateStr)
    : null;

  const [studentId, setStudentId] = useState(resolvedStudentId);
  const [lessonDate, setLessonDate] = useState(initialDateStr);
  const [startTime, setStartTime] = useState(
    initialStartTime || initialSlotDefaults?.startTime || '18:00'
  );
  const [duration, setDuration] = useState<number | string>(
    initialSlotDefaults?.duration ?? 90
  );
  const [notes, setNotes] = useState('');
  const [lessonStatus, setLessonStatus] = useState<LessonStatus>(
    initialDateStr < getTashkentTodayStr() ? 'completed' : 'planned'
  );

  const applyStudentSlotDefaults = (
    targetStudentId: string,
    targetDateStr: string,
    preserveStartTime?: boolean
  ) => {
    const defaults = getStudentSlotDefaults(students, targetStudentId, targetDateStr);
    if (!defaults) return;
    if (!preserveStartTime) {
      setStartTime(defaults.startTime);
    }
    setDuration(defaults.duration);
  };

  const calculateEndTime = (start: string, durationMinutes: number | string): string => {
    try {
      const [h, m] = start.split(':').map(Number);
      const total = h * 60 + m + (Number(durationMinutes) || 90);
      const eh = Math.floor(total / 60) % 24;
      const em = total % 60;
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${pad(eh)}:${pad(em)}`;
    } catch {
      return '19:30';
    }
  };

  // Occupied slots on the chosen day
  const dayOccupiedLessons = useMemo(() => {
    if (!lessonDate) return [];
    return lessons
      .filter((l) => l.date.startsWith(lessonDate) && l.status !== 'missed_excused')
      .sort((a, b) => (a.time_str || '').localeCompare(b.time_str || ''));
  }, [lessons, lessonDate]);

  // Check overlap
  const conflictingLesson = useMemo(() => {
    const [sh, sm] = startTime.split(':').map(Number);
    if (isNaN(sh) || isNaN(sm)) return null;
    const startMin = sh * 60 + sm;
    const endMin = startMin + (Number(duration) || 90);

    for (const l of dayOccupiedLessons) {
      const parts = (l.time_str || '').split(' - ');
      const [osh, osm] = (parts[0] || '').split(':').map(Number);
      if (isNaN(osh) || isNaN(osm)) continue;
      const oStart = osh * 60 + osm;
      let oEnd = oStart + 90;
      if (parts[1]) {
        const [oeh, oem] = parts[1].split(':').map(Number);
        if (!isNaN(oeh) && !isNaN(oem)) oEnd = oeh * 60 + oem;
      }
      if (startMin < oEnd && endMin > oStart) {
        return l;
      }
    }
    return null;
  }, [dayOccupiedLessons, startTime, duration]);

  const handleDateChange = (newDate: string) => {
    setLessonDate(newDate);
    if (newDate < getTashkentTodayStr()) {
      setLessonStatus('completed');
    } else {
      setLessonStatus('planned');
    }
    if (studentId && !initialStartTime) {
      applyStudentSlotDefaults(studentId, newDate, false);
    }
  };

  const handleStudentChange = (newId: string) => {
    setStudentId(newId);
    applyStudentSlotDefaults(newId, lessonDate, Boolean(initialStartTime));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveStudentId = studentId || students[0]?.id;
    if (!effectiveStudentId) {
      showToast({ message: 'Сначала добавьте ученика во вкладке «Ученики»', tone: 'warning' });
      return;
    }

    const timeStr = `${startTime} - ${calculateEndTime(startTime, Number(duration) || 90)}`;
    const fullIso = `${lessonDate}T${startTime}:00+05:00`;

    onSave({
      student_id: effectiveStudentId,
      date: fullIso,
      time_str: timeStr,
      notes: notes.trim(),
      status: lessonStatus,
    });

    hapticNotification('success');
    setNotes('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#1C1917]/40 flex items-end justify-center animate-in fade-in duration-150"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      style={{ touchAction: 'none' }}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-3xl p-5 pt-3 space-y-3.5 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs text-[#1C1917] shadow-2xl border-t border-[#E7E2D8]"
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'pan-y', overscrollBehaviorY: 'contain' } as React.CSSProperties}
      >
        <div className="w-9 h-1 rounded-full bg-[#DDD6C9] mx-auto" aria-hidden="true" />
        <div className="flex items-center justify-between pb-2 border-b border-[#EFECE5]">
          <h3 className="text-base font-bold text-[#1C1917] flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-[#2F6FED]" />
            <span>Новое занятие</span>
          </h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              hapticImpact('light');
              onClose();
            }}
            className="p-1.5 rounded-full bg-[#F2EFE9] text-[#78716C] hover:text-[#1C1917] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[#78716C] font-semibold text-xs mb-1">
              Ученик <span className="text-[#E85D3F]">*</span>
            </label>
            {students.length === 0 ? (
              <div className="p-3 rounded-xl bg-[#FEF6E7] border border-[#F3DCAC] text-amber-900 font-medium">
                Список учеников пуст. Сначала добавьте ученика во вкладке «Ученики».
              </div>
            ) : (
              <select
                value={studentId || students[0]?.id}
                onChange={(e) => handleStudentChange(e.target.value)}
                className="w-full bg-[#F7F5F0] border border-[#E7E2D8] rounded-xl px-3 py-2.5 text-[#1C1917] font-semibold focus:outline-hidden focus:border-[#2F6FED] focus:bg-white"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (Баланс: {s.lessons_balance ?? 0} ур.)
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[#78716C] font-semibold text-xs mb-1">
                Дата урока
              </label>
              <input
                type="date"
                required
                value={lessonDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full bg-[#F7F5F0] border border-[#E7E2D8] rounded-xl px-3 py-2 text-[#1C1917] font-semibold focus:outline-hidden focus:border-[#2F6FED]"
              />
            </div>

            <div>
              <label className="block text-[#78716C] font-semibold text-xs mb-1">
                Время начала
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-[#F7F5F0] border border-[#E7E2D8] rounded-xl px-3 py-2 text-[#1C1917] font-semibold focus:outline-hidden focus:border-[#2F6FED]"
              />
            </div>
          </div>

          {/* Occupied Slots on Selected Date */}
          {dayOccupiedLessons.length > 0 && (
            <div className="p-2.5 rounded-xl bg-[#F7F5F0] border border-[#E7E2D8] space-y-1">
              <span className="text-[10px] font-semibold text-[#78716C] uppercase block">
                Уже стоят уроки в этот день:
              </span>
              <div className="flex flex-wrap gap-1">
                {dayOccupiedLessons.map((ol) => (
                  <span
                    key={ol.id}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-white border border-[#E7E2D8] text-[#44403C]"
                  >
                    <b className="tabular-nums text-[#1C1917]">{ol.time_str}</b> ·{' '}
                    {ol.student_name || 'Ученик'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {conflictingLesson && (
            <div className="p-2.5 rounded-xl bg-[#FEF6E7] border border-[#F3DCAC] text-amber-950 text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Накладка по времени с «{conflictingLesson.student_name}» ({conflictingLesson.time_str})
              </span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[#78716C] font-semibold text-xs">
                Длительность
              </label>
              <span className="text-[11px] tabular-nums text-[#2F6FED] font-semibold">
                {startTime} – {calculateEndTime(startTime, duration)} ({duration} мин)
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {[45, 60, 90, 120].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`py-2 px-1 rounded-xl text-xs font-semibold border transition-colors ${
                    duration === d
                      ? 'bg-[#1C1917] border-[#1C1917] text-white shadow-xs'
                      : 'bg-[#F7F5F0] border-[#E7E2D8] text-[#57534E] hover:border-[#D6CFC2]'
                  }`}
                >
                  {d} мин
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[#78716C] font-semibold text-xs mb-1">
              Статус урока
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setLessonStatus('planned')}
                className={`py-2 px-2 rounded-xl font-semibold text-xs border transition-colors flex items-center justify-center gap-1.5 ${
                  lessonStatus === 'planned'
                    ? 'bg-[#2F6FED] border-[#2F6FED] text-white shadow-xs'
                    : 'bg-[#F7F5F0] border-[#E7E2D8] text-[#57534E]'
                }`}
              >
                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Запланирован</span>
              </button>
              <button
                type="button"
                onClick={() => setLessonStatus('completed')}
                className={`py-2 px-2 rounded-xl font-semibold text-xs border transition-colors flex items-center justify-center gap-1.5 ${
                  lessonStatus === 'completed'
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                    : 'bg-[#F7F5F0] border-[#E7E2D8] text-[#57534E]'
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                <span>Проведён (-1)</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[#78716C] font-semibold text-xs mb-1">
              Тема / Заметка к уроку
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Необязательно: тема или ДЗ..."
              className="w-full bg-[#F7F5F0] border border-[#E7E2D8] rounded-xl px-3 py-2 text-[#1C1917] focus:outline-hidden focus:border-[#2F6FED] focus:bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={students.length === 0}
            className="w-full bg-[#2F6FED] hover:bg-[#255CE0] disabled:opacity-50 text-white font-semibold py-3.5 px-4 rounded-2xl shadow-sm active:scale-[0.98] transition-colors"
          >
            + Поставить в расписание
          </button>
        </form>
      </div>
    </div>
  );
};
