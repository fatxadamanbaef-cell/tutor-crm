'use client';

import React, { useState } from 'react';
import { Lesson } from '@/types';
import {
  getTashkentDateStrip,
  formatCalendarChip,
  isSameTashkentDate,
  getTashkentNow,
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

  const daysStrip = getTashkentDateStrip(5, 14); // 5 days in past, today, 14 days in future
  const isSelectedToday = isSameDay(selectedDate, getTashkentNow());

  const handleDayClick = (date: Date) => {
    hapticSelection();
    onSelectDate(date);
    if (isMonthView) {
      setIsMonthView(false);
    }
  };

  const handleTodayClick = () => {
    hapticImpact('medium');
    const today = getTashkentNow();
    setCurrentMonthDate(today);
    onSelectDate(today);
  };

  // Month Grid Calculation
  const monthStart = startOfMonth(currentMonthDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({ start: startDate, end: endDate });

  const getDayStatusSummary = (day: Date) => {
    const dayLessons = lessons.filter((l) => isSameTashkentDate(l.date, day));
    const hasCompleted = dayLessons.some((l) => l.status === 'completed');
    const hasBurned = dayLessons.some((l) => l.status === 'missed_penalty');
    const hasMakeup = dayLessons.some((l) => l.status === 'missed_excused');
    const hasPlanned = dayLessons.some((l) => l.status === 'planned');

    return {
      total: dayLessons.length,
      hasCompleted,
      hasBurned,
      hasMakeup,
      hasPlanned,
    };
  };

  return (
    <div className="space-y-2.5">
      {/* Date Strip Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <CalendarIcon className="w-4 h-4 text-teal-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            {isSelectedToday
              ? `Сегодня • ${formatTashkentHeaderDate(selectedDate)}`
              : formatTashkentHeaderDate(selectedDate)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {!isSelectedToday && (
            <button
              onClick={handleTodayClick}
              className="text-[11px] font-bold text-teal-400 bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 rounded-lg active:scale-95 transition-all"
            >
              Сегодня
            </button>
          )}

          <button
            onClick={() => {
              hapticImpact('light');
              setIsMonthView(!isMonthView);
              setCurrentMonthDate(selectedDate);
            }}
            className={`flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-all active:scale-95 ${
              isMonthView
                ? 'bg-teal-600 text-white border-teal-400'
                : 'bg-zinc-800/80 text-zinc-300 border-zinc-700 hover:bg-zinc-800'
            }`}
          >
            {isMonthView ? (
              <>
                <List className="w-3 h-3" />
                <span>Лента</span>
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
            const isSelected = isSameDay(day, selectedDate);
            const statusSummary = getDayStatusSummary(day);

            return (
              <button
                key={day.toISOString()}
                onClick={() => handleDayClick(day)}
                className={`flex flex-col items-center justify-between min-w-[46px] h-[62px] py-1.5 rounded-2xl border transition-all active:scale-95 shrink-0 relative ${
                  isSelected
                    ? 'bg-teal-600 text-white border-teal-400 shadow-lg shadow-teal-600/30 font-bold'
                    : chip.isToday
                    ? 'bg-zinc-900 text-zinc-200 border-teal-500/50 ring-1 ring-teal-500/30'
                    : 'bg-zinc-900/80 text-zinc-400 border-zinc-800/80 hover:border-zinc-700'
                }`}
              >
                <span
                  className={`text-[10px] uppercase font-bold ${
                    isSelected ? 'text-teal-100' : 'text-zinc-400'
                  }`}
                >
                  {chip.dayOfWeek}
                </span>

                <span className="text-sm font-extrabold leading-none">
                  {chip.dayNumber}
                </span>

                {/* Micro-Indicators Row */}
                <div className="flex items-center gap-0.5 h-2 justify-center">
                  {statusSummary.hasBurned && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-rose-200 ring-1 ring-rose-400' : 'bg-rose-500'
                      }`}
                      title="Сгоревший урок"
                    />
                  )}
                  {statusSummary.hasCompleted && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-emerald-200 ring-1 ring-emerald-400' : 'bg-emerald-400'
                      }`}
                      title="Проведенный урок"
                    />
                  )}
                  {statusSummary.hasMakeup && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-amber-200 ring-1 ring-amber-400' : 'bg-amber-400'
                      }`}
                      title="Ожидает отработки"
                    />
                  )}
                  {statusSummary.hasPlanned && !statusSummary.hasCompleted && !statusSummary.hasBurned && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-white' : 'bg-teal-400'
                      }`}
                      title="Запланирован"
                    />
                  )}
                  {statusSummary.total === 0 && <span className="w-1.5 h-1.5" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* VIEW 2: EXPANDED MONTH GRID (1-31) */}
      {isMonthView && (
        <div className="p-3.5 bg-zinc-900/95 border border-zinc-800 rounded-3xl space-y-3 animate-in fade-in zoom-in-95 duration-150 shadow-2xl">
          {/* Month Navigator */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                hapticImpact('light');
                setCurrentMonthDate(subMonths(currentMonthDate, 1));
              }}
              className="p-1.5 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white active:bg-zinc-700"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="font-extrabold text-sm text-zinc-100 capitalize">
              {format(currentMonthDate, 'LLLL yyyy', { locale: ru })}
            </span>

            <button
              onClick={() => {
                hapticImpact('light');
                setCurrentMonthDate(addMonths(currentMonthDate, 1));
              }}
              className="p-1.5 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white active:bg-zinc-700"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday Headers */}
          <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-zinc-400 uppercase">
            <span>Пн</span>
            <span>Вт</span>
            <span>Ср</span>
            <span>Чт</span>
            <span>Пт</span>
            <span>Сб</span>
            <span className="text-amber-400">Вс</span>
          </div>

          {/* Days 7-column Grid */}
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
                  className={`h-11 rounded-xl flex flex-col items-center justify-between py-1 transition-all text-xs font-bold border relative active:scale-95 ${
                    isSelected
                      ? 'bg-teal-600 text-white border-teal-400 shadow-md shadow-teal-600/30 font-black'
                      : isToday
                      ? 'bg-zinc-800/90 text-teal-300 border-teal-500/60'
                      : isCurrentMonth
                      ? 'bg-zinc-950/60 text-zinc-200 border-zinc-800 hover:border-zinc-700'
                      : 'bg-zinc-950/20 text-zinc-600 border-transparent'
                  }`}
                >
                  <span className="text-[11px] leading-tight">{day.getDate()}</span>

                  {/* Indicators */}
                  <div className="flex items-center gap-0.5 h-1.5 justify-center">
                    {statusSummary.hasBurned && (
                      <span className="w-1 h-1 rounded-full bg-rose-500" />
                    )}
                    {statusSummary.hasCompleted && (
                      <span className="w-1 h-1 rounded-full bg-emerald-400" />
                    )}
                    {statusSummary.hasMakeup && (
                      <span className="w-1 h-1 rounded-full bg-amber-400" />
                    )}
                    {statusSummary.hasPlanned && !statusSummary.hasCompleted && !statusSummary.hasBurned && (
                      <span className="w-1 h-1 rounded-full bg-teal-400" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-3 pt-2 border-t border-zinc-800/80 text-[10px] text-zinc-400 font-medium">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Проведен
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Сгорел
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> В ВС
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400" /> План
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
