'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Student, Lesson, LessonStatus } from '@/types';
import { X, CalendarPlus, AlertTriangle } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { getTashkentTodayStr, dayOfWeekOf } from '@/lib/formatters';
import { format } from 'date-fns';

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
  const [studentId, setStudentId] = useState(students[0]?.id || '');
  const [lessonDate, setLessonDate] = useState(getTashkentTodayStr());
  const [startTime, setStartTime] = useState('18:00');
  const [duration, setDuration] = useState<number | string>(90);
  const [notes, setNotes] = useState('');
  const [lessonStatus, setLessonStatus] = useState<LessonStatus>('planned');

  const applyStudentSlotDefaults = useCallback(
    (targetStudentId: string, targetDateStr: string, preserveStartTime?: boolean) => {
      const student = students.find((s) => s.id === targetStudentId);
      const slots = student?.recurring_schedule || [];
      if (slots.length === 0) return;
      const dow = dayOfWeekOf(targetDateStr);
      const matched = slots.find((sl) => Number(sl.dayOfWeek) === dow) || slots[0];
      if (matched?.startTime) {
        const cleanStart = matched.startTime.substring(0, 5);
        if (!preserveStartTime) {
          setStartTime(cleanStart);
        }
        setDuration(slotDurationMinutes(cleanStart, matched.endTime?.substring(0, 5)));
      }
    },
    [students]
  );

  // Sync state whenever modal opens
  useEffect(() => {
    if (isOpen) {
      const targetStudentId =
        initialStudentId && students.some((s) => s.id === initialStudentId)
          ? initialStudentId
          : studentId && students.some((s) => s.id === studentId)
          ? studentId
          : students[0]?.id || '';

      setStudentId(targetStudentId);

      let dateFormatted = getTashkentTodayStr();
      if (initialDate) {
        try {
          dateFormatted = format(initialDate, 'yyyy-MM-dd');
        } catch {}
      }
      setLessonDate(dateFormatted);
      setLessonStatus(dateFormatted < getTashkentTodayStr() ? 'completed' : 'planned');
      setNotes('');

      if (initialStartTime) {
        setStartTime(initialStartTime);
        if (targetStudentId) {
          applyStudentSlotDefaults(targetStudentId, dateFormatted, true);
        }
      } else if (targetStudentId) {
        applyStudentSlotDefaults(targetStudentId, dateFormatted, false);
      }
    }
  }, [isOpen, initialDate, initialStartTime, initialStudentId, students]);

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

  if (!isOpen) return null;

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
      alert('Сначала добавьте ученика');
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
      className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center animate-in fade-in duration-150"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      style={{ touchAction: 'none' }}
    >
      <div
        className="w-full max-w-md bg-white rounded-t-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs text-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'pan-y', overscrollBehaviorY: 'contain' } as React.CSSProperties}
      >
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-blue-600" />
            <span>Новое занятие</span>
          </h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              hapticImpact('light');
              onClose();
            }}
            className="p-1.5 rounded-full text-slate-400 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-slate-500 font-semibold text-xs mb-1">
              Ученик <span className="text-rose-500">*</span>
            </label>
            {students.length === 0 ? (
              <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 font-medium">
                Список учеников пуст. Сначала добавьте ученика во вкладке «Клиенты».
              </div>
            ) : (
              <select
                value={studentId || students[0]?.id}
                onChange={(e) => handleStudentChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 font-bold focus:outline-hidden focus:border-blue-600 focus:bg-white"
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
              <label className="block text-slate-500 font-semibold text-xs mb-1">
                Дата урока
              </label>
              <input
                type="date"
                required
                value={lessonDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-hidden focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-slate-500 font-semibold text-xs mb-1">
                Время начала
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold focus:outline-hidden focus:border-blue-600"
              />
            </div>
          </div>

          {/* Occupied Slots on Selected Date */}
          {dayOccupiedLessons.length > 0 && (
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">
                Уже стоят уроки в этот день:
              </span>
              <div className="flex flex-wrap gap-1">
                {dayOccupiedLessons.map((ol) => (
                  <span
                    key={ol.id}
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-700"
                  >
                    <b className="font-mono text-slate-900">{ol.time_str}</b> ·{' '}
                    {ol.student_name || 'Ученик'}
                  </span>
                ))}
              </div>
            </div>
          )}

          {conflictingLesson && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-bold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Накладка по времени с «{conflictingLesson.student_name}» ({conflictingLesson.time_str})
              </span>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-slate-500 font-semibold text-xs">
                Длительность
              </label>
              <span className="text-[11px] font-mono text-blue-600 font-bold">
                {startTime} – {calculateEndTime(startTime, duration)} ({duration} мин)
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              {[45, 60, 90, 120].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`py-2 px-1 rounded-xl text-xs font-bold border transition-all ${
                    duration === d
                      ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {d} мин
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-slate-500 font-semibold text-xs mb-1">
              Статус урока
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setLessonStatus('planned')}
                className={`py-2 px-2 rounded-xl font-bold text-xs border transition-all ${
                  lessonStatus === 'planned'
                    ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                ⏳ Запланирован
              </button>
              <button
                type="button"
                onClick={() => setLessonStatus('completed')}
                className={`py-2 px-2 rounded-xl font-bold text-xs border transition-all ${
                  lessonStatus === 'completed'
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                ✅ Проведён (-1)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-slate-500 font-semibold text-xs mb-1">
              Тема / Заметка к уроку
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Необязательно: тема или ДЗ..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-hidden focus:border-blue-600 focus:bg-white"
            />
          </div>

          <button
            type="submit"
            disabled={students.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-2xl shadow-md shadow-blue-500/25 active:scale-[0.98] transition-all"
          >
            + Поставить в расписание
          </button>
        </form>
      </div>
    </div>
  );
};
