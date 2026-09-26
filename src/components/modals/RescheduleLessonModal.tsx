'use client';

import React, { useState, useEffect } from 'react';
import { Lesson, LessonStatus } from '@/types';
import { X, CalendarClock, Clock, BookOpen, Trash2 } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';

interface RescheduleLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  lesson: Lesson | null;
  onSave: (lessonId: string, updates: { date: string; time_str: string; notes?: string; status?: LessonStatus }) => void;
  onDelete?: (lessonId: string) => void;
}

export const RescheduleLessonModal: React.FC<RescheduleLessonModalProps> = ({
  isOpen,
  onClose,
  lesson,
  onSave,
  onDelete,
}) => {
  const [lessonDate, setLessonDate] = useState('');
  const [startTime, setStartTime] = useState('18:00');
  const [duration, setDuration] = useState(90);
  const [notes, setNotes] = useState('');
  const [lessonStatus, setLessonStatus] = useState<LessonStatus>('planned');

  useEffect(() => {
    if (lesson) {
      setLessonDate(lesson.date.substring(0, 10));
      setLessonStatus(lesson.status || 'planned');
      if (lesson.time_str && lesson.time_str.includes('-')) {
        const parts = lesson.time_str.split('-').map((s) => s.trim());
        setStartTime(parts[0] || '18:00');
        // calculate duration from start and end
        try {
          const [sh, sm] = (parts[0] || '18:00').split(':').map(Number);
          const [eh, em] = (parts[1] || '19:30').split(':').map(Number);
          const diff = (eh * 60 + em) - (sh * 60 + sm);
          if (diff > 0) setDuration(diff);
        } catch {
          setDuration(90);
        }
      } else {
        setStartTime('18:00');
        setDuration(90);
      }
      setNotes(lesson.notes || '');
    }
  }, [lesson]);

  if (!isOpen || !lesson) return null;

  const calculateEndTime = (start: string, durationMinutes: number): string => {
    try {
      const [h, m] = start.split(':').map(Number);
      const total = h * 60 + m + durationMinutes;
      const eh = Math.floor(total / 60) % 24;
      const em = total % 60;
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${pad(eh)}:${pad(em)}`;
    } catch {
      return '19:30';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const timeStr = `${startTime} - ${calculateEndTime(startTime, duration)}`;
    const fullIso = `${lessonDate}T${startTime}:00+05:00`;

    onSave(lesson.id, {
      date: fullIso,
      time_str: timeStr,
      notes: notes.trim(),
      status: lessonStatus,
    });

    hapticNotification('success');
    onClose();
  };

  const handleDelete = () => {
    if (confirm(`Удалить урок для ${lesson.student_name || 'ученика'}?`)) {
      hapticNotification('warning');
      if (onDelete) onDelete(lesson.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs text-zinc-200 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div>
            <h3 className="text-base font-extrabold text-zinc-100 flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-teal-400" />
              <span>Перенести / Изменить урок</span>
            </h3>
            <span className="text-[11px] text-zinc-400 font-bold">
              Ученик: <span className="text-zinc-100">{lesson.student_name || 'Ученик'}</span>
            </span>
          </div>
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
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Новая дата:</label>
              <input
                type="date"
                required
                value={lessonDate}
                onChange={(e) => setLessonDate(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 font-semibold focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-medium mb-1">Время начала:</label>
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
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-zinc-400 font-medium">Длительность урока:</label>
              <span className="text-[11px] font-mono text-teal-400 font-bold">
                {startTime} → {calculateEndTime(startTime, duration)} ({duration} мин)
              </span>
            </div>
            
            <div className="grid grid-cols-4 gap-1.5">
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
          </div>

          <div>
            <label className="block text-zinc-400 font-medium mb-1.5">Статус урока:</label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setLessonStatus('planned')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-left flex items-center gap-1.5 ${
                  lessonStatus === 'planned'
                    ? 'bg-teal-600/30 border-teal-400 text-teal-200'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-teal-400" />
                <span>Запланирован</span>
              </button>

              <button
                type="button"
                onClick={() => setLessonStatus('completed')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-left flex items-center gap-1.5 ${
                  lessonStatus === 'completed'
                    ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                }`}
              >
                <span>✅</span>
                <span>Проведен</span>
              </button>

              <button
                type="button"
                onClick={() => setLessonStatus('missed_excused')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-left flex items-center gap-1.5 ${
                  lessonStatus === 'missed_excused'
                    ? 'bg-amber-600/30 border-amber-400 text-amber-200'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                }`}
              >
                <span>🟡</span>
                <span>Отработка в ВС</span>
              </button>

              <button
                type="button"
                onClick={() => setLessonStatus('missed_penalty')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-left flex items-center gap-1.5 ${
                  lessonStatus === 'missed_penalty'
                    ? 'bg-rose-600/30 border-rose-400 text-rose-200'
                    : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                }`}
              >
                <span>🔥</span>
                <span>Сгорел (Списан)</span>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 font-medium mb-1 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Тема урока / Заметка / Домашнее задание (ДЗ):</span>
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Например: ДЗ: №14-25, стр. 88. Тема: Тригонометрия"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 focus:outline-none focus:border-teal-500 text-xs"
            />
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="flex-1 bg-teal-600 hover:bg-teal-500 text-zinc-100 font-bold py-3 px-4 rounded-xl shadow-lg active:scale-95 transition-all text-xs"
            >
              ✓ Сохранить перенос
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="px-3 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 hover:bg-rose-900/60 active:scale-95 transition-all flex items-center justify-center"
              title="Удалить урок"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};


