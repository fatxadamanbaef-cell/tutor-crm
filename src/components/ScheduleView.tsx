'use client';

import React, { useState } from 'react';
import { Lesson, Student } from '@/types';
import {
  format,
  addDays,
  subDays,
  isSameDay,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  Calendar as CalendarIcon,
  Trash2,
  RotateCcw,
  BookOpen,
} from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { formatCurrency } from '@/lib/formatters';
import confetti from 'canvas-confetti';

interface ScheduleViewProps {
  lessons: Lesson[];
  students: Student[];
  onCompleteLesson: (lessonId: string) => void;
  onMissLesson: (lesson: Lesson) => void;
  onDeleteLesson: (lessonId: string) => void;
  onAddLessonForDate: (dateStr: string) => void;
  onRevertLesson: (lessonId: string) => void;
  onOpenAutoSchedule: () => void;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  lessons,
  students,
  onCompleteLesson,
  onMissLesson,
  onDeleteLesson,
  onAddLessonForDate,
  onRevertLesson,
  onOpenAutoSchedule,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  // Generate 14 days around selected date
  const baseDate = new Date();
  const days = Array.from({ length: 14 }).map((_, i) => addDays(subDays(baseDate, 2), i));

  const selectedDateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayLessons = lessons
    .filter((l) => l.lesson_date === selectedDateStr)
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  const completedCount = dayLessons.filter((l) => l.status === 'completed').length;
  const scheduledCount = dayLessons.filter((l) => l.status === 'scheduled').length;
  const missedCount = dayLessons.filter((l) => l.status === 'missed_makeup').length;

