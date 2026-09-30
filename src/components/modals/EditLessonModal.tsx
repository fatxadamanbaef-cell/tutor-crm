'use client';

import React, { useState, useEffect } from 'react';
import { Student, Lesson, LessonStatus } from '@/types';
import { X, Check, ChevronRight } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { formatUZS } from '@/lib/formatters';

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
  const [price, setPrice] = useState<number>(150000);
  const [notes, setNotes] = useState('');
  const [currentStatus, setCurrentStatus] = useState<LessonStatus>('planned');

  useEffect(() => {
    if (isOpen && lesson) {
      setLessonDate(lesson.date.substring(0, 10));
      const parts = (lesson.time_str || '14:00 - 15:30').split(' - ');
      setStartTime(parts[0]);
      setEndTime(parts[1]);
      setPrice(lesson.price_per_lesson || student?.price_per_lesson || 150000);
      setNotes(lesson.notes || '');
      setCurrentStatus(lesson.status || 'planned');
    }
  }, [isOpen, lesson, student]);

  if (!isOpen || !lesson) return null;

  const handleSave = async () => {
    hapticImpact('light');
    const timeStr = `${startTime} - ${endTime}`;
    
    await onSave(lesson.id, {
      date: `${lessonDate}T${startTime}:00+05:00`,
      time_str: timeStr,
      price_per_lesson: price,
      notes,
      status: currentStatus,
    });
    hapticNotification('success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col animate-in slide-in-from-bottom duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 bg-white">
        <button onClick={() => { hapticImpact('light'); onClose(); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-500">
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-lg font-bold text-black">Редактирование</h2>
        <button onClick={handleSave} className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-50 text-blue-500">
          <Check className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Student Info */}
        <div className="bg-white rounded-3xl p-4 shadow-sm">
          <h3 className="text-xl font-bold text-black mb-1">{lesson.student_name}</h3>
          <div className="flex items-center text-gray-500 text-sm font-medium">
            Баланс: <span className={`ml-1 font-bold ${(student?.prepaid_balance ?? 0) <= 1 ? 'text-red-500' : 'text-green-600'}`}>{student?.prepaid_balance ?? 0} уроков</span>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-3xl p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-black font-semibold">Стоимость</span>
            <div className="bg-gray-100 px-3 py-1.5 rounded-lg font-bold text-black">
              {formatUZS(price).replace(' UZS', '')}
            </div>
          </div>

          <hr className="border-gray-100" />

          <div className="flex items-center justify-between text-black font-semibold">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="w-16 bg-transparent underline decoration-gray-300 underline-offset-4 focus:outline-none" />
              <span className="text-gray-400">→</span>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-16 bg-transparent underline decoration-gray-300 underline-offset-4 focus:outline-none" />
            </div>
          </div>

          <hr className="border-gray-100" />

          <div className="flex items-center justify-between text-black font-semibold">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
              <input type="date" value={lessonDate} onChange={e => setLessonDate(e.target.value)} className="bg-transparent focus:outline-none underline decoration-gray-300 underline-offset-4 w-40" />
            </div>
          </div>

          <hr className="border-gray-100" />

          <div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Комментарий"
              className="w-full bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-500 min-h-[80px]"
            />
          </div>
        </div>

        {/* Additional Settings */}
        <h3 className="text-black font-extrabold text-lg px-1 mt-6 mb-2">Дополнительные настройки</h3>
        <div className="bg-white rounded-3xl p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-black font-semibold">Повтор</span>
            <div className="flex items-center text-gray-500 text-sm font-medium">
              никогда <ChevronRight className="w-4 h-4 ml-1" />
            </div>
          </div>
          <hr className="border-gray-100" />
          <button onClick={() => alert(`Перейдите в профиль ${lesson.student_name} → Абонемент, чтобы добавить оплату`)} className="flex items-center justify-between w-full text-left">
            <span className="text-black font-semibold">Добавить оплату</span>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
          <hr className="border-gray-100" />
          <div className="pt-2">
            <span className="text-black font-semibold mb-3 block">Статус занятия</span>
            <div className="grid grid-cols-2 gap-2">
              <button 
                onClick={() => { hapticImpact('light'); setCurrentStatus('planned'); }}
                className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all ${currentStatus === 'planned' ? 'bg-blue-500 text-white border-blue-500 shadow-md shadow-blue-500/20' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
              >
                Запланирован
              </button>
              <button 
                onClick={() => { hapticImpact('light'); setCurrentStatus('completed'); }}
                className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all ${currentStatus === 'completed' ? 'bg-green-500 text-white border-green-500 shadow-md shadow-green-500/20' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
              >
                Проведен
              </button>
              <button 
                onClick={() => { hapticImpact('light'); setCurrentStatus('missed_excused'); }}
                className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all ${currentStatus === 'missed_excused' ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/20' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
              >
                Пропуск (долг)
              </button>
              <button 
                onClick={() => { hapticImpact('light'); setCurrentStatus('missed_penalty'); }}
                className={`py-2 px-2 text-xs font-bold rounded-xl border transition-all ${currentStatus === 'missed_penalty' ? 'bg-red-500 text-white border-red-500 shadow-md shadow-red-500/20' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
              >
                Отмена (списание)
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={async () => {
            if (confirm('Точно удалить занятие?')) {
              hapticImpact('heavy');
              await onDelete(lesson.id);
              onClose();
            }
          }}
          className="w-full bg-[#FF3B30] text-white font-bold py-4 rounded-2xl flex items-center justify-between px-6 shadow-sm shadow-red-500/20 active:scale-95 transition-transform"
        >
          <span>Удалить</span>
          <ChevronRight className="w-5 h-5 text-white/50" />
        </button>
      </div>
    </div>
  );
};
