'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Student, Lesson, Makeup, LessonStatus } from '@/types';
import { format, addDays, startOfWeek, isSameDay, addWeeks, subWeeks, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Plus, ChevronLeft, ChevronRight, List, LayoutGrid, Clock, Check, X, Calendar, RotateCcw } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { getTashkentNow } from '@/lib/formatters';
import { SundayMakeupsSection } from '../SundayMakeupsSection';

interface ScheduleTabProps {
  students: Student[];
  lessons: Lesson[];
  makeups?: Makeup[];
  onAddLesson: () => void;
  onOpenLesson: (lesson: Lesson) => void;
  onUpdateLessonTime: (lessonId: string, timeStr: string, dateStr?: string) => Promise<void>;
  onSetLessonStatus: (lessonId: string, status: LessonStatus, missReason?: string, needsMakeup?: boolean) => Promise<void>;
  onScheduleSundayMakeup: (makeupIdOrLesson: any, sundayDate: string, timeStr: string) => Promise<void>;
  onArchiveMakeup: (makeupId: string) => Promise<void>;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  students,
  lessons,
  makeups = [],
  onAddLesson,
  onOpenLesson,
  onUpdateLessonTime,
  onSetLessonStatus,
  onScheduleSundayMakeup,
  onArchiveMakeup,
}) => {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(startOfWeek(getTashkentNow(), { weekStartsOn: 1 }));
  const [selectedDate, setSelectedDate] = useState<Date>(getTashkentNow());
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const gridRef = useRef<HTMLDivElement>(null);

  // Bottom Sheet for Miss Lesson
  const [missModalLesson, setMissModalLesson] = useState<Lesson | null>(null);
  const [missReason, setMissReason] = useState('Болеет');
  const [needsMakeup, setNeedsMakeup] = useState(true);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  const hours = Array.from({ length: 16 }, (_, i) => i + 8); // 08:00 to 23:00

  const HOUR_HEIGHT = 60; // 60px per hour
  const START_HOUR = 8;

  useEffect(() => {
    if (gridRef.current) {
      gridRef.current.scrollTop = 4 * 60; // scroll to 12:00 by default
    }
  }, []);

  const parseTimeStr = (timeStr?: string) => {
    if (!timeStr) return { startH: 14, startM: 0, durationMinutes: 60 };
    const parts = timeStr.split(' - ');
    if (parts.length !== 2) return { startH: 14, startM: 0, durationMinutes: 60 };

    const start = parts[0].split(':').map(Number);
    const end = parts[1].split(':').map(Number);

    const startTotal = (start[0] || 14) * 60 + (start[1] || 0);
    const endTotal = (end[0] || 15) * 60 + (end[1] || 0);
    let duration = endTotal - startTotal;
    if (duration < 0) duration += 24 * 60;

    return { startH: start[0], startM: start[1], durationMinutes: duration };
  };

  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const handlePrevWeek = () => {
    hapticImpact('light');
    setCurrentWeekStart((prev) => subWeeks(prev, 1));
  };

  const handleNextWeek = () => {
    hapticImpact('light');
    setCurrentWeekStart((prev) => addWeeks(prev, 1));
  };

  // --- Drag and Drop Logic ---
  const [draggingLesson, setDraggingLesson] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const [initialY, setInitialY] = useState(0);
  const [initialTop, setInitialTop] = useState(0);

  const handleTouchStart = (e: React.TouchEvent, lessonId: string, currentTop: number) => {
    hapticImpact('medium');
    setDraggingLesson(lessonId);
    setInitialY(e.touches[0].clientY);
    setDragY(e.touches[0].clientY);
    setInitialTop(currentTop);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggingLesson) return;
    setDragY(e.touches[0].clientY);
  };

  const handleTouchEnd = async (lesson: Lesson) => {
    if (!draggingLesson) return;
    setDraggingLesson(null);
    hapticImpact('light');

    const deltaY = dragY - initialY;
    if (Math.abs(deltaY) < 10) {
      onOpenLesson(lesson);
      return;
    }

    const newTop = Math.max(0, initialTop + deltaY);
    const snappedTop = Math.round(newTop / 15) * 15;

    const newTotalMinutes = snappedTop;
    const newH = START_HOUR + Math.floor(newTotalMinutes / 60);
    const newM = newTotalMinutes % 60;

    const { durationMinutes } = parseTimeStr(lesson.time_str);
    const endTotal = newTotalMinutes + durationMinutes;
    const endH = START_HOUR + Math.floor(endTotal / 60);
    const endM = endTotal % 60;

    const pad = (n: number) => n.toString().padStart(2, '0');
    const newTimeStr = `${pad(newH)}:${pad(newM)} - ${pad(endH)}:${pad(endM)}`;

    if (window.confirm(`Перенести урок на ${newTimeStr}?`)) {
      await onUpdateLessonTime(lesson.id, newTimeStr);
    }
  };

  const handleQuickComplete = async (e: React.MouseEvent, lesson: Lesson) => {
    e.stopPropagation();
    hapticNotification('success');
    await onSetLessonStatus(lesson.id, 'completed');
  };

  const handleOpenMissModal = (e: React.MouseEvent, lesson: Lesson) => {
    e.stopPropagation();
    hapticImpact('medium');
    setMissModalLesson(lesson);
    setMissReason(lesson.miss_reason || 'Болеет');
    setNeedsMakeup(true);
  };

  const handleConfirmMiss = async () => {
    if (!missModalLesson) return;
    hapticNotification('warning');
    await onSetLessonStatus(missModalLesson.id, 'missed', missReason.trim(), needsMakeup);
    setMissModalLesson(null);
  };

  return (
    <div className="flex flex-col h-full bg-white pb-safe overscroll-none">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-white z-20 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <button onClick={handlePrevWeek} className="p-1 text-gray-400 hover:text-gray-800">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-black text-gray-900 capitalize w-28 text-center">
            {format(currentWeekStart, 'LLLL', { locale: ru })}
          </h1>
          <button onClick={handleNextWeek} className="p-1 text-gray-400 hover:text-gray-800">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              hapticImpact('light');
              setViewMode(viewMode === 'grid' ? 'list' : 'grid');
            }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-black active:scale-95"
            title={viewMode === 'grid' ? 'Переключить в список' : 'Переключить в сетку'}
          >
            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
          <button
            onClick={() => {
              hapticImpact('light');
              onAddLesson();
            }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-600 text-white shadow-sm active:scale-95"
            title="Добавить урок"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Week Day Strip */}
      <div className="flex bg-white z-20 border-b border-gray-100 py-2 px-2">
        {weekDays.map((day) => {
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, getTashkentNow());
          return (
            <button
              key={day.toISOString()}
              onClick={() => {
                hapticImpact('light');
                setSelectedDate(day);
              }}
              className="flex-1 flex flex-col items-center"
            >
              <span className={`text-[10px] font-bold uppercase mb-1 ${isSelected ? 'text-blue-600' : 'text-gray-400'}`}>
                {format(day, 'EEEEEE', { locale: ru })}
              </span>
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isToday
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-800 hover:bg-gray-100'
                }`}
              >
                {format(day, 'd')}
              </div>
            </button>
          );
        })}
      </div>

      {/* 7-Day Time Grid / List View */}
      {viewMode === 'grid' ? (
        <div ref={gridRef} className="flex-1 overflow-y-auto relative bg-white">
          <div className="relative min-w-full flex" style={{ height: hours.length * HOUR_HEIGHT }}>
            {/* Left Axis (Hours) */}
            <div className="w-10 flex flex-col border-r border-gray-100 bg-white z-10 sticky left-0">
              {hours.map((hour) => (
                <div key={hour} className="relative w-full" style={{ height: HOUR_HEIGHT }}>
                  <span className="absolute -top-2.5 right-1 text-[11px] text-gray-400 font-medium">
                    {hour.toString().padStart(2, '0')}
                  </span>
                </div>
              ))}
            </div>

            {/* 7 Columns Container */}
            <div className="flex-1 flex relative">
              <div className="absolute inset-0 pointer-events-none">
                {hours.map((hour, i) => (
                  <React.Fragment key={hour}>
                    <div className="absolute w-full border-t border-gray-100" style={{ top: i * HOUR_HEIGHT }} />
                    <div
                      className="absolute w-full border-t border-gray-50 border-dashed"
                      style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }}
                    />
                  </React.Fragment>
                ))}
              </div>

              {/* 7 Day Columns */}
              {weekDays.map((day) => {
                const isSelected = isSameDay(day, selectedDate);
                const dayStr = format(day, 'yyyy-MM-dd');
                const dayLessons = lessons.filter((l) => l.date.startsWith(dayStr));

                return (
                  <div
                    key={dayStr}
                    className={`flex-1 relative border-r border-gray-100 ${isSelected ? 'bg-blue-50/20' : ''}`}
                  >
                    {dayLessons.map((lesson) => {
                      const { startH, startM, durationMinutes } = parseTimeStr(lesson.time_str);
                      const topPos = (startH - START_HOUR) * 60 + startM;
                      if (startH < START_HOUR || startH > 23) return null;

                      const student = students.find((s) => s.id === lesson.student_id);
                      const baseColor = student?.color || '#3B82F6';
                      const bgColor = hexToRgba(baseColor, 0.35);

                      const isDragging = draggingLesson === lesson.id;
                      const displayTop = isDragging ? initialTop + (dragY - initialY) : topPos;
                      const isCompleted = lesson.status === 'completed';
                      const isMissed = lesson.status === 'missed' || lesson.status === 'missed_excused' || lesson.status === 'missed_penalty';

                      return (
                        <div
                          key={lesson.id}
                          onTouchStart={(e) => handleTouchStart(e, lesson.id, topPos)}
                          onTouchMove={handleTouchMove}
                          onTouchEnd={() => handleTouchEnd(lesson)}
                          className={`absolute left-0.5 right-0.5 rounded-lg shadow-xs overflow-hidden cursor-pointer transition-transform ${
                            isDragging ? 'z-50 scale-105 opacity-90' : 'z-20 active:scale-95'
                          }`}
                          style={{
                            top: displayTop,
                            height: Math.max(30, durationMinutes),
                            backgroundColor: bgColor,
                            borderLeft: `3px solid ${baseColor}`,
                            opacity: isDragging ? 0.9 : isCompleted || isMissed ? 0.6 : 1,
                            touchAction: 'none',
                          }}
                        >
                          <div className="p-1 flex flex-col h-full">
                            <span className="text-[8px] font-bold text-gray-800 leading-none">
                              {lesson.time_str?.split(' - ')[0]}
                            </span>
                            <span className="text-[10px] font-black text-gray-900 truncate leading-tight mt-0.5">
                              {lesson.student_name}
                            </span>
                            <div className="flex-1" />
                            {isCompleted && <span className="text-[8px] font-bold text-green-700">✅ Проведен</span>}
                            {isMissed && <span className="text-[8px] font-bold text-red-700">❌ Пропуск</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="h-28" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-[#f2f2f7] p-4 space-y-4 pb-32">
          {/* Sunday Makeups Banner if any pending */}
          <SundayMakeupsSection
            makeups={makeups}
            lessons={lessons}
            students={students}
            onScheduleSundayMakeup={onScheduleSundayMakeup}
            onArchiveMakeup={onArchiveMakeup}
          />

          {/* Lessons by Day */}
          {weekDays.map((day) => {
            const dayStr = format(day, 'yyyy-MM-dd');
            const dayLessons = lessons
              .filter((l) => l.date.startsWith(dayStr))
              .sort((a, b) => (a.time_str || '').localeCompare(b.time_str || ''));

            if (dayLessons.length === 0) return null;

            return (
              <div key={dayStr} className="space-y-2">
                <h2 className="text-[11px] font-black text-gray-500 uppercase flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                      isSameDay(day, getTashkentNow()) ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'
                    }`}
                  >
                    {format(day, 'd')}
                  </span>
                  <span>{format(day, 'EEEE', { locale: ru })}</span>
                </h2>

                <div className="space-y-2">
                  {dayLessons.map((lesson) => {
                    const student = students.find((s) => s.id === lesson.student_id);
                    const baseColor = student?.color || '#3B82F6';
                    const isCompleted = lesson.status === 'completed';
                    const isMissed = lesson.status === 'missed' || lesson.status === 'missed_excused' || lesson.status === 'missed_penalty';
                    const target = student?.monthly_target_lessons || 12;
                    const conducted = student?.conducted_this_month || 0;

                    return (
                      <div
                        key={lesson.id}
                        onClick={() => {
                          hapticImpact('light');
                          onOpenLesson(lesson);
                        }}
                        className={`bg-white rounded-2xl p-3.5 shadow-xs border-l-4 flex items-center gap-3 cursor-pointer active:scale-[0.98] transition-all hover:shadow-md ${
                          isCompleted || isMissed ? 'opacity-70' : ''
                        }`}
                        style={{ borderLeftColor: baseColor }}
                      >
                        {/* Time */}
                        <div className="flex flex-col text-center min-w-[50px]">
                          <span className="font-black text-gray-900 text-sm">
                            {lesson.time_str?.split(' - ')[0] || '16:00'}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400">
                            {lesson.time_str?.split(' - ')[1] || '17:30'}
                          </span>
                        </div>

                        {/* Student & Progress */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-black text-gray-900 text-[14px] leading-tight truncate">
                              {lesson.student_name}
                            </h3>
                            {/* Monthly Progress Badge e.g. 10/12 */}
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 shrink-0">
                              {conducted}/{target}
                            </span>
                          </div>

                          {isMissed && lesson.miss_reason ? (
                            <p className="text-[11px] font-bold text-red-600 line-clamp-1 mt-0.5 italic">
                              ❌ {lesson.miss_reason} {lesson.needs_makeup ? '• В ВС' : ''}
                            </p>
                          ) : (
                            <p className="text-[11px] font-medium text-gray-500 line-clamp-1 mt-0.5">
                              {lesson.notes || (lesson.is_makeup ? '🔄 Отработка' : 'Плановый урок')}
                            </p>
                          )}
                        </div>

                        {/* Quick 1-tap Status Buttons */}
                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={(e) => handleQuickComplete(e, lesson)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                              isCompleted
                                ? 'bg-green-600 text-white shadow-xs'
                                : 'bg-gray-100 text-gray-400 hover:bg-green-100 hover:text-green-700'
                            }`}
                            title="Отметить проведенным"
                          >
                            <Check className="w-4 h-4" strokeWidth={3} />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleOpenMissModal(e, lesson)}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                              isMissed
                                ? 'bg-red-600 text-white shadow-xs'
                                : 'bg-gray-100 text-gray-400 hover:bg-red-100 hover:text-red-700'
                            }`}
                            title="Отметить пропущенным"
                          >
                            <X className="w-4 h-4" strokeWidth={3} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {weekDays.every((day) => lessons.filter((l) => l.date.startsWith(format(day, 'yyyy-MM-dd'))).length === 0) && (
            <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
              <Clock className="w-10 h-10 text-gray-400 mb-2" />
              <p className="text-gray-500 font-bold text-xs">На этой неделе нет занятий</p>
            </div>
          )}
        </div>
      )}

      {/* Compact Bottom Sheet / Modal for Missing a Lesson */}
      {missModalLesson && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-3">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-black text-gray-900">Урок пропущен ❌</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Ученик: <strong className="text-gray-800">{missModalLesson.student_name}</strong>
                </p>
              </div>
              <button
                onClick={() => setMissModalLesson(null)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick chips */}
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1.5">
                Быстрая причина:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {['Болеет', 'Семейные обстоятельства', 'Уехал', 'Школьное мероприятие', 'Не вышел на связь'].map(
                  (chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        hapticImpact('light');
                        setMissReason(chip);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                        missReason === chip
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {chip}
                    </button>
                  )
                )}
              </div>
            </div>

            {/* Reason text input */}
            <input
              type="text"
              value={missReason}
              onChange={(e) => setMissReason(e.target.value)}
              placeholder="Или укажите свою причину..."
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-hidden focus:border-blue-500"
            />

            {/* Sunday Makeup Toggle */}
            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-amber-900 block">
                  Назначить отработку на воскресенье
                </span>
                <span className="text-[10px] text-amber-700 font-medium">
                  {needsMakeup ? 'Урок добавится в блок отработок' : 'Просто зафиксировать в архиве'}
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={needsMakeup}
                  onChange={(e) => {
                    hapticImpact('light');
                    setNeedsMakeup(e.target.checked);
                  }}
                  className="sr-only peer"
                />
                <div className="w-10 h-5 bg-gray-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600" />
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setMissModalLesson(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmMiss}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold shadow-md shadow-red-500/20 active:scale-98"
              >
                Зафиксировать пропуск
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
