'use client';

import React, { useState, useMemo } from 'react';
import { Student, RecurringSlot } from '@/types';
import { Search, Plus, ArrowUpDown, CalendarClock } from 'lucide-react';
import { hapticImpact } from '@/lib/telegram';
import { WD_SHORT } from '@/lib/formatters';

interface ClientsTabProps {
  students: Student[];
  onOpenStudent: (student: Student) => void;
  onAddStudent: () => void;
}

type FilterMode = 'all' | 'low_balance' | 'package' | 'date_to_date' | 'inactive';
type SortMode = 'name' | 'balance';

function formatRecurringSummary(slots?: RecurringSlot[]): string {
  if (!slots || slots.length === 0) return '';
  const sorted = [...slots].sort((a, b) => Number(a.dayOfWeek) - Number(b.dayOfWeek));
  const capDay = (dow: number) => {
    const d = WD_SHORT[dow] || '';
    return d ? d.charAt(0).toUpperCase() + d.slice(1) : '';
  };
  const firstTime = (sorted[0].startTime || '').substring(0, 5);
  const allSameTime = sorted.every((s) => (s.startTime || '').substring(0, 5) === firstTime);
  if (allSameTime && firstTime) {
    return `${sorted.map((s) => capDay(Number(s.dayOfWeek))).join(', ')} • ${firstTime}`;
  }
  return sorted
    .map((s) => `${capDay(Number(s.dayOfWeek))} ${(s.startTime || '').substring(0, 5)}`)
    .join(', ');
}

