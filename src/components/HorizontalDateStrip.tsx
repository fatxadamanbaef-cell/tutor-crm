'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Lesson } from '@/types';
import {
  getTashkentDateStrip,
  formatCalendarChip,
  getTashkentNow,
  getTashkentTodayStr,
  getTashkentDateString,
  addDaysStr,
  formatTashkentHeaderDate,
} from '@/lib/formatters';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, LayoutGrid, List, Plus } from 'lucide-react';
import { hapticImpact, hapticSelection } from '@/lib/telegram';
import {
  isSameDay,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  subMonths,
  addDays,
  subDays,
  format,
} from 'date-fns';
import { ru } from 'date-fns/locale';

interface HorizontalDateStripProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  lessons: Lesson[];
  onQuickAdd?: () => void;
}

const EMPTY_DAY_SUMMARY = { total: 0, allDone: false };

export const HorizontalDateStrip: React.FC<HorizontalDateStripProps> = ({
  selectedDate,
  onSelectDate,
  lessons,
  onQuickAdd,
}) => {
  const [isMonthView, setIsMonthView] = useState(false);
  const [currentMonthDate, setCurrentMonthDate] = useState(selectedDate);
  const selectedChipRef = useRef<HTMLButtonElement | null>(null);
  const hasScrolledInitialRef = useRef(false);

  const todayStr = getTashkentTodayStr();
  const selectedStr = getTashkentDateString(selectedDate);
  const defaultStartStr = addDaysStr(todayStr, -5);
  const defaultEndStr = addDaysStr(todayStr, 14);
  const isInsideDefault = selectedStr >= defaultStartStr && selectedStr <= defaultEndStr;

  const daysStrip = useMemo(() => {
    if (isInsideDefault) {
      return getTashkentDateStrip(5, 14);
    }
    const [y, m, d] = selectedStr.split('-').map(Number);
    const anchor = new Date(y, m - 1, d);
    const start = subDays(anchor, 5);
    return Array.from({ length: 20 }).map((_, i) => addDays(start, i));
  }, [isInsideDefault, selectedStr]);

  const isSelectedToday = selectedStr === todayStr;

  useEffect(() => {
    if (!isMonthView && selectedChipRef.current) {
      const behavior = hasScrolledInitialRef.current ? 'smooth' : 'auto';
      hasScrolledInitialRef.current = true;
      selectedChipRef.current.scrollIntoView({
        behavior,
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [selectedStr, isMonthView]);

  const handleDayClick = (date: Date) => {
    hapticSelection();
    onSelectDate(date);
    setIsMonthView(false);
  };

  const handleTodayClick = () => {
    hapticImpact('medium');
    const today = getTashkentNow();
    setCurrentMonthDate(today);
    onSelectDate(today);
    setIsMonthView(false);
  };

  // Month Grid Calculation — memoized on currentMonthDate change only
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonthDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: startDate, end: endDate });
  }, [currentMonthDate]);

  // Pre-index all lesson counts and completion flags by YYYY-MM-DD in O(L) once per lessons change
  const daySummaryMap = useMemo(() => {
    const buckets = new Map<string, { total: number; done: number }>();
    for (const l of lessons) {
      if (l.status === 'missed_excused') continue;
      const dateKey = l.date.substring(0, 10);
      let b = buckets.get(dateKey);
      if (!b) {
        b = { total: 0, done: 0 };
        buckets.set(dateKey, b);
      }
      b.total += 1;
      if (
        l.status === 'completed' ||
        l.status === 'missed_penalty' ||
        l.status === 'missed'
      ) {
        b.done += 1;
      }
    }

    const result = new Map<string, { total: number; allDone: boolean }>();
    for (const [key, b] of buckets.entries()) {
      result.set(key, {
        total: b.total,
        allDone: b.total > 0 && b.done === b.total,
      });
    }
    return result;
  }, [lessons]);

  return (
    <div className="space-y-1.5">
      {/* Date Strip Header */}
      <div className="flex items-center justify-between gap-2 px-0.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <CalendarIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="text-xs font-semibold capitalize tracking-tight text-slate-800 truncate">
            {isSelectedToday
              ? `Сегодня • ${formatTashkentHeaderDate(selectedDate)}`
              : formatTashkentHeaderDate(selectedDate)}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isSelectedToday && (
            <button
              type="button"
              onClick={handleTodayClick}
              className="touch-hit h-8 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 px-2.5 rounded-lg active:scale-95 transition-all"
            >
              Сегодня
            </button>
          )}

          <button
            type="button"
            aria-pressed={isMonthView}
            onClick={() => {
              hapticImpact('light');
              setIsMonthView(!isMonthView);
              setCurrentMonthDate(selectedDate);
            }}
            className={`touch-hit h-8 flex items-center gap-1 text-[11px] font-semibold px-2.5 rounded-lg border transition-all active:scale-95 ${
              isMonthView
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50/90 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {isMonthView ? (
              <>
                <List className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Неделя</span>
              </>
            ) : (
              <>
                <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Месяц</span>
              </>
            )}
          </button>

          {onQuickAdd && (
            <button
              type="button"
              onClick={() => {
                hapticImpact('light');
                onQuickAdd();
              }}
              className="touch-hit w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-xs active:scale-95 transition-all shrink-0 animate-in fade-in zoom-in-95 duration-150 motion-reduce:animate-none"
              title="Добавить урок"
              aria-label="Добавить урок"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: HORIZONTAL SCROLLABLE STRIP (DEFAULT) */}
      {!isMonthView && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {daysStrip.map((day) => {
            const chip = formatCalendarChip(day);
            const dayStr = getTashkentDateString(day);
            const isSelected = dayStr === selectedStr;
            const statusSummary = daySummaryMap.get(dayStr) || EMPTY_DAY_SUMMARY;

            return (
              <button
                key={dayStr}
                ref={isSelected ? selectedChipRef : null}
                aria-current={isSelected ? 'date' : undefined}
                onClick={() => handleDayClick(day)}
                className={`flex flex-col items-center justify-between min-w-[44px] h-[56px] py-1 px-1 rounded-xl border transition-all active:scale-95 shrink-0 relative ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/25 font-bold'
                    : chip.isToday
                    ? 'bg-blue-50/80 text-blue-700 border-blue-300'
                    : 'bg-slate-50/70 text-slate-700 border-slate-200/80 hover:bg-slate-100'
                }`}
              >
                <span
                  className={`text-[10px] uppercase font-semibold leading-none ${
                    isSelected ? 'text-blue-100' : chip.isToday ? 'text-blue-600' : 'text-slate-400'
                  }`}
                >
                  {chip.dayOfWeek}
                </span>

                <span className="text-sm font-bold leading-none tabular-nums">{chip.dayNumber}</span>

                {/* Lesson Count / Status Pill */}
                <div className="h-3.5 flex items-center justify-center">
                  {statusSummary.total > 0 ? (
                    <span
                      className={`text-[9px] font-semibold px-1.5 rounded-full leading-tight inline-flex items-center gap-0.5 tabular-nums ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : statusSummary.allDone
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200/80 text-slate-600'
                      }`}
                    >
                      <span>{statusSummary.total}</span>
                    </span>
                  ) : (
                    <span className="w-1 h-1 rounded-full bg-transparent" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* VIEW 2: EXPANDED MONTH GRID (1-31) */}
      {isMonthView && (
        <div className="p-3 bg-white border border-slate-200 rounded-2xl space-y-2.5 animate-in fade-in zoom-in-95 duration-150 shadow-lg">
          {/* Month Navigator */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              aria-label="Предыдущий месяц"
              onClick={() => {
                hapticImpact('light');
                setCurrentMonthDate(subMonths(currentMonthDate, 1));
              }}
              className="touch-hit p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            </button>

            <span className="text-xs font-bold capitalize text-slate-900">
              {format(currentMonthDate, 'LLLL yyyy', { locale: ru })}
            </span>

            <button
              type="button"
              aria-label="Следующий месяц"
              onClick={() => {
                hapticImpact('light');
                setCurrentMonthDate(addMonths(currentMonthDate, 1));
              }}
              className="touch-hit p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95"
            >
              <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* DOW Headers */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => (
              <span key={d} className="text-[10px] font-semibold uppercase text-slate-400">
                {d}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day) => {
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentMonth = day.getMonth() === currentMonthDate.getMonth();
              const isToday = isSameDay(day, getTashkentNow());
              const statusSummary = daySummaryMap.get(getTashkentDateString(day)) || EMPTY_DAY_SUMMARY;

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => handleDayClick(day)}
                  disabled={!isCurrentMonth}
                  className={`h-10 rounded-xl flex flex-col items-center justify-center relative border transition-all active:scale-95 ${
                    !isCurrentMonth
                      ? 'opacity-20 pointer-events-none border-transparent text-slate-400'
                      : isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-bold'
                      : isToday
                      ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold'
                      : 'bg-slate-50/70 border-slate-100 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="text-xs leading-none font-semibold tabular-nums">{format(day, 'd')}</span>

                  {statusSummary.total > 0 && (
                    <span
                      className={`text-[9px] font-semibold mt-0.5 leading-none tabular-nums ${
                        isSelected
                          ? 'text-blue-100'
                          : statusSummary.allDone
                          ? 'text-emerald-600'
                          : 'text-slate-400'
                      }`}
                    >
                      {statusSummary.total} ур.
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
