'use client';

import React, { useState, useEffect } from 'react';
import { Student, Lesson, LessonStatus } from '@/types';
import { X, Check, Trash2, Calendar, Clock, AlertCircle } from 'lucide-react';
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
  const [needsMakeup, setNeedsMakeup] = useState(false);
  const [isMakeup, setIsMakeup] = useState(false);

  useEffect(() => {
    if (isOpen && lesson) {
      setLessonDate(lesson.date.substring(0, 10));
      const parts = (lesson.time_str || '16:00 - 17:30').split(' - ');
      setStartTime(parts[0] || '16:00');
      setEndTime(parts[1] || '17:30');
      setNotes(lesson.notes || '');
      setCurrentStatus(lesson.status || 'planned');
      setMissReason(lesson.miss_reason || '');
      setNeedsMakeup(Boolean(lesson.needs_makeup));
      setIsMakeup(Boolean(lesson.is_makeup));
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
      miss_reason: currentStatus === 'missed' ? missReason.trim() : undefined,
      needs_makeup: currentStatus === 'missed' ? needsMakeup : false,
      is_makeup: isMakeup,
    });
    hapticNotification('success');
    onClose();
  };

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
                Норма: {student?.monthly_target_lessons || 12} ур./мес.
              </p>
            </div>
            {isMakeup && (
              <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2.5 py-1 rounded-xl">
                🔄 Отработка
              </span>
            )}
          </div>
        </div>

        {/* Date & Time */}
        <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-gray-400 uppercase">
                Дата урока
              </label>
              {lesson && lessonDate !== lesson.date.substring(0, 10) && (
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                  Перенос с {lesson.date.substring(0, 10)}
                </span>
              )}
            </div>
            <input
              type="date"
              value={lessonDate}
              onChange={(e) => {
                const val = e.target.value;
                setLessonDate(val);
                // When moving a lesson to another date, auto-set status to planned
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

        {/* Status Selector */}
        <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80 space-y-3">
          <label className="text-[11px] font-bold text-gray-400 uppercase block">
            Статус урока
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'planned', label: '⏳ Запланирован' },
              { id: 'completed', label: '✅ Проведен' },
              { id: 'missed', label: '❌ Пропущен' },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  setCurrentStatus(st.id as LessonStatus);
                }}
                className={`py-2 px-1 text-center text-xs font-bold rounded-xl border transition-all ${
                  currentStatus === st.id
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* If missed, show reason input & needs_makeup toggle */}
          {currentStatus === 'missed' && (
            <div className="pt-2 space-y-3 border-t border-gray-100">
              <div>
                <label className="text-[11px] font-bold text-red-700 uppercase block mb-1">
                  Причина пропуска
                </label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {['Болеет', 'Семейные обстоятельства', 'Уехал', 'Школьное мероприятие'].map(
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
                  placeholder="Введите причину пропуска..."
                  className="w-full text-xs font-semibold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200"
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-2xl flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-amber-900 block">
                    На отработку в воскресенье
                  </span>
                  <span className="text-[10px] text-amber-700">
                    {needsMakeup ? 'Появится в списке отработок' : 'Только в архив'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={needsMakeup}
                  onChange={(e) => setNeedsMakeup(e.target.checked)}
                  className="w-5 h-5 text-amber-600 rounded-md"
                />
              </div>
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

        {/* Delete */}
        <div className="pt-2">
          <button
            type="button"
            onClick={async () => {
              if (confirm('Удалить этот урок?')) {
                hapticNotification('warning');
                await onDelete(lesson.id);
                onClose();
              }
            }}
            className="w-full py-3 rounded-2xl bg-red-50 text-red-600 text-xs font-bold border border-red-200 flex items-center justify-center gap-1.5 active:scale-98"
          >
            <Trash2 className="w-4 h-4" />
            <span>Удалить урок</span>
          </button>
        </div>
      </div>
    </div>
  );
};
