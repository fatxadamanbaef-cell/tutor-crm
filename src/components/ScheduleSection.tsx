'use client';

import React from 'react';
import { Lesson, Student, LessonStatus } from '@/types';
import { LessonCard } from './LessonCard';
import { HorizontalDateStrip } from './HorizontalDateStrip';
import { Plus } from 'lucide-react';
import { isSameTashkentDate, formatTashkentHeaderDate, getTashkentNow } from '@/lib/formatters';
import { hapticImpact } from '@/lib/telegram';
import { isSameDay } from 'date-fns';

interface ScheduleSectionProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  lessons: Lesson[];
  students: Student[];
  onToggleLessonStatus: (id: string) => void;
  onSetLessonStatus?: (id: string, status: LessonStatus) => void;
  onDeleteLesson: (id: string) => void;
  onEditLesson?: (lesson: Lesson) => void;
  onAddLesson: () => void;
}

export const ScheduleSection: React.FC<ScheduleSectionProps> = ({
  selectedDate,
  onSelectDate,
  lessons,
  students,
  onToggleLessonStatus,
  onSetLessonStatus,
  onDeleteLesson,
  onEditLesson,
  onAddLesson,
}) => {
  const dateLessons = lessons.filter((l) => isSameTashkentDate(l.date, selectedDate));
  const isToday = isSameDay(selectedDate, getTashkentNow());

  const getStudentForLesson = (studentId: string) => {
    return students.find((s) => s.id === studentId);
  };

  return (
    <section className="space-y-3">
      {/* 1. Horizontal Date Strip Navigation */}
      <HorizontalDateStrip
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        lessons={lessons}
      />

      {/* 2. Top bar for schedule count & add lesson */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[11px] font-bold text-zinc-400">
          Уроков на день: <strong className="text-white">{dateLessons.length}</strong>
        </span>

        <button
          onClick={() => {
            hapticImpact('light');
            onAddLesson();
          }}
          className="flex items-center gap-1 text-[11px] font-bold text-teal-400 bg-teal-500/10 border border-teal-500/20 hover:bg-teal-500/20 active:scale-95 transition-all px-2.5 py-1 rounded-lg"
        >
          <Plus className="w-3 h-3" />
          <span>Урок</span>
        </button>
      </div>

      {/* 3. List of Lessons (Tap to toggle) */}
      {dateLessons.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-5 text-center space-y-2">
          <div className="text-xs text-zinc-400">
            {isToday
              ? 'На сегодня уроков нет ☕'
              : `На ${formatTashkentHeaderDate(selectedDate)} нет уроков`}
          </div>
          <button
            onClick={() => {
              hapticImpact('light');
              onAddLesson();
            }}
            className="text-[11px] font-bold text-teal-400 hover:text-teal-300 underline"
          >
            + Добавить урок
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {dateLessons.map((lesson) => (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              student={getStudentForLesson(lesson.student_id)}
              onToggleStatus={onToggleLessonStatus}
              onSetStatus={onSetLessonStatus}
              onDeleteLesson={onDeleteLesson}
              onEditLesson={onEditLesson}
            />
          ))}
        </div>
      )}
    </section>
  );
};
