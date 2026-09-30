'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Student, Lesson } from '@/types';
import { format, addDays, startOfWeek, isSameDay, parseISO, addWeeks, subWeeks } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Plus, Settings, CircleDollarSign, ChevronLeft, ChevronRight } from 'lucide-react';
import { hapticImpact } from '@/lib/telegram';
import { getTashkentNow } from '@/lib/formatters';

interface ScheduleTabProps {
  students: Student[];
  lessons: Lesson[];
  onAddLesson: () => void;
  onOpenLesson: (lesson: Lesson) => void;
  onUpdateLessonTime: (lessonId: string, timeStr: string, dateStr?: string) => Promise<void>;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({ students, lessons, onAddLesson, onOpenLesson, onUpdateLessonTime }) => {
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(startOfWeek(getTashkentNow(), { weekStartsOn: 1 }));
  const [selectedDate, setSelectedDate] = useState<Date>(getTashkentNow());
  const gridRef = useRef<HTMLDivElement>(null);

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
    setCurrentWeekStart(prev => subWeeks(prev, 1));
  };

  const handleNextWeek = () => {
    hapticImpact('light');
    setCurrentWeekStart(prev => addWeeks(prev, 1));
  };

  // --- Drag and Drop Logic ---
  const [draggingLesson, setDraggingLesson] = useState<string | null>(null);
  const [dragY, setDragY] = useState(0);
  const [initialY, setInitialY] = useState(0);
  const [initialTop, setInitialTop] = useState(0);

