'use client';

import React, { useState, useEffect } from 'react';
import { Student } from '@/types';
import { X, CheckCircle2, Sparkles, BookOpen, Clock } from 'lucide-react';
import { hapticNotification, hapticImpact } from '@/lib/telegram';
import { formatCurrency } from '@/lib/formatters';
import { format } from 'date-fns';
import confetti from 'canvas-confetti';

interface ConductLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  initialStudentId?: string;
  onConfirm: (data: {
    student_id: string;
    lesson_date: string;
    start_time: string;
    notes?: string;
  }) => void;
}

export const ConductLessonModal: React.FC<ConductLessonModalProps> = ({
  isOpen,
  onClose,
  students,
  initialStudentId,
  onConfirm,
}) => {
  const [studentId, setStudentId] = useState(initialStudentId || (students[0]?.id || ''));
  const [lessonDate, setLessonDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState(format(new Date(), 'HH:mm'));
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (initialStudentId) setStudentId(initialStudentId);
  }, [initialStudentId]);

  if (!isOpen) return null;

  const selectedStudent = students.find((s) => s.id === studentId);
  const isPackage = selectedStudent?.payment_type === 'package';
  const remaining = selectedStudent?.package_remaining_lessons ?? 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      alert('Пожалуйста, выберите ученика');
      return;
    }

    onConfirm({
      student_id: studentId,
      lesson_date: lessonDate,
      start_time: startTime,
      notes,
    });

    confetti({
      particleCount: 70,
      spread: 80,
      origin: { y: 0.6 },
      colors: ['#10b981', '#3b82f6', '#f59e0b'],
    });

    hapticNotification('success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>Отметить проведенный урок</span>
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
              Выберите ученика
            </label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 text-sm font-semibold focus:outline-none focus:border-emerald-500"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.payment_type === 'package' ? `Абонемент: ост. ${s.package_remaining_lessons} ур.` : 'Поурочно'})
                </option>
              ))}
            </select>
          </div>

          {/* Impact preview badge */}
          {selectedStudent && (
            <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl space-y-1">
              <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                <span>Что произойдет при отметке:</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                {isPackage ? (
                  <>
                    Из абонемента спишется <b>1 урок</b>. Останется:{' '}
                    <span className="font-bold text-emerald-300">
                      {Math.max(0, remaining - 1)} из {selectedStudent.package_total_lessons} уроков
                    </span>
                    .
                  </>
                ) : (
                  <>
                    Урок будет зафиксирован как проведенный (стоимость:{' '}
                    <span className="font-bold text-emerald-300">
                      {formatCurrency(selectedStudent.price_per_lesson)}
                    </span>
                    ).
                  </>
                )}
              </p>
            </div>
          )}

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                Дата проведения
              </label>
              <input
                type="date"
                value={lessonDate}
                onChange={(e) => setLessonDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                Время
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">
              Тема пройденного урока (опционально)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Например: Прошли стереометрию, тест"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-emerald-600/30 transition-all active:scale-95 text-sm flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>Зафиксировать проведенный урок</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
