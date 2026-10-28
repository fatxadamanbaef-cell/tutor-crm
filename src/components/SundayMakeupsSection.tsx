'use client';

import React, { useState } from 'react';
import { Lesson, Student, Makeup } from '@/types';
import { Calendar, Archive, Clock, X, Check } from 'lucide-react';
import { format, parseISO, nextSunday, setHours, setMinutes } from 'date-fns';
import { ru } from 'date-fns/locale';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { getTashkentNow } from '@/lib/formatters';

interface SundayMakeupsSectionProps {
  makeups?: Makeup[];
  lessons: Lesson[];
  students: Student[];
  onScheduleSundayMakeup: (makeupIdOrLesson: any, sundayDate: string, timeStr: string) => Promise<void>;
  onArchiveMakeup: (makeupIdOrLessonId: string) => Promise<void>;
}

export const SundayMakeupsSection: React.FC<SundayMakeupsSectionProps> = ({
  makeups = [],
  lessons,
  students,
  onScheduleSundayMakeup,
  onArchiveMakeup,
}) => {
  // Combine pending makeups from prop or lessons with needs_makeup
  const pendingLessons = lessons.filter((l) => (l.status === 'missed' && l.needs_makeup) || l.status === 'missed_excused');

  const [selectedItem, setSelectedItem] = useState<{ id: string; studentName: string; reason?: string } | null>(null);
  const [selectedTime, setSelectedTime] = useState('12:00 - 13:30');

  const now = getTashkentNow();
  const upcomingSunday = nextSunday(now);
  const sundayDateStr = format(upcomingSunday, 'yyyy-MM-dd');
  const sundayFormatted = format(upcomingSunday, 'd MMMM (EEEE)', { locale: ru });

  if (pendingLessons.length === 0 && makeups.length === 0) return null;

  const items = makeups.length > 0 
    ? makeups.map(m => ({
        id: m.id,
        lessonId: m.missed_lesson_id,
        studentName: m.student_name || 'Ученик',
        date: m.missed_date || m.created_at,
        reason: m.reason || 'Пропуск занятия',
      }))
    : pendingLessons.map(l => ({
        id: l.id,
        lessonId: l.id,
        studentName: l.student_name || students.find(s => s.id === l.student_id)?.name || 'Ученик',
        date: l.date,
        reason: l.miss_reason || l.notes || 'Пропуск занятия',
      }));

  const formatRuDate = (dateStr: string) => {
    try {
      const raw = dateStr.includes('T') ? dateStr.substring(0, 10) : dateStr;
      const d = parseISO(raw);
      return format(d, 'd MMMM', { locale: ru });
    } catch {
      return dateStr;
    }
  };

  const handleConfirmSchedule = async () => {
    if (!selectedItem) return;
    hapticNotification('success');
    await onScheduleSundayMakeup(selectedItem.id, sundayDateStr, selectedTime);
    setSelectedItem(null);
  };

  return (
    <section className="space-y-2 mb-4">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
          <span className="text-sm">🎯</span>
          <span>Отработки на воскресенье</span>
          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-mono text-[11px] font-semibold border border-amber-300">
            {items.length}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/90 flex items-center justify-between gap-3 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="font-bold text-gray-900 text-[13px] truncate">
                {item.studentName}
              </div>
              <div className="text-[11px] text-amber-900 flex items-center gap-1 mt-0.5 font-medium">
                <span>Пропуск:</span>
                <span className="font-semibold text-gray-800">{formatRuDate(item.date)}</span>
                <span className="text-gray-400">•</span>
                <span className="text-amber-800 truncate italic">«{item.reason}»</span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  setSelectedItem(item);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold shadow-sm active:scale-95 transition-all"
                title="Назначить слот в воскресенье"
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>В ВС</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (confirm(`Перенести пропуск ученика «${item.studentName}» в архив без отработки?`)) {
                    hapticNotification('warning');
                    onArchiveMakeup(item.id);
                  }
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 text-xs font-medium border border-gray-200 active:scale-95 transition-all"
                title="В архив (без отработки)"
              >
                <Archive className="w-3.5 h-3.5 text-gray-500" />
                <span>В архив</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal for picking Sunday Time Slot */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-3">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-gray-900">Назначить отработку</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Ученик: <strong className="text-gray-800">{selectedItem.studentName}</strong>
                </p>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl text-xs text-blue-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Воскресенье: <b>{sundayFormatted}</b></span>
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1.5">Время отработки:</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {['10:00 - 11:30', '12:00 - 13:30', '14:00 - 15:30', '16:00 - 17:30'].map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      hapticImpact('light');
                      setSelectedTime(slot);
                    }}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition-all ${
                      selectedTime === slot
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                placeholder="Или введите свое: 15:00 - 16:30"
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-hidden focus:border-blue-500"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-semibold active:scale-98"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmSchedule}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/20 active:scale-98 flex items-center justify-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                <span>Назначить</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