export const ClientsTab: React.FC<ClientsTabProps> = ({ students, onOpenStudent, onAddStudent }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');

  const activeStudents = useMemo(
    () => students.filter((s) => s.is_active !== false),
    [students]
  );
  const inactiveStudents = useMemo(
    () => students.filter((s) => s.is_active === false),
    [students]
  );

  const lowBalanceCount = useMemo(
    () => activeStudents.filter((s) => (s.lessons_balance ?? 0) <= 2).length,
    [activeStudents]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let base = filterMode === 'inactive' ? inactiveStudents : activeStudents;

    if (filterMode === 'low_balance') {
      base = base.filter((s) => (s.lessons_balance ?? 0) <= 2);
    } else if (filterMode === 'package') {
      base = base.filter((s) => s.billing_type === 'package');
    } else if (filterMode === 'date_to_date') {
      base = base.filter((s) => s.billing_type !== 'package');
    }

    if (q) {
      base = base.filter((s) => s.name.toLowerCase().includes(q));
    }

    const sorted = [...base];
    if (sortMode === 'balance') {
      sorted.sort((a, b) => {
        const diff = (a.lessons_balance ?? 0) - (b.lessons_balance ?? 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ru');
      });
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }
    return sorted;
  }, [activeStudents, inactiveStudents, filterMode, searchQuery, sortMode]);

  return (
    <div className="flex flex-col h-full bg-[#f2f2f7] pb-28">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 bg-white border-b border-gray-200/80 sticky top-0 z-10 space-y-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Ученики</h1>
            <p className="text-xs text-gray-500 font-semibold mt-0.5">
              Активных: {activeStudents.length}
              {inactiveStudents.length > 0 ? ` · На паузе: ${inactiveStudents.length}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                hapticImpact('light');
                setSortMode((prev) => (prev === 'name' ? 'balance' : 'name'));
              }}
              className={`h-9 px-2.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all ${
                sortMode === 'balance'
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-gray-100 border-gray-200 text-gray-700'
              }`}
              title="Переключить сортировку"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortMode === 'balance' ? 'Долги' : 'А-Я'}</span>
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); hapticImpact('light'); onAddStudent(); }}
              className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 active:scale-90 transition-transform"
            >
              <Plus className="w-5 h-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-3 py-2 bg-gray-100 border-transparent rounded-xl text-xs font-semibold text-gray-900 placeholder-gray-400 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500"
            placeholder="Поиск по имени ученика"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {[
            { id: 'all', label: `Все (${activeStudents.length})` },
            { id: 'low_balance', label: `К оплате${lowBalanceCount > 0 ? ` (${lowBalanceCount})` : ''}` },
            { id: 'package', label: 'Пакет' },
            { id: 'date_to_date', label: 'По датам' },
            ...(inactiveStudents.length > 0
              ? [{ id: 'inactive', label: `Пауза (${inactiveStudents.length})` }]
              : []),
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                hapticImpact('light');
                setFilterMode(chip.id as FilterMode);
              }}
              className={`shrink-0 px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all active:scale-95 ${
                filterMode === chip.id
                  ? chip.id === 'low_balance'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                    : 'bg-blue-600 text-white border-blue-600 shadow-xs'
                  : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Students List */}
      <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-xs font-semibold">
            {students.length === 0 ? 'У вас пока нет учеников. Добавьте первого!' : 'По выбранному фильтру учеников нет'}
          </div>
        ) : (
          filtered.map(student => {
            const target = student.monthly_target_lessons || 12;
            const conducted = student.conducted_this_month || 0;
            const missed = student.missed_this_month || 0;
            const balance = student.lessons_balance ?? 0;
            const rate = student.lesson_rate || 300000;
            const isPkg = student.billing_type === 'package';
            const scheduleSummary = formatRecurringSummary(student.recurring_schedule);
            const isPaused = student.is_active === false;

            return (
              <div
                key={student.id}
                onClick={() => { hapticImpact('light'); onOpenStudent(student); }}
                className={`w-full bg-white rounded-2xl p-3.5 shadow-xs border overflow-hidden cursor-pointer active:scale-[0.98] transition-all hover:border-blue-300 ${
                  isPaused ? 'border-gray-200 opacity-75' : 'border-gray-200/70'
                }`}
              >
                <div className="flex items-center justify-between mb-2.5 gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm shadow-xs shrink-0"
                      style={{ backgroundColor: student.color || '#3B82F6' }}
                    >
                      {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-sm font-bold text-gray-900 leading-tight truncate">{student.name}</h3>
                        {isPaused && (
                          <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 text-[9px] font-black uppercase">
                            Пауза
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-0.5 font-medium flex-wrap">
                        <span className="px-1.5 py-0.2 rounded bg-gray-100 text-gray-700 text-[10px] font-bold">
                          {isPkg ? 'Пакет' : 'По датам'}
                        </span>
                        <span>• Оплата: <b>{student.billing_day || '10 число'}</b></span>
                      </div>
                      {scheduleSummary && (
                        <div className="text-[11px] text-blue-700 font-semibold flex items-center gap-1 mt-0.5 truncate">
                          <CalendarClock className="w-3 h-3 shrink-0" />
                          <span className="truncate">{scheduleSummary}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span
                      className={`text-xs font-black px-2.5 py-1 rounded-lg border ${
                        balance <= 0
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : balance <= 2
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      Баланс: {balance} ур.
                    </span>
                  </div>
                </div>

                {/* Progress / Status Bar */}
                <div className="grid grid-cols-4 gap-1.5 pt-2.5 border-t border-gray-100 text-center">
                  <div className="bg-gray-50 py-1.5 px-1 rounded-xl">
                    <span className="text-[9px] font-bold text-gray-400 block uppercase">Ставка</span>
                    <span className="text-[11px] font-black text-gray-800">{Math.round(rate / 1000)}k</span>
                  </div>
                  <div className="bg-blue-50 py-1.5 px-1 rounded-xl">
                    <span className="text-[9px] font-bold text-blue-700 block uppercase">Норма</span>
                    <span className="text-[11px] font-black text-blue-700">{target} ур.</span>
                  </div>
                  <div className="bg-green-50 py-1.5 px-1 rounded-xl">
                    <span className="text-[9px] font-bold text-green-700 block uppercase">Был</span>
                    <span className="text-[11px] font-black text-green-700">{conducted} ✅</span>
                  </div>
                  <div className="bg-red-50 py-1.5 px-1 rounded-xl">
                    <span className="text-[9px] font-bold text-red-700 block uppercase">Пропуск</span>
                    <span className="text-[11px] font-black text-red-700">{missed} ❌</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
