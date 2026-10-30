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
    <div className="space-y-2">
      {/* Date Strip Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <CalendarIcon className="w-4 h-4 text-blue-600" />
          <span className="text-xs font-black uppercase tracking-wider text-gray-800">
            {isSelectedToday
              ? `Сегодня • ${formatTashkentHeaderDate(selectedDate)}`
              : formatTashkentHeaderDate(selectedDate)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {!isSelectedToday && (
            <button
              onClick={handleTodayClick}
              className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg active:scale-95 transition-all"
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
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
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
                className={`flex flex-col items-center justify-between min-w-[46px] h-[60px] py-1.5 rounded-2xl border transition-all active:scale-95 shrink-0 relative ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 font-bold'
                    : chip.isToday
                    ? 'bg-blue-50 text-blue-700 border-blue-300 ring-1 ring-blue-300'
                    : 'bg-white text-gray-700 border-gray-200/90 hover:bg-gray-50'
                }`}
              >
                <span
                  className={`text-[10px] uppercase font-bold ${
                    isSelected ? 'text-blue-100' : 'text-gray-400'
                  }`}
                >
                  {chip.dayOfWeek}
                </span>

                <span className="text-sm font-black leading-none">
                  {chip.dayNumber}
                </span>

                {/* Micro-Indicators Row */}
                <div className="flex items-center gap-0.5 h-2 justify-center">
                  {statusSummary.hasBurned && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-rose-200 ring-1 ring-rose-400' : 'bg-rose-500'
                      }`}
                    />
                  )}
                  {statusSummary.hasCompleted && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-emerald-200 ring-1 ring-emerald-400' : 'bg-emerald-500'
                      }`}
                    />
                  )}
                  {statusSummary.hasMakeup && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-amber-200 ring-1 ring-amber-400' : 'bg-amber-500'
                      }`}
                    />
                  )}
                  {statusSummary.hasPlanned && !statusSummary.hasCompleted && !statusSummary.hasBurned && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? 'bg-white' : 'bg-blue-400'
                      }`}
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
        <div className="p-3.5 bg-white border border-gray-200/80 rounded-3xl space-y-3 animate-in fade-in zoom-in-95 duration-150 shadow-xl">
          {/* Month Navigator */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => {
                hapticImpact('light');
                setCurrentMonthDate(subMonths(currentMonthDate, 1));
              }}
              className="p-1.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-black capitalize text-gray-900">
              {format(currentMonthDate, 'LLLL yyyy', { locale: ru })}
            </span>

            <button
              onClick={() => {
                hapticImpact('light');
                setCurrentMonthDate(addMonths(currentMonthDate, 1));
              }}
              className="p-1.5 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 active:scale-95"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* DOW Headers */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => (
              <span key={d} className="text-[10px] font-bold uppercase text-gray-400">
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
                  className={`h-9 rounded-xl flex flex-col items-center justify-center relative border transition-all active:scale-95 ${
                    !isCurrentMonth
                      ? 'opacity-20 pointer-events-none border-transparent text-gray-400'
                      : isSelected
                      ? 'bg-blue-600 text-white border-blue-600 shadow-md font-bold'
                      : isToday
                      ? 'bg-blue-50 text-blue-700 border-blue-300 font-extrabold'
                      : 'bg-gray-50/70 border-gray-100 text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="text-xs leading-none font-bold">
                    {format(day, 'd')}
                  </span>

                  {/* Micro indicator */}
                  {statusSummary.total > 0 && (
                    <div className="flex gap-0.5 mt-0.5">
                      {statusSummary.hasCompleted && (
                        <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-emerald-200' : 'bg-emerald-500'}`} />
                      )}
                      {statusSummary.hasPlanned && (
                        <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-400'}`} />
                      )}
                      {statusSummary.hasMakeup && (
                        <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-amber-200' : 'bg-amber-500'}`} />
                      )}
                    </div>
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
