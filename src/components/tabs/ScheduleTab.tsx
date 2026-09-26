'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Student, Lesson } from '@/types';
import { format, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Plus, Settings } from 'lucide-react';
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
  const [selectedDate, setSelectedDate] = useState<Date>(getTashkentNow());
  const gridRef = useRef<HTMLDivElement>(null);

  // Generate week dates based on selectedDate
  const startOfWk = startOfWeek(selectedDate, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(startOfWk, i));

  // Auto-scroll to 08:00 on mount
  useEffect(() => {
    if (gridRef.current) {
      // 60px per hour, 8 hours = 480px. Scroll slightly above.
      gridRef.current.scrollTop = 8 * 60 - 20;
    }
  }, []);

  // Filter lessons for selected date
  const dayLessons = lessons.filter(l => {
    const lDate = parseISO(l.date);
    return isSameDay(lDate, selectedDate);
  });

  const hours = Array.from({ length: 17 }, (_, i) => i + 7); // 07:00 to 23:00

  const handleDragStart = (e: React.DragEvent, lesson: Lesson) => {
    e.dataTransfer.setData('lessonId', lesson.id);
  };

  const parseTimeStr = (timeStr?: string) => {
    if (!timeStr) return { startH: 18, startM: 0, durationMinutes: 60 };
    const parts = timeStr.split(' - ');
    if (parts.length !== 2) return { startH: 18, startM: 0, durationMinutes: 60 };
    
    const start = parts[0].split(':').map(Number);
    const end = parts[1].split(':').map(Number);
    
    if (start.length !== 2 || end.length !== 2) return { startH: 18, startM: 0, durationMinutes: 60 };

    const startTotal = start[0] * 60 + start[1];
    const endTotal = end[0] * 60 + end[1];
    let duration = endTotal - startTotal;
    if (duration < 0) duration += 24 * 60;

    return { startH: start[0], startM: start[1], durationMinutes: duration };
  };

  const HOUR_HEIGHT = 60; // 60 pixels per hour
  const START_HOUR = 7;

  // Touch Drag State
  const [draggingLesson, setDraggingLesson] = useState<string | null>(null);
  const [dragY, setDragY] = useState<number>(0);
  const [initialY, setInitialY] = useState<number>(0);
  const [initialTop, setInitialTop] = useState<number>(0);

  const handleTouchStart = (e: React.TouchEvent, lesson: Lesson, topPos: number) => {
    // Only allow drag if we touch and hold (maybe? or just instant drag)
    hapticImpact('medium');
    setDraggingLesson(lesson.id);
    setDragY(e.touches[0].clientY);
    setInitialY(e.touches[0].clientY);
    setInitialTop(topPos);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!draggingLesson) return;
    // Prevent scrolling while dragging
    if (e.cancelable) e.preventDefault();
    setDragY(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent, lesson: Lesson) => {
    if (!draggingLesson) return;
    setDraggingLesson(null);
    hapticImpact('light');
    
    const deltaY = dragY - initialY;
    // Snap to nearest 15 minutes (15 mins = 15px since 1h = 60px)
    const newTop = initialTop + deltaY;
    const snappedTop = Math.max(0, Math.round(newTop / 15) * 15);
    
    // Calculate new time
    const newTotalMinutes = snappedTop;
    const newH = START_HOUR + Math.floor(newTotalMinutes / 60);
    const newM = newTotalMinutes % 60;
    
    const { durationMinutes } = parseTimeStr(lesson.time_str);
    const endTotal = newTotalMinutes + durationMinutes;
    const endH = START_HOUR + Math.floor(endTotal / 60);
    const endM = endTotal % 60;

    const newTimeStr = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')} - ${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    
    // Check if it actually moved significantly
    if (Math.abs(deltaY) > 15) {
      if (window.confirm(`Перенести урок на ${newTimeStr}?`)) {
        onUpdateLessonTime(lesson.id, newTimeStr, format(selectedDate, 'yyyy-MM-dd'));
      }
    } else {
      // It was just a tap
      onOpenLesson(lesson);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white pb-safe">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-white border-b border-gray-100 z-20">
        <h1 className="text-xl font-bold text-black capitalize">
          {format(selectedDate, 'LLLL yyyy', { locale: ru })}
        </h1>
        <div className="flex gap-2">
          <button className="p-2 text-blue-500 rounded-full hover:bg-blue-50 active:bg-blue-100 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
          <button 
            onClick={() => { hapticImpact('medium'); onAddLesson(); }}
            className="p-2 text-blue-500 rounded-full hover:bg-blue-50 active:bg-blue-100 transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Week Strip */}
      <div className="flex bg-white border-b border-gray-100 px-2 py-2 z-20 shadow-sm">
        {weekDays.map(day => {
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, getTashkentNow());
          
          return (
            <button
              key={day.toISOString()}
              onClick={() => {
                hapticImpact('light');
                setSelectedDate(day);
              }}
              className="flex-1 flex flex-col items-center py-2"
            >
              <span className={`text-[10px] font-bold uppercase mb-1 ${isSelected ? 'text-blue-500' : isToday ? 'text-gray-900' : 'text-gray-400'}`}>
                {format(day, 'EEEEEE', { locale: ru })}
              </span>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                isSelected ? 'bg-blue-500 text-white shadow-md' : isToday ? 'text-blue-600 bg-blue-50' : 'text-gray-700'
              }`}>
                {format(day, 'd')}
              </div>
            </button>
          );
        })}
      </div>

      {/* Time Grid */}
      <div 
        ref={gridRef}
        className="flex-1 overflow-y-auto relative bg-gray-50/50"
      >
        <div className="relative min-w-full" style={{ height: hours.length * HOUR_HEIGHT }}>
          {/* Hour Lines */}
          {hours.map((hour, index) => (
            <div 
              key={hour} 
              className="absolute w-full flex items-start"
              style={{ top: index * HOUR_HEIGHT }}
            >
              <div className="w-14 pr-2 text-right text-[10px] text-gray-400 font-medium -mt-2">
                {hour.toString().padStart(2, '0')}:00
              </div>
              <div className="flex-1 border-t border-gray-200"></div>
            </div>
          ))}

          {/* Current Time Indicator */}
          {isSameDay(selectedDate, getTashkentNow()) && (
            <div 
              className="absolute w-full flex items-center z-10 pointer-events-none"
              style={{ 
                top: ((getTashkentNow().getHours() - START_HOUR) * 60) + getTashkentNow().getMinutes() 
              }}
            >
              <div className="w-14 pr-1 text-right text-[10px] text-blue-500 font-bold -mt-2.5">
                {format(getTashkentNow(), 'HH:mm')}
              </div>
              <div className="flex-1 border-t-2 border-blue-500 relative">
                <div className="absolute -left-1 -top-1.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-white"></div>
              </div>
            </div>
          )}

          {/* Lessons */}
          <div className="absolute left-14 right-4 top-0 bottom-0">
            {dayLessons.map(lesson => {
              const { startH, startM, durationMinutes } = parseTimeStr(lesson.time_str);
              const topPos = ((startH - START_HOUR) * 60) + startM;
              const height = durationMinutes;

              const student = students.find(s => s.id === lesson.student_id);
              const bgColor = student?.color || '#3B82F6';

              // If lesson is outside visible hours, it might be clipped, but CSS handles it
              if (startH < START_HOUR || startH > 23) return null;

              const isDragging = draggingLesson === lesson.id;
              const displayTop = isDragging ? initialTop + (dragY - initialY) : topPos;

              return (
                <div
                  key={lesson.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, lesson)}
                  onTouchStart={(e) => handleTouchStart(e, lesson, topPos)}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={(e) => handleTouchEnd(e, lesson)}
                  onClick={() => { if (!isDragging) { hapticImpact('light'); onOpenLesson(lesson); } }}
                  className={`absolute left-1 right-1 rounded-xl shadow-sm p-2 cursor-pointer transition-transform overflow-hidden group ${
                    isDragging ? 'z-50 scale-105 shadow-xl opacity-90' : 'z-20 active:scale-[0.98]'
                  }`}
                  style={{ 
                    top: displayTop, 
                    height: height,
                    backgroundColor: bgColor,
                    opacity: isDragging ? 0.9 : (lesson.status === 'completed' ? 1 : 0.85)
                  }}
                >
                  {/* Subtle gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
                  
                  <div className="relative z-10">
                    <div className="text-[11px] font-bold text-white/90 leading-tight">
                      {lesson.time_str}
                    </div>
                    <div className="text-sm font-black text-white truncate">
                      {lesson.student_name}
                    </div>
                    {lesson.status === 'completed' && (
                      <div className="absolute top-1 right-1 bg-white/20 p-1 rounded-full">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                      </div>
                    )}
                    {lesson.status === 'missed_penalty' && (
                      <div className="absolute top-1 right-1 bg-red-500/50 p-1 rounded-full">
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="h-24"></div> {/* Bottom padding for scroll */}
      </div>
    </div>
  );
};
