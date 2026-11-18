'use client';

import React, { useState, useMemo } from 'react';
import { Student, Lesson, Makeup, LessonStatus } from '@/types';
import {
  Plus,
  RotateCcw,
  CalendarPlus,
  ChevronDown,
  ChevronUp,
  Coffee,
  AlertTriangle,
  CheckCheck,
} from 'lucide-react';
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
  onAddLesson: (date?: Date, startTime?: string) => void;
  onOpenLesson: (lesson: Lesson) => void;
  onOpenStudent?: (student: Student) => void;
  onUpdateLessonTime: (lessonId: string, timeStr: string, dateStr?: string) => Promise<void>;
  onSetLessonStatus: (lessonId: string, status: LessonStatus, missReason?: string) => Promise<void>;
  onUpdateLessonNote?: (lessonId: string, notes: string) => Promise<void> | void;
  onScheduleSundayMakeup?: (makeupIdOrLesson: any, sundayDate: string, timeStr: string) => Promise<void>;
  onArchiveMakeup?: (makeupId: string) => Promise<void>;
  onRefresh?: () => Promise<void> | void;
}

function parseSlotMinutes(timeStr?: string): {
  startMin: number;
  endMin: number;
  startStr: string;
  endStr: string;
} | null {
  if (!timeStr) return null;
  const parts = timeStr.split(' - ').map((s) => s.trim());
  const startStr = parts[0] || '18:00';
  const [sh, sm] = startStr.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm)) return null;
  const startMin = sh * 60 + sm;

  let endMin = startMin + 90;
  let endStr = '';
  if (parts[1]) {
    const [eh, em] = parts[1].split(':').map(Number);
    if (!isNaN(eh) && !isNaN(em)) {
      endMin = eh * 60 + em;
      endStr = parts[1];
    }
  }
  if (!endStr) {
    const eh = Math.floor(endMin / 60) % 24;
    const em = endMin % 60;
    endStr = `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
  }
  return { startMin, endMin, startStr, endStr };
}

function formatDurationRu(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} ч ${m} мин`;
  if (h > 0) return `${h} ч`;
  return `${m} мин`;
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  students,
  lessons,
  onAddLesson,
  onOpenLesson,
  onOpenStudent,
  onSetLessonStatus,
  onUpdateLessonNote,
  onRefresh,
}) => {
  const [selectedDate, setSelectedDate] = useState<Date>(getTashkentNow());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showUnmarked, setShowUnmarked] = useState(false);

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
  const isTodaySelected = selectedDateStr === todayStr;

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

  // Identify "now" or "next" lesson when viewing Today
  const activeTimeStateMap = useMemo(() => {
    const map: Record<string, 'now' | 'next'> = {};
    if (!isTodaySelected) return map;

    const now = getTashkentNow();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let foundNowOrNext = false;

    for (const l of dayLessons) {
      if (l.status === 'missed_excused') continue;
      const slot = parseSlotMinutes(l.time_str);
      if (!slot) continue;

      if (nowMin >= slot.startMin && nowMin < slot.endMin) {
        map[l.id] = 'now';
        foundNowOrNext = true;
        break;
      }
      if (
        !foundNowOrNext &&
        slot.startMin >= nowMin &&
        (l.status === 'planned' || (l.status as string) === 'scheduled')
      ) {
        map[l.id] = 'next';
        foundNowOrNext = true;
        break;
      }
    }
    return map;
  }, [dayLessons, isTodaySelected]);

  // Find each student's most recent meaningful note before selectedDateStr
  const lastNoteByStudent = useMemo(() => {
    const map: Record<string, { date: string; note: string }> = {};
    for (const l of lessons) {
      const d = l.date.substring(0, 10);
      if (d >= selectedDateStr) continue;
      if (
        !l.notes ||
        l.notes.startsWith('Регулярный урок') ||
        l.notes.startsWith('Авто-слот')
      ) {
        continue;
      }
      const prev = map[l.student_id];
      if (!prev || l.date > prev.date) {
        map[l.student_id] = { date: l.date, note: l.notes };
      }
    }
    const result: Record<string, string> = {};
    for (const [sid, val] of Object.entries(map)) {
      result[sid] = val.note;
    }
    return result;
  }, [lessons, selectedDateStr]);

  const unmarkedPastLessons = useMemo(() => {
    return lessons
      .filter(
        (l) =>
          l.date.substring(0, 10) < todayStr &&
          (l.status === 'planned' || (l.status as string) === 'scheduled')
      )
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [lessons, todayStr]);

  const handleMarkAllUnmarkedCompleted = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (unmarkedPastLessons.length === 0) return;
    hapticNotification('success');
    for (const l of unmarkedPastLessons) {
      await onSetLessonStatus(l.id, 'completed');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f4f5f8] pb-safe overscroll-none">
      {/* Top Fixed Header with Date Strip & Actions */}
      <div className="bg-white border-b border-slate-200/80 px-3.5 pt-4 pb-3 sticky top-0 z-20 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight leading-none">
              Расписание
            </h1>
            <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5 flex-wrap mt-1">
              <span>
                Уроков на день: <b className="text-slate-900 font-extrabold">{dayLessons.length}</b>
              </span>
              {dayLessons.length > 0 && (
                <span className="text-slate-400">
                  •{' '}
                  {daySummary.completed > 0 ? `проведено ${daySummary.completed}` : ''}
                  {daySummary.completed > 0 && daySummary.planned > 0 ? ', ' : ''}
                  {daySummary.planned > 0 ? `осталось ${daySummary.planned}` : ''}
                  {(daySummary.completed > 0 || daySummary.planned > 0) && daySummary.missed > 0
                    ? ', '
                    : ''}
                  {daySummary.missed > 0 ? `отм. ${daySummary.missed}` : ''}
                </span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onRefresh && (
              <button
                onClick={handleRefreshClick}
                disabled={isRefreshing}
                className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 disabled:opacity-50 transition-all"
                title="Обновить"
              >
                <RotateCcw
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`}
                />
              </button>
            )}

            <button
              onClick={() => {
                hapticImpact('light');
                onAddLesson(selectedDate);
              }}
              className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm shadow-blue-500/20 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
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

      {/* Main Content Area: Unmarked Past Banner + Daily Lessons Timeline */}
      <div className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-3 pb-32">
        {/* Compact Collapsible Unmarked Past Lessons Banner */}
        {unmarkedPastLessons.length > 0 && (
          <div className="bg-amber-50/90 border border-amber-200/90 rounded-2xl p-3 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  setShowUnmarked((prev) => !prev);
                }}
                className="flex-1 flex items-center gap-1.5 text-left min-w-0"
              >
                <span className="text-xs font-extrabold text-amber-900 truncate">
                  ⏳ Неотмеченные прошлые ({unmarkedPastLessons.length})
                </span>
                {showUnmarked ? (
                  <ChevronUp className="w-4 h-4 text-amber-700 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-amber-700 shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={handleMarkAllUnmarkedCompleted}
                className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] inline-flex items-center gap-1 shrink-0 active:scale-95 transition-all shadow-2xs"
                title="Отметить все прошлые уроки как проведённые"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Все были</span>
              </button>
            </div>

            {showUnmarked && (
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar pt-0.5">
                {unmarkedPastLessons.map((l) => {
                  const st = students.find((s) => s.id === l.student_id);
                  const datePart = l.date.substring(0, 10);
                  const parsed = parseISO(`${datePart}T12:00:00+05:00`);
                  return (
                    <div
                      key={l.id}
                      className="shrink-0 bg-white border border-amber-200/90 rounded-xl p-2.5 shadow-2xs space-y-2 min-w-[152px]"
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
                        <div className="text-xs font-extrabold text-slate-900 truncate">
                          {st?.name || l.student_name || 'Ученик'}
                        </div>
                        <div className="text-[11px] font-semibold text-amber-800">
                          {format(parsed, 'd MMM, EEE', { locale: ru })} ·{' '}
                          {(l.time_str || '').split(' - ')[0]}
                        </div>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            hapticNotification('success');
                            onSetLessonStatus(l.id, 'completed');
                          }}
                          className="flex-1 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs text-center active:scale-90"
                          title="Был (-1 баланс)"
                        >
                          ✅
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            hapticNotification('warning');
                            onSetLessonStatus(
                              l.id,
                              'missed_penalty',
                              'Пропуск без предупреждения'
                            );
                          }}
                          className="flex-1 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-xs text-center active:scale-90"
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
                          className="flex-1 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs text-center active:scale-90"
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

        {/* Lessons List with Free Windows ("Окна") and Overlap Detection */}
        {dayLessons.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 text-center border border-slate-200/80 shadow-2xs space-y-3 mt-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <CalendarPlus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">На этот день уроков нет</h3>
              <p className="text-xs text-slate-400 mt-0.5">Свободный день или выходной</p>
            </div>
            <button
              type="button"
              onClick={() => {
                hapticImpact('light');
                onAddLesson(selectedDate);
              }}
              className="py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs active:scale-95 transition-all inline-flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Запланировать урок</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {dayLessons.map((lesson, idx) => {
              const student = students.find((s) => s.id === lesson.student_id);
              const prevLesson = idx > 0 ? dayLessons[idx - 1] : null;

              let gapElement: React.ReactNode = null;
              if (prevLesson) {
                const prevSlot = parseSlotMinutes(prevLesson.time_str);
                const currSlot = parseSlotMinutes(lesson.time_str);
                if (prevSlot && currSlot) {
                  const gapMinutes = currSlot.startMin - prevSlot.endMin;
                  const bothActive =
                    prevLesson.status !== 'missed_excused' &&
                    lesson.status !== 'missed_excused';

                  if (gapMinutes < 0 && bothActive) {
                    gapElement = (
                      <div className="flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-bold">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                        <span>
                          Накладка по времени: {prevSlot.startStr}–{prevSlot.endStr} и{' '}
                          {currSlot.startStr}–{currSlot.endStr}
                        </span>
                      </div>
                    );
                  } else if (gapMinutes >= 30) {
                    gapElement = (
                      <div className="flex items-center justify-between px-3 py-1.5 rounded-xl border border-dashed border-slate-300/90 bg-slate-100/60 text-slate-500 text-[11px]">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Coffee className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>
                            Окно <b className="text-slate-700 font-bold">{formatDurationRu(gapMinutes)}</b>{' '}
                            <span className="text-slate-400 font-mono">
                              ({prevSlot.endStr} – {currSlot.startStr})
                            </span>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            hapticImpact('light');
                            onAddLesson(selectedDate, prevSlot.endStr);
                          }}
                          className="text-[11px] font-bold text-blue-600 hover:text-blue-700 px-2 py-0.5 rounded-lg bg-white border border-slate-200/80 shadow-2xs active:scale-95 transition-all"
                        >
                          + Занять
                        </button>
                      </div>
                    );
                  }
                }
              }

              return (
                <React.Fragment key={lesson.id}>
                  {gapElement}
                  <LessonCard
                    lesson={lesson}
                    student={student}
                    lastCompletedNote={lastNoteByStudent[lesson.student_id]}
                    timeState={activeTimeStateMap[lesson.id] || null}
                    onToggleStatus={(id) => {
                      const nextStatus = lesson.status === 'completed' ? 'planned' : 'completed';
                      onSetLessonStatus(id, nextStatus);
                    }}
                    onSetStatus={(id, status, reason) => {
                      onSetLessonStatus(id, status, reason);
                    }}
                    onUpdateNote={onUpdateLessonNote}
                    onEditLesson={onOpenLesson}
                    onOpenStudent={onOpenStudent}
                  />
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
