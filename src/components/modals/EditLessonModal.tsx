'use client';

import React, { useState, useEffect } from 'react';
import { Student, Lesson, LessonStatus } from '@/types';
import { X, Check, Trash2, Calendar, Clock, AlertCircle, Flame, Ban } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { format, addDays } from 'date-fns';
import { getTashkentNow } from '@/lib/formatters';

interface EditLessonModalProps {
  isOpen: boolean;
  onClose: () => void;
  lesson: Lesson | null;
  student: Student | null;
  onSave: (lessonId: string, updates: Partial<Lesson>) => Promise<void>;
  onDelete: (lessonId: string) => Promise<void>;
}

export const EditLessonModal: React.FC<EditLessonModalProps> = ({
  isOpen,
  onClose,
  lesson,
  student,
  onSave,
  onDelete,
}) => {
  const [lessonDate, setLessonDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [currentStatus, setCurrentStatus] = useState<LessonStatus>('planned');
  const [missReason, setMissReason] = useState('');

  useEffect(() => {
    if (isOpen && lesson) {
      setLessonDate(lesson.date.substring(0, 10));
      const parts = (lesson.time_str || '16:00 - 17:30').split(' - ');
      setStartTime(parts[0] || '16:00');
      setEndTime(parts[1] || '17:30');
      setNotes(lesson.notes || '');
      setCurrentStatus(lesson.status || 'planned');
      setMissReason(lesson.miss_reason || '');
    }
  }, [isOpen, lesson]);

  if (!isOpen || !lesson) return null;

  const handleSave = async () => {
    hapticImpact('light');
    const timeStr = `${startTime} - ${endTime}`;

    await onSave(lesson.id, {
      date: `${lessonDate}T${startTime}:00+05:00`,
      time_str: timeStr,
      notes,
      status: currentStatus,
      miss_reason: currentStatus === 'missed_penalty' || currentStatus === 'missed_excused' || currentStatus === 'missed' ? missReason.trim() : undefined,
      needs_makeup: false,
    });
    hapticNotification('success');
    onClose();
  };

  const isMissedState = currentStatus === 'missed_penalty' || currentStatus === 'missed_excused' || currentStatus === 'missed';

  return (
    <div className="fixed inset-0 z-[60] bg-[#f2f2f7] flex flex-col animate-in slide-in-from-bottom duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 bg-white border-b border-gray-200">
        <button
          onClick={() => { hapticImpact('light'); onClose(); }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 active:scale-90"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-base font-black text-gray-900">Редактирование урока</h2>
        <button
          onClick={handleSave}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-500/20 active:scale-90"
        >
          <Check className="w-5 h-5" strokeWidth={3} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
        {/* Student Info */}
        <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-gray-900">{lesson.student_name}</h3>
              <p className="text-xs text-gray-500 font-semibold mt-0.5">
                Норма: {student?.monthly_target_lessons || 12} ур./мес. • Ставка: {(student?.lesson_rate || 300000).toLocaleString('ru-RU')} сум
              </p>
            </div>
            <span className="text-xs font-black text-blue-700 bg-blue-100 px-2.5 py-1 rounded-xl">
              Баланс: {student?.lessons_balance ?? 0} ур.
            </span>
          </div>
        </div>

        {/* Date & Time Settings */}
        <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80 space-y-3">
          <div>
            <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1">
              Дата урока
            </label>
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
              className="w-full text-xs font-bold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden"
            />

            {/* Quick Reschedule Shortcuts */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  const todayStr = format(getTashkentNow(), 'yyyy-MM-dd');
                  setLessonDate(todayStr);
                  setCurrentStatus('planned');
                }}
                className="flex-1 py-1.5 px-2 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-xl border border-blue-200/80 active:scale-95"
              >
                📅 Сегодня
              </button>
              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  const tomorrowStr = format(addDays(getTashkentNow(), 1), 'yyyy-MM-dd');
                  setLessonDate(tomorrowStr);
                  setCurrentStatus('planned');
                }}
                className="flex-1 py-1.5 px-2 bg-purple-50 text-purple-700 text-[11px] font-bold rounded-xl border border-purple-200/80 active:scale-95"
              >
                🚀 На завтра
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1">
                Время начала
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full text-xs font-bold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1">
                Время конца
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full text-xs font-bold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden"
              />
            </div>
          </div>
        </div>

        {/* Status Selector (3-State Attendance + Planned) */}
        <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80 space-y-3">
          <label className="text-[11px] font-bold text-gray-400 uppercase block">
            Статус урока и списание баланса
          </label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'planned', label: '⏳ Запланирован' },
              { id: 'completed', label: '✅ Был (-1 с баланса)' },
              { id: 'missed_penalty', label: '🔥 Сгорел (-1 с баланса)' },
              { id: 'missed_excused', label: '🛑 Отмена (баланс сохранен)' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  setCurrentStatus(st.id as LessonStatus);
                }}
                className={`py-2 px-2 text-center text-xs font-bold rounded-xl border transition-all ${
                  currentStatus === st.id || (st.id === 'missed_penalty' && currentStatus === 'missed')
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* If missed/cancelled, show reason input */}
          {isMissedState && (
            <div className="pt-2 space-y-2 border-t border-gray-100">
              <label className="text-[11px] font-bold text-gray-600 uppercase block">
                Причина пропуска / отмены
              </label>
              <div className="flex flex-wrap gap-1 mb-1">
                {['Болеет', 'Семейные обстоятельства', 'Уехал', 'Предупредил заранее', 'Не вышел на связь'].map(
                  (chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setMissReason(chip)}
                      className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 hover:bg-gray-200 text-gray-700"
                    >
                      {chip}
                    </button>
                  )
                )}
              </div>
              <input
                type="text"
                value={missReason}
                onChange={(e) => setMissReason(e.target.value)}
                placeholder="Укажите причину..."
                className="w-full text-xs font-semibold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200"
              />
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80">
          <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">
            Заметка к уроку / ДЗ
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Тема урока, домашнее задание..."
            className="w-full text-xs text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden"
          />
        </div>

        {/* Delete Lesson */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              if (confirm('Вы уверены, что хотите удалить этот урок?')) {
                onDelete(lesson.id);
                onClose();
              }
            }}
            className="w-full py-3 rounded-2xl bg-red-50 text-red-600 text-xs font-bold border border-red-200/80 flex items-center justify-center gap-1.5 active:scale-98"
          >
            <Trash2 className="w-4 h-4" />
            <span>Удалить урок</span>
          </button>
        </div>
      </div>
    </div>
  );
};
