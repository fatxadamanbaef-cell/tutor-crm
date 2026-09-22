'use client';

import React, { useState, useEffect } from 'react';
import { Student, Lesson } from '@/types';
import { X, Sparkles, Calendar, Clock, Check, Layers } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { generateRecurringLessons } from '@/lib/scheduleGenerator';
import { formatCurrency } from '@/lib/formatters';
import { format, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import confetti from 'canvas-confetti';

interface GenerateScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  initialStudentId?: string;
  onSaveBatch: (lessons: Lesson[]) => void;
}

const DAYS_MAP = [
  { id: 1, label: 'Пн', full: 'Понедельник' },
  { id: 2, label: 'Вт', full: 'Вторник' },
  { id: 3, label: 'Ср', full: 'Среда' },
  { id: 4, label: 'Чт', full: 'Четверг' },
  { id: 5, label: 'Пт', full: 'Пятница' },
  { id: 6, label: 'Сб', full: 'Суббота' },
  { id: 0, label: 'Вс', full: 'Воскресенье' },
];

export const GenerateScheduleModal: React.FC<GenerateScheduleModalProps> = ({
  isOpen,
  onClose,
  students,
  initialStudentId,
  onSaveBatch,
}) => {
  const [studentId, setStudentId] = useState(initialStudentId || (students[0]?.id || ''));
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]); // Default: Mon, Wed, Fri (Нечетные)
  const [startTime, setStartTime] = useState('19:00');
  const [duration, setDuration] = useState(60);
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [totalLessons, setTotalLessons] = useState(12);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (initialStudentId) setStudentId(initialStudentId);
  }, [initialStudentId]);

  if (!isOpen) return null;

  const selectedStudent = students.find((s) => s.id === studentId);

  const toggleDay = (dayId: number) => {
    hapticImpact('light');
    if (selectedDays.includes(dayId)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter((d) => d !== dayId));
      }
    } else {
      setSelectedDays([...selectedDays, dayId]);
    }
  };

  const applyPreset = (preset: 'odd' | 'even' | 'weekend') => {
    hapticImpact('medium');
    if (preset === 'odd') setSelectedDays([1, 3, 5]); // Пн, Ср, Пт
    if (preset === 'even') setSelectedDays([2, 4, 6]); // Вт, Чт, Сб
    if (preset === 'weekend') setSelectedDays([6, 0]); // Сб, Вс
  };

  const previewLessons = generateRecurringLessons({
    student_id: studentId,
    student_name: selectedStudent?.name,
    student_color: selectedStudent?.color,
    student_payment_type: selectedStudent?.payment_type,
    selected_days: selectedDays,
    start_time: startTime,
    duration_minutes: duration,
    price: selectedStudent?.price_per_lesson || 150000,
    start_date: startDate,
    total_lessons: totalLessons,
    notes,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (previewLessons.length === 0) {
      alert('Выберите хотя бы один день недели');
      return;
    }

    onSaveBatch(previewLessons);

    confetti({
      particleCount: 80,
      spread: 90,
      origin: { y: 0.6 },
    });

    hapticNotification('success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span>Авто-генерация расписания</span>
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

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Student selection */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">
              Выберите ученика
            </label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 font-semibold focus:outline-none focus:border-indigo-500 text-sm"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatCurrency(s.price_per_lesson)}/ур.)
                </option>
              ))}
            </select>
          </div>

          {/* Preset buttons */}
          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">
              Готовые шаблоны дней недели
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => applyPreset('odd')}
                className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold transition-all text-center ${
                  selectedDays.includes(1) && selectedDays.includes(3) && selectedDays.includes(5) && selectedDays.length === 3
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                Пн / Ср / Пт
              </button>
              <button
                type="button"
                onClick={() => applyPreset('even')}
                className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold transition-all text-center ${
                  selectedDays.includes(2) && selectedDays.includes(4) && selectedDays.includes(6) && selectedDays.length === 3
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                Вт / Чт / Сб
              </button>
              <button
                type="button"
                onClick={() => applyPreset('weekend')}
                className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold transition-all text-center ${
                  selectedDays.includes(6) && selectedDays.includes(0) && selectedDays.length === 2
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                    : 'bg-slate-950 text-slate-400 border-slate-800'
                }`}
              >
                Сб / Вс
              </button>
            </div>
          </div>

          {/* Days of week selector pills */}
          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">
              Дни занятий (можно выбрать любые)
            </label>
            <div className="grid grid-cols-7 gap-1">
              {DAYS_MAP.map((day) => {
                const isSelected = selectedDays.includes(day.id);
                return (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => toggleDay(day.id)}
                    className={`py-2 rounded-xl border font-bold text-xs transition-all text-center ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                        : 'bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Start Time & Duration */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                Время урока
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                Длительность
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
              >
                <option value={45}>45 минут</option>
                <option value={60}>60 минут (1 час)</option>
                <option value={90}>90 минут (1.5 часа)</option>
                <option value={120}>120 минут (2 часа)</option>
              </select>
            </div>
          </div>

          {/* Start Date & Lessons Count */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                Начать с даты
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                Количество уроков
              </label>
              <div className="flex items-center gap-1">
                {[8, 12, 16].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => setTotalLessons(cnt)}
                    className={`flex-1 py-2 rounded-xl border text-[11px] font-bold transition-all ${
                      totalLessons === cnt
                        ? 'bg-indigo-600 text-white border-indigo-500'
                        : 'bg-slate-950 text-slate-400 border-slate-800'
                    }`}
                  >
                    {cnt} ур.
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Live summary banner */}
          <div className="p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-xl space-y-1">
            <div className="flex items-center gap-1.5 text-indigo-400 font-bold">
              <Layers className="w-3.5 h-3.5" />
              <span>Итоговый расчет:</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[11px]">
              Будет создано <b>{previewLessons.length} уроков</b> в <b>{startTime}</b> для ученика{' '}
              <b>{selectedStudent?.name}</b>.{' '}
              {previewLessons.length > 0 && (
                <span className="text-indigo-300">
                  Период: с {previewLessons[0].lesson_date} по{' '}
                  {previewLessons[previewLessons.length - 1].lesson_date}.
                </span>
              )}
            </p>
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all active:scale-95 text-xs flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>Создать {previewLessons.length} уроков в расписании</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