  const handleTouchStart = (e: React.TouchEvent, lessonId: string, currentTop: number) => {
    // e.stopPropagation();
    hapticImpact('medium');
    setDraggingLesson(lessonId);
    setInitialY(e.touches[0].clientY);
    setDragY(e.touches[0].clientY);
    setInitialTop(currentTop);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggingLesson) return;
    // e.preventDefault(); // React synthetic events might warn here, but it helps stop scroll
    setDragY(e.touches[0].clientY);
  };

  const handleTouchEnd = async (lesson: Lesson) => {
    if (!draggingLesson) return;
    setDraggingLesson(null);
    hapticImpact('light');

    const deltaY = dragY - initialY;
    if (Math.abs(deltaY) < 10) {
      // It was just a tap
      onOpenLesson(lesson);
      return;
    }

    // Calculate new time based on snap to 15 mins (15px = 15 mins since 60px = 60 mins)
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

  return (
    <div className="flex flex-col h-full bg-white pb-safe overscroll-none">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-white z-20">
        <button className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-800">
          <CircleDollarSign className="w-5 h-5" />
        </button>
        
        <div className="flex items-center gap-3">
          <button onClick={handlePrevWeek} className="p-1 text-gray-400 hover:text-gray-800"><ChevronLeft className="w-5 h-5"/></button>
          <h1 className="text-lg font-bold text-black capitalize w-28 text-center">
            {format(currentWeekStart, 'LLLL', { locale: ru })}
          </h1>
          <button onClick={handleNextWeek} className="p-1 text-gray-400 hover:text-gray-800"><ChevronRight className="w-5 h-5"/></button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => { hapticImpact('light'); onAddLesson(); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-black">
            <Plus className="w-5 h-5" />
          </button>
          <button className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-black">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Week Strip (Header for Grid) */}
      <div className="flex bg-white z-20 border-b border-gray-100 pb-2 pl-10 pr-2">
        {weekDays.map(day => {
          const isSelected = isSameDay(day, selectedDate);
          return (
            <button
              key={day.toISOString()}
              onClick={() => { hapticImpact('light'); setSelectedDate(day); }}
              className="flex-1 flex flex-col items-center"
            >
              <span className={`text-[10px] font-bold uppercase mb-1 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`}>
                {format(day, 'EEEEEE', { locale: ru })}
              </span>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                isSelected ? 'bg-blue-500 text-white' : 'text-black'
              }`}>
                {format(day, 'd')}
              </div>
            </button>
          );
        })}
      </div>

      {/* 7-Day Time Grid */}
      <div ref={gridRef} className="flex-1 overflow-y-auto relative bg-white">
        <div className="relative min-w-full flex" style={{ height: hours.length * HOUR_HEIGHT }}>
          
          {/* Left Axis (Hours) */}
          <div className="w-10 flex flex-col border-r border-gray-100 bg-white z-10 sticky left-0">
            {hours.map((hour, i) => (
              <div key={hour} className="relative w-full" style={{ height: HOUR_HEIGHT }}>
                <span className="absolute -top-2.5 right-1 text-[11px] text-gray-500 font-medium">
                  {hour.toString().padStart(2, '0')}
                </span>
              </div>
            ))}
          </div>

          {/* 7 Columns Container */}
          <div className="flex-1 flex relative">
            {/* Horizontal Lines (Background) */}
            <div className="absolute inset-0 pointer-events-none">
              {hours.map((hour, i) => (
                <React.Fragment key={hour}>
                  <div className="absolute w-full border-t border-gray-200" style={{ top: i * HOUR_HEIGHT }}></div>
                  <div className="absolute w-full border-t border-gray-100 border-dashed" style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT/2 }}></div>
                </React.Fragment>
              ))}
            </div>

            {/* Current Time Indicator */}
            {(getTashkentNow() >= currentWeekStart && getTashkentNow() <= addDays(currentWeekStart, 7)) ? (
              <div 
                className="absolute w-full flex items-center z-20 pointer-events-none"
                style={{ top: ((getTashkentNow().getHours() - START_HOUR) * 60) + getTashkentNow().getMinutes() }}
              >
                <div className="w-full border-t-2 border-blue-500 relative">
                  <div className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-blue-500 rounded-full"></div>
                </div>
              </div>
            ) : null}

            {/* 7 Day Columns */}
            {weekDays.map((day, dayIndex) => {
              const isSelected = isSameDay(day, selectedDate);
              const dayStr = format(day, 'yyyy-MM-dd');
              const dayLessons = lessons.filter(l => l.date.startsWith(dayStr));

              return (
                <div 
                  key={dayStr} 
                  className={`flex-1 relative border-r border-gray-100 ${isSelected ? 'bg-blue-50/30' : ''}`}
                >
                  {dayLessons.map(lesson => {
                    const { startH, startM, durationMinutes } = parseTimeStr(lesson.time_str);
                    const topPos = ((startH - START_HOUR) * 60) + startM;
                    if (startH < START_HOUR || startH > 23) return null;

                    const student = students.find(s => s.id === lesson.student_id);
                    const baseColor = student?.color || '#3B82F6';
                    const bgColor = hexToRgba(baseColor, 0.4);
                    
                    const isDragging = draggingLesson === lesson.id;
                    const displayTop = isDragging ? initialTop + (dragY - initialY) : topPos;

                    return (
                      <div
                        key={lesson.id}
                        onTouchStart={(e) => handleTouchStart(e, lesson.id, topPos)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={() => handleTouchEnd(lesson)}
                        className={`absolute left-0.5 right-0.5 rounded shadow-sm overflow-hidden cursor-pointer transition-transform ${isDragging ? 'z-50 scale-105 opacity-90' : 'z-20 active:scale-95'}`}
                        style={{ 
                          top: displayTop, 
                          height: durationMinutes,
                          backgroundColor: bgColor,
                          borderLeft: `3px solid ${baseColor}`,
                          opacity: isDragging ? 0.9 : (lesson.status === 'completed' || lesson.status.startsWith('missed_') ? 0.5 : 1),
                          touchAction: 'none' // Crucial to prevent page scroll while dragging
                        }}
                      >
                        <div className="p-1 flex flex-col h-full">
                          <span className="text-[8px] font-bold text-black leading-none">{lesson.time_str?.split(' - ')[0]}</span>
                          <span className="text-[10px] font-black text-black truncate leading-tight mt-0.5">{lesson.student_name}</span>
                          <div className="flex-1"></div>
                          <span className="text-[8px] font-bold text-black leading-none">{lesson.time_str?.split(' - ')[1]}</span>
                        </div>
                        {lesson.status === 'completed' && (
                          <div className="absolute top-1 right-1 bg-white/50 rounded-full p-0.5">
                            <svg className="w-2 h-2 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                          </div>
                        )}
                        {lesson.status === 'missed_penalty' && (
                          <div className="absolute top-1 right-1 bg-red-100 rounded-full p-0.5">
                            <svg className="w-2 h-2 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                          </div>
                        )}
                        {lesson.status === 'missed_excused' && (
                          <div className="absolute top-1 right-1 bg-orange-100 rounded-full p-0.5">
                            <svg className="w-2 h-2 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <div className="h-24"></div> {/* Bottom padding */}
      </div>
    </div>
  );
};
