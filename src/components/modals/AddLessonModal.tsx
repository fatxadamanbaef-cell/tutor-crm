'use client';

import React, { useState, useEffect } from 'react';
import { Student, LessonStatus } from '@/types';
import { X, CalendarPlus, Clock } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { getTashkentTodayStr, formatUZS } from '@/lib/formatters';
import { format } from 'date-fns';

interface AddLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  initialDate?: Date;
  onSave: (lesson: {
    student_id: string;
    date: string;
    time_str: string;
    notes?: string;
    status?: LessonStatus;
  }) => void;
}

export const AddLessonModal: React.FC<AddLessonModalProps> = ({
  isOpen,
  onClose,
  students,
  initialDate,
  onSave,
}) => {
  const [studentId, setStudentId] = useState(students[0]?.id || '');
  const [lessonDate, setLessonDate] = useState(getTashkentTodayStr());
  const [startTime, setStartTime] = useState('18:00');
  const [duration, setDuration] = useState<number | string>(90);
  const [notes, setNotes] = useState('');
  const [lessonStatus, setLessonStatus] = useState<LessonStatus>('planned');

  // Sync state whenever modal opens or students load
  useEffect(() => {
    if (isOpen) {
      if (students.length > 0) {
        if (!studentId || !students.some((s) => s.id === studentId)) {
          setStudentId(students[0].id);
        }
      }
      if (initialDate) {
        try {
          const dateFormatted = format(initialDate, 'yyyy-MM-dd');
          setLessonDate(dateFormatted);
          if (dateFormatted < getTashkentTodayStr()) {
            setLessonStatus('completed');
          } else {
            setLessonStatus('planned');
          }
        } catch {
          setLessonDate(getTashkentTodayStr());
        }
      } else {
        setLessonDate(getTashkentTodayStr());
      }
    }
  }, [isOpen, students, initialDate]);

  if (!isOpen) return null;

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

  const handleDateChange = (newDate: string) => {
    setLessonDate(newDate);
    if (newDate < getTashkentTodayStr()) {
      setLessonStatus('completed');
    }
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
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs text-zinc-200 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <h3 className="text-base font-extrabold text-zinc-100 flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-teal-400" />
            <span>Запланировать урок</span>
          </h3>
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-200 bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-zinc-400 font-medium mb-1">
              Ученик: <span className="text-rose-400">*</span>
            </label>
            {students.length === 0 ? (
              <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800/60 text-amber-300 text-xs">
                Список учеников пуст. Сначала добавьте ученика кнопкой «+ Ученик».
              </div>
            ) : (
              <select
                value={studentId || students[0]?.id}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 font-bold focus:outline-none focus:border-teal-500"
              >
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (баланс: {s.prepaid_balance > 0 ? `+${s.prepaid_balance}` : s.prepaid_balance} ур.)
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">
                Дата урока:
              </label>
              <input
                type="date"
                required
                value={lessonDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 font-semibold focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-medium mb-1">
                Время начала:
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 font-semibold focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 font-medium mb-1">
              Статус урока:
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setLessonStatus('completed')}
                className={`py-2 px-2 rounded-xl font-bold text-xs border transition-all ${
                  lessonStatus === 'completed'
                    ? 'bg-emerald-600 border-emerald-400 text-zinc-100 shadow-md'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                }`}
              >
                ✓ Уже проведен (-1 с баланса)
              </button>
              <button
                type="button"
                onClick={() => setLessonStatus('planned')}
                className={`py-2 px-2 rounded-xl font-bold text-xs border transition-all ${
                  lessonStatus === 'planned'
                    ? 'bg-teal-600 border-teal-400 text-zinc-100 shadow-md'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                }`}
              >
                ⏳ Запланирован
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-zinc-400 font-medium">
                Длительность урока:
              </label>
              <span className="text-[11px] font-mono text-teal-400 font-bold">
                {startTime} → {calculateEndTime(startTime, duration)} ({duration} мин)
              </span>
            </div>
            
            <div className="grid grid-cols-4 gap-1.5 mb-2">
              {[45, 60, 90, 120].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDuration(d)}
                  className={`py-1.5 px-1 rounded-xl text-xs font-bold border transition-all ${
                    duration === d
                      ? 'bg-teal-600 border-teal-400 text-zinc-100 shadow-md'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-300 hover:border-zinc-800'
                  }`}
                >
                  {d} мин
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-zinc-950/80 border border-zinc-800 rounded-xl px-3 py-1.5">
              <span className="text-zinc-400 text-[11px]">Другая длительность:</span>
              <input
                type="number"
                min="15"
                max="300"
                step="5"
                value={duration}
                onChange={(e) => setDuration(e.target.value === '' ? '' : Math.max(15, Number(e.target.value)))}
                className="w-16 bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-0.5 text-center text-zinc-100 font-bold focus:outline-none focus:border-teal-500 text-xs"
              />
              <span className="text-zinc-400 text-[11px]">минут</span>
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 font-medium mb-1">
              Тема / Домашнее задание / Заметка:
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Например: Алгебра: Квадратные уравнения"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-200 focus:outline-none focus:border-teal-500"
            />
          </div>

          <button
            type="submit"
            disabled={students.length === 0}
            className="w-full bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-zinc-100 font-bold py-3 px-4 rounded-xl shadow-lg active:scale-95 transition-all text-xs"
          >
            + Добавить в расписание
          </button>
        </form>
      </div>
    </div>
  );
};


