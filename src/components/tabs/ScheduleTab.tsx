'use client';

import React, { useState, useMemo } from 'react';
import { Student, Lesson, Makeup, LessonStatus } from '@/types';
import { Plus, RotateCcw, CalendarPlus, ChevronDown, ChevronUp } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { getTashkentNow, getTashkentDateString, getTashkentTodayStr } from '@/lib/formatters';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { HorizontalDateStrip } from '../HorizontalDateStrip';
import { LessonCard } from '../LessonCard';

interface ScheduleTabProps {
  students: Student[];
  lessons: Lesson[];
  makeups?: Makeup[];
  onAddLesson: (date?: Date) => void;
  onOpenLesson: (lesson: Lesson) => void;
  onOpenStudent?: (student: Student) => void;
  onUpdateLessonTime: (lessonId: string, timeStr: string, dateStr?: string) => Promise<void>;
  onSetLessonStatus: (lessonId: string, status: LessonStatus, missReason?: string) => Promise<void>;
  onScheduleSundayMakeup?: (makeupIdOrLesson: any, sundayDate: string, timeStr: string) => Promise<void>;
  onArchiveMakeup?: (makeupId: string) => Promise<void>;
  onRefresh?: () => Promise<void> | void;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  students,
  lessons,
  onAddLesson,
  onOpenLesson,
  onOpenStudent,
  onSetLessonStatus,
  onRefresh,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(getTashkentNow());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showUnmarked, setShowUnmarked] = useState(true);

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

  const todayStr = getTashkentTodayStr();
  const selectedDateStr = getTashkentDateString(selectedDate);

  const dayLessons = useMemo(() => {
    return lessons
      .filter((l) => l.date.startsWith(selectedDateStr))
      .sort((a, b) => (a.time_str || '').localeCompare(b.time_str || ''));
  }, [lessons, selectedDateStr]);

  const daySummary = useMemo(() => {
    let completed = 0;
    let planned = 0;
    let missed = 0;
    for (const l of dayLessons) {
      if (l.status === 'completed') completed++;
      else if (l.status === 'planned' || (l.status as string) === 'scheduled') planned++;
      else missed++;
    }
    return { completed, planned, missed };
  }, [dayLessons]);

  const unmarkedPastLessons = useMemo(() => {
    return lessons
      .filter(
        (l) =>
          l.date.substring(0, 10) < todayStr &&
          (l.status === 'planned' || (l.status as string) === 'scheduled')
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [lessons, todayStr]);

  return (
    <div className="flex flex-col h-full bg-[#f2f2f7] pb-safe overscroll-none">
      {/* Top Fixed Header with Date Strip & Actions */}
      <div className="bg-white border-b border-gray-200/80 p-3 pt-4 sticky top-0 z-20 space-y-2 shadow-xs">
        <div className="flex items-center justify-between px-1">
          <div>
            <h1 className="text-xl font-black text-gray-900 tracking-tight">Расписание</h1>
            <p className="text-[11px] font-semibold text-gray-500 flex items-center gap-1.5 flex-wrap">
              <span>
                Уроков: <b className="text-blue-600">{dayLessons.length}</b>
              </span>
              {dayLessons.length > 0 && (
                <span className="text-gray-400">
                  ({daySummary.completed > 0 ? `✅ ${daySummary.completed}` : ''}
                  {daySummary.completed > 0 && (daySummary.planned > 0 || daySummary.missed > 0) ? ' · ' : ''}
                  {daySummary.planned > 0 ? `⏳ ${daySummary.planned}` : ''}
                  {daySummary.planned > 0 && daySummary.missed > 0 ? ' · ' : ''}
                  {daySummary.missed > 0 ? `отм. ${daySummary.missed}` : ''})
                </span>
              )}
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
                onAddLesson(selectedDate);
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

      {/* Main Content Area: Unmarked Past Banner + Daily Lessons List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32">
        {/* Unmarked Past Lessons Alert */}
        {unmarkedPastLessons.length > 0 && (
          <div className="bg-amber-50/95 border border-amber-200 rounded-3xl p-3 shadow-xs space-y-2">
            <button
              type="button"
              onClick={() => {
                hapticImpact('light');
                setShowUnmarked((prev) => !prev);
              }}
              className="w-full flex items-center justify-between text-left"
            >
              <span className="text-xs font-black text-amber-900">
                ⏳ Неотмеченные прошлые уроки ({unmarkedPastLessons.length})
              </span>
              {showUnmarked ? (
                <ChevronUp className="w-4 h-4 text-amber-700" />
              ) : (
                <ChevronDown className="w-4 h-4 text-amber-700" />
              )}
            </button>

            {showUnmarked && (
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {unmarkedPastLessons.map((l) => {
                  const st = students.find((s) => s.id === l.student_id);
                  const datePart = l.date.substring(0, 10);
                  const parsed = parseISO(`${datePart}T12:00:00+05:00`);
                  return (
                    <div
                      key={l.id}
                      className="shrink-0 bg-white border border-amber-200/90 rounded-2xl p-2.5 shadow-xs space-y-1.5 min-w-[148px]"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          hapticImpact('light');
                          setSelectedDate(parsed);
                        }}
                        className="text-left w-full"
                        title="Перейти к этой дате"
                      >
                        <div className="text-xs font-black text-gray-900 truncate">
                          {st?.name || l.student_name || 'Ученик'}
                        </div>
                        <div className="text-[10px] font-bold text-amber-800">
                          {format(parsed, 'd MMM, EEE', { locale: ru })} · {(l.time_str || '').split(' - ')[0]}
                        </div>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            hapticNotification('success');
                            onSetLessonStatus(l.id, 'completed');
                          }}
                          className="flex-1 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-xs text-center active:scale-90"
                          title="Был (-1 баланс)"
                        >
                          ✅
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            hapticNotification('warning');
                            onSetLessonStatus(l.id, 'missed_penalty', 'Пропуск без предупреждения');
                          }}
                          className="flex-1 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 font-black text-xs text-center active:scale-90"
                          title="Сгорел (-1 баланс)"
                        >
                          🔥
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            hapticImpact('light');
                            onSetLessonStatus(l.id, 'missed_excused', 'Уважительная отмена');
                          }}
                          className="flex-1 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-black text-xs text-center active:scale-90"
                          title="Отмена (баланс сохранен)"
                        >
                          🛑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

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
                onAddLesson(selectedDate);
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
                  onSetStatus={(id, status, reason) => {
                    onSetLessonStatus(id, status, reason);
                  }}
                  onEditLesson={onOpenLesson}
                  onOpenStudent={onOpenStudent}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
