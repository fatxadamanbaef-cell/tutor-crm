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
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white rounded-t-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs text-gray-900 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <h3 className="text-base font-extrabold text-black flex items-center gap-2">
            <CalendarPlus className="w-4 h-4 text-blue-500" />
            <span>Новое занятие</span>
          </h3>
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-1.5 rounded-full text-gray-400 hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-500 font-semibold text-xs mb-1">
              Ученик: <span className="text-red-500">*</span>
            </label>
            {students.length === 0 ? (
              <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-600 font-medium">
                Список учеников пуст. Сначала добавьте ученика во вкладке «Клиенты».
              </div>
            ) : (
              <select
                value={studentId || students[0]?.id}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-black font-bold focus:outline-none focus:border-blue-500"
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
              <label className="block text-gray-500 font-semibold text-xs mb-1">
                Дата урока:
              </label>
              <input
                type="date"
                required
                value={lessonDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 font-semibold focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-gray-500 font-semibold text-xs mb-1">
                Время начала:
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 font-semibold focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-gray-500 font-semibold text-xs mb-1">
              Статус урока:
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setLessonStatus('completed')}
                className={`py-2 px-2 rounded-xl font-bold text-[11px] border transition-all ${
                  lessonStatus === 'completed'
                    ? 'bg-blue-500 border-blue-500 text-white shadow-md shadow-blue-500/20'
                    : 'bg-white border-gray-200 text-gray-400'
                }`}
              >
                ✓ Проведен (-1 с баланса)
              </button>
              <button
                type="button"
                onClick={() => setLessonStatus('planned')}
                className={`py-2 px-2 rounded-xl font-bold text-[11px] border transition-all ${
                  lessonStatus === 'planned'
                    ? 'bg-blue-50 border-blue-200 text-blue-600 shadow-sm'
                    : 'bg-white border-gray-200 text-gray-400'
                }`}
              >
                ⏳ Запланирован
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-gray-500 font-semibold text-xs">
                Длительность урока:
              </label>
              <span className="text-[11px] font-mono text-blue-500 font-bold">
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
                      ? 'bg-gray-900 border-gray-900 text-white shadow-md'
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {d} мин
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5">
              <span className="text-gray-400 text-[11px]">Другая длительность:</span>
              <input
                type="number"
                min="15"
                max="300"
                step="5"
                value={duration}
                onChange={(e) => setDuration(e.target.value === '' ? '' : Math.max(15, Number(e.target.value)))}
                className="w-16 bg-white border border-gray-200 rounded-lg px-2 py-0.5 text-center text-gray-900 font-bold focus:outline-none focus:border-blue-500 text-xs"
              />
              <span className="text-gray-400 text-[11px]">минут</span>
            </div>
          </div>

          <div>
            <label className="block text-gray-500 font-semibold text-xs mb-1">
              Комментарий:
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Например: Алгебра"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-gray-900 focus:outline-none focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={students.length === 0}
            className="w-full bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white font-bold py-3.5 px-4 rounded-xl shadow-lg shadow-blue-500/30 active:scale-[0.98] transition-all"
          >
            + Добавить в расписание
          </button>
        </form>
      </div>
    </div>
  );
};


