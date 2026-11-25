'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
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
  Clock,
  Check,
  Flame,
  Ban,
} from 'lucide-react';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/telegram';
import { getTashkentNow, getTashkentDateString, getTashkentTodayStr, isRealNote } from '@/lib/formatters';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { HorizontalDateStrip } from '../HorizontalDateStrip';
import { LessonCard } from '../LessonCard';
import { useToast } from '@/components/ui/ToastProvider';

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
  onScheduleSundayMakeup?: (makeupIdOrLesson: string, sundayDate: string, timeStr: string) => Promise<void>;
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
  const { showToast } = useToast();
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

  const studentsMap = useMemo(() => {
    const m = new Map<string, Student>();
    for (const s of students) m.set(s.id, s);
    return m;
  }, [students]);

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
      if (!isRealNote(l.notes)) {
        continue;
      }
      const prev = map[l.student_id];
      if (!prev || l.date > prev.date) {
        map[l.student_id] = { date: l.date, note: l.notes! };
      }
    }
    const result: Record<string, string> = {};
    for (const [sid, val] of Object.entries(map)) {
      result[sid] = val.note;
    }
    return result;
  }, [lessons, selectedDateStr]);

  const defaultExpandedId = useMemo(() => {
    if (!isTodaySelected) return null;
    const nowId = Object.keys(activeTimeStateMap).find((id) => activeTimeStateMap[id] === 'now');
    if (nowId) return nowId;
    const nextId = Object.keys(activeTimeStateMap).find((id) => activeTimeStateMap[id] === 'next');
    return nextId || null;
  }, [isTodaySelected, activeTimeStateMap]);

  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(() => defaultExpandedId);
  const prevDateRef = useRef(selectedDateStr);
  const initializedRef = useRef(lessons.length > 0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const topHeaderRef = useRef<HTMLDivElement | null>(null);
  const [isHeaderScrolledOut, setIsHeaderScrolledOut] = useState(false);

  useEffect(() => {
    if (prevDateRef.current !== selectedDateStr) {
      prevDateRef.current = selectedDateStr;
      setExpandedLessonId(defaultExpandedId);
    } else if (!initializedRef.current && lessons.length > 0) {
      initializedRef.current = true;
      setExpandedLessonId(defaultExpandedId);
    }
  }, [selectedDateStr, defaultExpandedId, lessons.length]);

  useEffect(() => {
    const root = scrollContainerRef.current;
    const target = topHeaderRef.current;
    if (!root || !target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsHeaderScrolledOut(!entry.isIntersecting);
      },
      { root, threshold: 0.2 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const handleToggleExpand = useCallback((lessonId: string) => {
    hapticSelection();
    setExpandedLessonId((prev) => (prev === lessonId ? null : lessonId));
  }, []);

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
    const count = unmarkedPastLessons.length;
    hapticNotification('success');
    for (const l of unmarkedPastLessons) {
      await onSetLessonStatus(l.id, 'completed');
    }
    showToast({ message: `Отмечено ${count} уроков как проведённые`, tone: 'success' });
  };

  return (
    <div
      ref={scrollContainerRef}
      className="h-full overflow-y-auto overscroll-none bg-[#F7F5F0] pb-safe"
    >
      {/* Non-sticky Compact Top Header */}
      <div
        ref={topHeaderRef}
        className="bg-white px-3.5 pt-safe pb-1.5 flex items-center justify-between gap-2"
      >
        <div className="min-w-0">
          <h1 className="text-base font-bold text-[#1C1917] tracking-tight leading-tight">
            Расписание
          </h1>
          <p className="text-[11px] font-medium text-[#78716C] flex items-center gap-1 flex-wrap tabular-nums">
            <span>
              <b className="text-[#1C1917] font-semibold">{dayLessons.length}</b> ур.
            </span>
            {dayLessons.length > 0 && (
              <span className="text-[#8C857B]">
                ·{' '}
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

        <div className="flex items-center gap-1.5 shrink-0">
          {onRefresh && (
            <button
              type="button"
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              aria-label="Обновить расписание"
              className="touch-hit w-8 h-8 flex items-center justify-center rounded-full bg-[#F2EFE9] text-[#44403C] hover:bg-[#EAE5DC] active:scale-95 disabled:opacity-50 transition-colors"
              title="Обновить"
            >
              <RotateCcw
                className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#2F6FED]' : ''}`}
                aria-hidden="true"
              />
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              hapticImpact('light');
              onAddLesson(selectedDate);
            }}
            className="touch-hit h-8 px-3 rounded-full bg-[#2F6FED] hover:bg-[#255CE0] text-white font-semibold text-xs flex items-center gap-1 shadow-xs active:scale-95 transition-colors"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
            <span>Урок</span>
          </button>
        </div>
      </div>

      {/* Sticky Compact Date Navigation Bar (solid white for 60 FPS mobile WebView scroll) */}
      <div className="sticky top-0 z-20 bg-white border-b border-[#E7E2D8] px-3.5 py-1.5">
        <HorizontalDateStrip
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          lessons={lessons}
          onQuickAdd={isHeaderScrolledOut ? () => onAddLesson(selectedDate) : undefined}
        />
      </div>

      {/* Main Content Area: Unmarked Past Banner + Compact Daily Lessons Timeline */}
      <div className="px-3 py-2 space-y-1.5 pb-24">
        {/* Compact Collapsible Unmarked Past Lessons Banner */}
        {unmarkedPastLessons.length > 0 && (
          <div className="bg-[#FEF6E7] border border-[#F3DCAC] rounded-xl px-2.5 py-1.5 shadow-2xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  setShowUnmarked((prev) => !prev);
                }}
                className="flex items-center gap-1.5 text-left min-w-0"
              >
                <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
                <span className="text-[11px] font-semibold text-amber-950 tabular-nums whitespace-nowrap">
                  Не отмечено: {unmarkedPastLessons.length}
                </span>
                {showUnmarked ? (
                  <ChevronUp className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={handleMarkAllUnmarkedCompleted}
                className="touch-hit px-2.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] inline-flex items-center gap-1 shrink-0 active:scale-95 transition-colors shadow-2xs"
                title="Отметить все прошлые уроки как проведённые"
              >
                <CheckCheck className="w-3 h-3" aria-hidden="true" />
                <span>Все были</span>
              </button>
            </div>

            {showUnmarked && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-0.5">
                {unmarkedPastLessons.map((l) => {
                  const st = studentsMap.get(l.student_id);
                  const datePart = l.date.substring(0, 10);
                  const parsed = parseISO(`${datePart}T12:00:00+05:00`);
                  return (
                    <div
                      key={l.id}
                      className="shrink-0 bg-white border border-[#F3DCAC] rounded-xl p-2 shadow-2xs space-y-1.5 min-w-[144px]"
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
                        <div className="text-xs font-semibold text-[#1C1917] truncate">
                          {st?.name || l.student_name || 'Ученик'}
                        </div>
                        <div className="text-[10.5px] font-medium text-amber-800 tabular-nums">
                          {format(parsed, 'd MMM, EEE', { locale: ru })} ·{' '}
                          {(l.time_str || '').split(' - ')[0]}
                        </div>
                      </button>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          aria-label="Отметить проведённым"
                          onClick={() => {
                            hapticNotification('success');
                            onSetLessonStatus(l.id, 'completed');
                          }}
                          className="touch-hit flex-1 py-1.5 rounded-lg bg-[#E7F7F0] hover:bg-[#D1F0E2] text-emerald-700 flex items-center justify-center active:scale-90"
                          title="Был (-1 баланс)"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label="Отметить сгоревшим"
                          onClick={() => {
                            hapticNotification('warning');
                            onSetLessonStatus(
                              l.id,
                              'missed_penalty',
                              'Пропуск без предупреждения'
                            );
                          }}
                          className="touch-hit flex-1 py-1.5 rounded-lg bg-[#FDECE8] hover:bg-[#FADCD4] text-[#B93815] flex items-center justify-center active:scale-90"
                          title="Сгорел (-1 баланс)"
                        >
                          <Flame className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label="Отменить с сохранением баланса"
                          onClick={() => {
                            hapticImpact('light');
                            onSetLessonStatus(l.id, 'missed_excused', 'Уважительная отмена');
                          }}
                          className="touch-hit flex-1 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 flex items-center justify-center active:scale-90"
                          title="Отмена (баланс сохранен)"
                        >
                          <Ban className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Lessons List with Compact Free Windows ("Окна") and Overlap Detection */}
        {dayLessons.length === 0 ? (
          <div className="bento-card rounded-3xl p-7 text-center space-y-3 mt-1">
            <div className="w-11 h-11 rounded-2xl bg-[#EEF3FE] text-[#2F6FED] flex items-center justify-center mx-auto">
              <CalendarPlus className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#1C1917]">На этот день уроков нет</h3>
              <p className="text-xs text-[#78716C] mt-0.5">Свободный день или выходной</p>
            </div>
            <button
              type="button"
              onClick={() => {
                hapticImpact('light');
                onAddLesson(selectedDate);
              }}
              className="py-2.5 px-4 rounded-full bg-[#2F6FED] hover:bg-[#255CE0] text-white font-semibold text-xs active:scale-95 transition-colors inline-flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>Запланировать урок</span>
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {dayLessons.map((lesson, idx) => {
              const student = studentsMap.get(lesson.student_id);
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
                      <div className="flex items-center justify-center gap-1.5 py-1 px-2.5 rounded-xl bg-[#FDECE8] border border-[#F6BFA9] text-[#B93815] text-[11px] font-semibold tabular-nums">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-[#E85D3F]" aria-hidden="true" />
                        <span>
                          Накладка по времени: {prevSlot.startStr}–{prevSlot.endStr} и{' '}
                          {currSlot.startStr}–{currSlot.endStr}
                        </span>
                      </div>
                    );
                  } else if (gapMinutes >= 30) {
                    gapElement = (
                      <div className="flex items-center justify-between px-2.5 py-1 min-h-[26px] rounded-xl border border-dashed border-[#DDD5C7] bg-[#F2EFE8]/85 text-[#78716C] text-[11px]">
                        <div className="flex items-center gap-1.5 font-medium min-w-0">
                          <Coffee className="w-3 h-3 text-[#8C857B] shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            Окно{' '}
                            <span className="text-[#1C1917] font-semibold">
                              {formatDurationRu(gapMinutes)}
                            </span>{' '}
                            <span className="text-[#8C857B] tabular-nums">
                              · {prevSlot.endStr}–{currSlot.startStr}
                            </span>
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            hapticImpact('light');
                            onAddLesson(selectedDate, prevSlot.endStr);
                          }}
                          className="touch-hit shrink-0 text-[11px] font-semibold text-[#2F6FED] hover:text-[#255CE0] active:opacity-70 transition-opacity ml-2 px-1"
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
                    isExpanded={expandedLessonId === lesson.id}
                    onToggleExpand={() => handleToggleExpand(lesson.id)}
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
