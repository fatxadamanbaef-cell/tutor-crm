'use client';

import React, { useState } from 'react';
import { Student, Lesson, Makeup, LessonStatus } from '@/types';
import { Plus, RotateCcw, CalendarPlus } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { getTashkentNow, getTashkentDateString } from '@/lib/formatters';
import { HorizontalDateStrip } from '../HorizontalDateStrip';
import { LessonCard } from '../LessonCard';
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
  onRefresh?: () => Promise<void> | void;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  students,
  lessons,
  makeups = [],
  onAddLesson,
  onOpenLesson,
  onSetLessonStatus,
  onScheduleSundayMakeup,
  onArchiveMakeup,
  onRefresh,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(getTashkentNow());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshClick = async () => {
    if (!onRefresh) return;
    hapticImpact('light');
    setIsRefreshing(true);
    try {
      await onRefresh();
      hapticNotification('success');
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const selectedDateStr = getTashkentDateString(selectedDate);
  const dayLessons = lessons
    .filter((l) => l.date.startsWith(selectedDateStr))
    .sort((a, b) => (a.time_str || '').localeCompare(b.time_str || ''));

  return (
    <div className="flex flex-col h-full bg-[#f2f2f7] pb-safe overscroll-none">
      {/* Top Fixed Header with Date Strip & Actions */}
      <div className="bg-white border-b border-gray-200/80 p-3 pt-4 sticky top-0 z-20 space-y-2 shadow-xs">
        <div className="flex items-center justify-between px-1">
          <div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Расписание</h1>
            <p className="text-[11px] font-semibold text-gray-500">
              Уроков на день: <b className="text-blue-600">{dayLessons.length}</b>
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={handleRefreshClick}
                disabled={isRefreshing}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 active:scale-95 disabled:opacity-50 transition-transform"
                title="Обновить"
              >
                <RotateCcw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            )}

            <button
              onClick={() => {
                hapticImpact('light');
                onAddLesson();
              }}
              className="h-8 px-3 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-blue-500/20 active:scale-95 transition-transform"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Урок</span>
            </button>
          </div>
        </div>

        {/* Horizontal Calendar Strip with Today & Month Grid */}
        <HorizontalDateStrip
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          lessons={lessons}
        />
      </div>

      {/* Main Content Area: Daily Lessons List + Sunday Makeups */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
        {/* Lessons List */}
        {dayLessons.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-gray-200/80 shadow-xs space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <CalendarPlus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-900">На этот день уроков нет</h3>
              <p className="text-xs text-gray-400 mt-0.5">Выходной или свободное время</p>
            </div>
            <button
              type="button"
              onClick={() => {
                hapticImpact('light');
                onAddLesson();
              }}
              className="py-2 px-4 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs active:scale-95 transition-all inline-flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              <span>Запланировать урок</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {dayLessons.map((lesson) => {
              const student = students.find((s) => s.id === lesson.student_id);
              return (
                <LessonCard
                  key={lesson.id}
                  lesson={lesson}
                  student={student}
                  onToggleStatus={(id) => {
                    const nextStatus = lesson.status === 'completed' ? 'planned' : 'completed';
                    onSetLessonStatus(id, nextStatus);
                  }}
                  onSetStatus={(id, status, reason, makeup) => {
                    onSetLessonStatus(id, status, reason, makeup);
                  }}
                  onEditLesson={onOpenLesson}
                />
              );
            })}
          </div>
        )}

        {/* Sunday Makeups Queue */}
        <SundayMakeupsSection
          makeups={makeups}
          lessons={lessons}
          students={students}
          onScheduleSundayMakeup={onScheduleSundayMakeup}
          onArchiveMakeup={onArchiveMakeup}
        />
      </div>
    </div>
  );
};
