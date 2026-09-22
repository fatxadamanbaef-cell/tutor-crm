'use client';

import React, { useState, useEffect } from 'react';
import { Student } from '@/types';
import { X, Calendar, Clock, DollarSign, BookOpen } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { formatCurrency } from '@/lib/formatters';
import { format } from 'date-fns';

interface AddLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  initialDate?: string;
  initialStudentId?: string;
  onSave: (lesson: {
    student_id: string;
    lesson_date: string;
    start_time: string;
    end_time: string;
    price: number;
    notes?: string;
  }) => void;
}

export const AddLessonModal: React.FC<AddLessonModalProps> = ({
  isOpen,
  onClose,
  students,
  initialDate,
  initialStudentId,
  onSave,
}) => {
  const [studentId, setStudentId] = useState(initialStudentId || (students[0]?.id || ''));
  const [lessonDate, setLessonDate] = useState(initialDate || format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState('19:00');
  const [duration, setDuration] = useState(60); // minutes
  const [price, setPrice] = useState(150000);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (initialDate) setLessonDate(initialDate);
    if (initialStudentId) setStudentId(initialStudentId);
  }, [initialDate, initialStudentId]);

  useEffect(() => {
    const student = students.find((s) => s.id === studentId);
    if (student) {
      setPrice(student.price_per_lesson);
    }
  }, [studentId, students]);

  if (!isOpen) return null;

  const calculateEndTime = (start: string, durationMinutes: number): string => {
    try {
      const [h, m] = start.split(':').map(Number);
      const date = new Date();
      date.setHours(h, m, 0, 0);
      date.setMinutes(date.getMinutes() + durationMinutes);
      return format(date, 'HH:mm');
    } catch {
      return '20:00';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      alert('Пожалуйста, выберите ученика');
      return;
    }

    const endTime = calculateEndTime(startTime, duration);
    onSave({
      student_id: studentId,
      lesson_date: lessonDate,
      start_time: startTime,
      end_time: endTime,
      price: Number(price),
      notes,
    });
    hapticNotification('success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-blue-400" />
            <span>Запланировать урок</span>
          </h3>
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-1 rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Student selection */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">
              Ученик
            </label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500 font-semibold"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.payment_type === 'package' ? `Абонемент: ${s.package_remaining_lessons} ур.` : 'Поурочно'})
                </option>
              ))}
            </select>
          </div>

          {/* Date & Start time */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                Дата
              </label>
              <input
                type="date"
                value={lessonDate}
                onChange={(e) => setLessonDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                Время начала
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-bold"
              />
            </div>
          </div>

          {/* Duration Chips */}
          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">
              Длительность
            </label>
            <div className="flex items-center gap-2">
              {[45, 60, 90, 120].map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDuration(mins)}
                  className={`flex-1 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    duration === mins
                      ? 'bg-blue-600 text-white border-blue-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {mins} мин
                </button>
              ))}
            </div>
          </div>

          {/* Price */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">
              Стоимость урока (сум)
            </label>
            <input
              type="number"
              step="5000"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-bold focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">
              Тема / Заметки к уроку
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Например: Разбор квадратных уравнений, ДЗ"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-600/30 transition-all active:scale-95 text-xs"
            >
              Запланировать урок
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