  const triggerCelebration = () => {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.7 },
      colors: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899'],
    });
  };

  const getStudentInfo = (studentId: string) => {
    return students.find((s) => s.id === studentId);
  };

  return (
    <div className="space-y-3 pb-24">
      {/* Date selector strip - Compact */}
      <div className="bg-slate-900/90 p-2.5 rounded-2xl border border-slate-800/80 shadow-sm">
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-xs font-bold text-slate-100 capitalize">
              {format(selectedDate, 'LLLL yyyy', { locale: ru })}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                hapticImpact('light');
                setSelectedDate(new Date());
              }}
              className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/30 active:scale-95"
            >
              Сегодня
            </button>
            <button
              onClick={() => {
                hapticImpact('light');
                setSelectedDate(addDays(new Date(), 1));
              }}
              className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700/60 active:scale-95"
            >
              Завтра
            </button>
          </div>
        </div>

        {/* Days Strip - without native scrollbars */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar scroll-smooth">
          {days.map((day) => {
            const isSelected = isSameDay(day, selectedDate);
            const isTodayDate = isSameDay(day, new Date());
            const dayStr = format(day, 'yyyy-MM-dd');
            const dayLessonsCount = lessons.filter((l) => l.lesson_date === dayStr).length;

            return (
              <button
                key={day.toISOString()}
                onClick={() => {
                  hapticImpact('light');
                  setSelectedDate(day);
                }}
                className={`flex flex-col items-center justify-center min-w-[46px] py-1.5 px-1 rounded-xl transition-all duration-200 active:scale-95 relative shrink-0 ${
                  isSelected
                    ? 'bg-gradient-to-b from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30 font-bold'
                    : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700/60 border border-slate-700/30'
                }`}
              >
                <span className="text-[9px] uppercase tracking-wider opacity-80">
                  {format(day, 'ccc', { locale: ru })}
                </span>
                <span className="text-sm font-bold my-0.5 leading-tight">
                  {format(day, 'd')}
                </span>
                {dayLessonsCount > 0 && (
                  <span
                    className={`w-1 h-1 rounded-full ${
                      isSelected ? 'bg-white' : 'bg-blue-400'
                    }`}
                  />
                )}
                {isTodayDate && !isSelected && (
                  <span className="absolute -top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-400 ring-1 ring-slate-900" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Auto-schedule mini trigger banner */}
      <button
        onClick={() => {
          hapticImpact('medium');
          onOpenAutoSchedule();
        }}
        className="w-full flex items-center justify-center gap-1.5 bg-indigo-950/40 hover:bg-indigo-900/40 text-indigo-300 border border-indigo-800/40 text-[11px] font-semibold py-1.5 px-3 rounded-xl transition-all active:scale-95"
      >
        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
        <span>Авто-расписание (Пн/Ср/Пт или Вт/Чт/Сб)</span>
      </button>

      {/* Day Overview Header */}
      <div className="flex items-center justify-between px-1 text-[11px] text-slate-400">
        <div>
          <span className="font-semibold text-slate-200 capitalize">
            {format(selectedDate, 'EEEE, d MMMM', { locale: ru })}:
          </span>{' '}
          {dayLessons.length === 0
            ? 'нет уроков'
            : `${dayLessons.length} ${
                dayLessons.length === 1 ? 'урок' : 'урока'
              }`}
        </div>
        <div className="flex items-center gap-2 font-medium">
          {completedCount > 0 && (
            <span className="text-emerald-400 font-semibold">✓ {completedCount}</span>
          )}
          {scheduledCount > 0 && (
            <span className="text-blue-400 font-semibold">⏳ {scheduledCount}</span>
          )}
          {missedCount > 0 && (
            <span className="text-rose-400 font-semibold">⚠️ {missedCount}</span>
          )}
        </div>
      </div>

      {/* Lesson Cards List - Ultra Compact & Clean */}
      <div className="space-y-2">
        {dayLessons.length === 0 ? (
          <div className="text-center py-8 px-4 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
            <Clock className="w-6 h-6 mx-auto text-slate-500 mb-1.5" />
            <h3 className="text-xs font-medium text-slate-300 mb-2">
              На этот день уроков нет
            </h3>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  hapticImpact('medium');
                  onAddLessonForDate(selectedDateStr);
                }}
                className="bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 text-[11px] font-semibold px-3 py-1.5 rounded-xl active:scale-95"
              >
                + Добавить урок
              </button>
              <button
                onClick={() => {
                  hapticImpact('medium');
                  onOpenAutoSchedule();
                }}
                className="bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 border border-indigo-500/30 text-[11px] font-semibold px-3 py-1.5 rounded-xl active:scale-95"
              >
                ✨ Авто-расписание
              </button>
            </div>
          </div>
        ) : (
          dayLessons.map((lesson) => {
            const student = getStudentInfo(lesson.student_id);
            const isCompleted = lesson.status === 'completed';
            const isMissed = lesson.status === 'missed_makeup';
            const isMadeUp = lesson.status === 'made_up';

            const remainingLessons = student?.package_remaining_lessons ?? 0;
            const isPackageEnding =
              student?.payment_type === 'package' && remainingLessons <= 1;

            return (
              <div
                key={lesson.id}
                className={`p-3 rounded-2xl border transition-all duration-200 relative overflow-hidden ${
                  isCompleted
                    ? 'bg-slate-900/40 border-emerald-900/30 opacity-90'
                    : isMissed
                    ? 'bg-rose-950/20 border-rose-800/40'
                    : isMadeUp
                    ? 'bg-indigo-950/20 border-indigo-800/40'
                    : 'bg-slate-900/90 border-slate-800 shadow-sm'
                }`}
              >
                {/* Left side student color marker */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{
                    backgroundColor: student?.color || lesson.student_color || '#3B82F6',
                  }}
                />

                <div className="pl-1.5 space-y-2">
                  {/* Top Row: Time + Student Name + Price */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex items-center gap-1 text-[11px] font-bold text-slate-100 bg-slate-800 px-2 py-0.5 rounded-lg shrink-0">
                        <Clock className="w-3 h-3 text-blue-400" />
                        <span>
                          {lesson.start_time} - {lesson.end_time}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-100 truncate">
                        {student?.name || lesson.student_name}
                      </h3>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold text-slate-200">
                        {formatCurrency(lesson.price)}
                      </span>
                    </div>
                  </div>

                  {/* Middle Row: Badge info & notes */}
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {student?.payment_type === 'package' ? (
                        <span
                          className={`font-medium px-2 py-0.5 rounded-md border ${
                            isPackageEnding
                              ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 font-semibold'
                              : 'bg-blue-500/10 text-blue-300 border-blue-500/20'
                          }`}
                        >
                          📦 Абонемент: ост. {remainingLessons} из{' '}
                          {student.package_total_lessons} ур.
                        </span>
                      ) : (
                        <span className="font-medium px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                          💵 Поурочно
                        </span>
                      )}

                      {lesson.notes && (
                        <span className="text-slate-400 truncate max-w-[140px] flex items-center gap-0.5">
                          • {lesson.notes}
                        </span>
                      )}
                    </div>

                    {isCompleted && (
                      <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                        ✓ Проведен
                      </span>
                    )}
                    {isMissed && (
                      <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-1.5 py-0.2 rounded border border-rose-500/20">
                        ⚠️ Отработка
                      </span>
                    )}
                  </div>

                  {/* Action Buttons - Compact */}
                  <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2">
                    {!isCompleted && !isMissed ? (
                      <>
                        <button
                          onClick={() => {
                            hapticNotification('success');
                            triggerCelebration();
                            onCompleteLesson(lesson.id);
                          }}
                          className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold py-1.5 px-3 rounded-xl transition-all shadow-sm active:scale-95"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Проведен</span>
                        </button>

                        <button
                          onClick={() => {
                            hapticImpact('medium');
                            onMissLesson(lesson);
                          }}
                          className="flex items-center justify-center gap-1 bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 border border-slate-700/60 text-xs font-medium py-1.5 px-3 rounded-xl transition-all active:scale-95"
                        >
                          <AlertCircle className="w-3 h-3 text-rose-400" />
                          <span>Пропуск</span>
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          hapticImpact('light');
                          onRevertLesson(lesson.id);
                        }}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 py-1 px-2 rounded-lg bg-slate-800/50"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Вернуть в план</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        hapticNotification('warning');
                        onDeleteLesson(lesson.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Удалить урок"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
