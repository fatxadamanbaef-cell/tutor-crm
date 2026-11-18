'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Lesson } from '@/types';
import {
  getTashkentDateStrip,
  formatCalendarChip,
  isSameTashkentDate,
  getTashkentNow,
  getTashkentTodayStr,
  getTashkentDateString,
  addDaysStr,
  formatTashkentHeaderDate,
} from '@/lib/formatters';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react';
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
}

export const HorizontalDateStrip: React.FC<HorizontalDateStripProps> = ({
  selectedDate,
  onSelectDate,
  lessons,
}) => {
  const [isMonthView, setIsMonthView] = useState(false);
  const [currentMonthDate, setCurrentMonthDate] = useState(selectedDate);
  const selectedChipRef = useRef<HTMLButtonElement | null>(null);

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
      selectedChipRef.current.scrollIntoView({
        behavior: 'smooth',
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

  const getDayStatusSummary = (day: Date) => {
    const dayLessons = lessons.filter(
      (l) => isSameTashkentDate(l.date, day) && l.status !== 'missed_excused'
    );
    const allDayLessons = lessons.filter((l) => isSameTashkentDate(l.date, day));
    const hasCompleted = allDayLessons.some((l) => l.status === 'completed');
    const hasBurned = allDayLessons.some(
      (l) => l.status === 'missed_penalty' || (l.status === 'missed' && !l.needs_makeup)
    );
    const hasPlanned = allDayLessons.some(
      (l) => l.status === 'planned' || (l.status as string) === 'scheduled'
    );
    const allDone =
      dayLessons.length > 0 &&
      dayLessons.every(
        (l) =>
          l.status === 'completed' ||
          l.status === 'missed_penalty' ||
          l.status === 'missed'
      );

    return {
      total: dayLessons.length,
      hasCompleted,
      hasBurned,
      hasPlanned,
      allDone,
    };
  };

  return (
    <div className="space-y-2">
      {/* Date Strip Header */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-1.5">
          <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-xs font-extrabold capitalize tracking-tight text-slate-800">
            {isSelectedToday
              ? `Сегодня • ${formatTashkentHeaderDate(selectedDate)}`
              : formatTashkentHeaderDate(selectedDate)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {!isSelectedToday && (
            <button
              type="button"
              onClick={handleTodayClick}
              className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2.5 py-1 rounded-lg active:scale-95 transition-all"
            >
              Сегодня
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              hapticImpact('light');
              setIsMonthView(!isMonthView);
              setCurrentMonthDate(selectedDate);
            }}
            className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all active:scale-95 ${
              isMonthView
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {isMonthView ? (
              <>
                <List className="w-3 h-3" />
                <span>Неделя</span>
              </>
            ) : (
              <>
                <LayoutGrid className="w-3 h-3" />
                <span>Месяц</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* VIEW 1: HORIZONTAL SCROLLABLE STRIP (DEFAULT) */}
      {!isMonthView && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 no-scrollbar scroll-smooth">
          {daysStrip.map((day) => {
            const chip = formatCalendarChip(day);
            const dayStr = getTashkentDateString(day);
            const isSelected = dayStr === selectedStr;
            const statusSummary = getDayStatusSummary(day);

            return (
              <button
                key={dayStr}
                ref={isSelected ? selectedChipRef : null}
                onClick={() => handleDayClick(day)}
                className={`flex flex-col items-center justify-between min-w-[48px] h-[62px] py-1.5 px-1 rounded-2xl border transition-all active:scale-95 shrink-0 relative ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-500/25 font-bold'
                    : chip.isToday
                    ? 'bg-blue-50/80 text-blue-700 border-blue-300'
                    : 'bg-slate-50/70 text-slate-700 border-slate-200/80 hover:bg-slate-100'
                }`}
              >
                <span
                  className={`text-[10px] uppercase font-bold leading-none ${
                    isSelected ? 'text-blue-100' : chip.isToday ? 'text-blue-600' : 'text-slate-400'
                  }`}
                >
                  {chip.dayOfWeek}
                </span>

                <span className="text-[15px] font-black leading-none">{chip.dayNumber}</span>

                {/* Lesson Count / Status Pill */}
                <div className="h-3.5 flex items-center justify-center">
                  {statusSummary.total > 0 ? (
                    <span
                      className={`text-[9px] font-extrabold px-1.5 rounded-full leading-tight inline-flex items-center gap-0.5 ${
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
        <div className="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-3 animate-in fade-in zoom-in-95 duration-150 shadow-lg">
          {/* Month Navigator */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                hapticImpact('light');
                setCurrentMonthDate(subMonths(currentMonthDate, 1));
              }}
              className="p-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-black capitalize text-slate-900">
              {format(currentMonthDate, 'LLLL yyyy', { locale: ru })}
            </span>

            <button
              type="button"
              onClick={() => {
                hapticImpact('light');
                setCurrentMonthDate(addMonths(currentMonthDate, 1));
              }}
              className="p-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* DOW Headers */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => (
              <span key={d} className="text-[10px] font-bold uppercase text-slate-400">
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
              const statusSummary = getDayStatusSummary(day);

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
                      ? 'bg-blue-50 text-blue-700 border-blue-300 font-extrabold'
                      : 'bg-slate-50/70 border-slate-100 text-slate-700 hover:border-slate-300'
                  }`}
                >
                  <span className="text-xs leading-none font-bold">{format(day, 'd')}</span>

                  {statusSummary.total > 0 && (
                    <span
                      className={`text-[9px] font-extrabold mt-0.5 leading-none ${
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
