'use client';

import React, { useState, useMemo } from 'react';
import { Student, RecurringSlot } from '@/types';
import {
  Search,
  Plus,
  ArrowUpDown,
  CalendarClock,
  Copy,
  Check,
  Send,
  Phone,
  AlertCircle,
  X,
} from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { WD_SHORT, getStudentBillingPeriod, formatShortRuDate } from '@/lib/formatters';
import { calculateStudentBilling } from '@/lib/storage';
import { getTutorSettings, buildParentInvoiceMessage } from '@/lib/settings';
import { AddPaymentModal } from '@/components/modals/AddPaymentModal';
import { useToast } from '@/components/ui/ToastProvider';

interface ClientsTabProps {
  students: Student[];
  onOpenStudent: (student: Student) => void;
  onAddStudent: () => void;
  onOpenPaymentModal?: (student: Student) => void;
  onRefresh?: () => Promise<void> | void;
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

function getTelegramUrl(tgRaw?: string): string | null {
  if (!tgRaw) return null;
  const cleaned = tgRaw.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
  if (!cleaned) return null;
  return `https://t.me/${cleaned}`;
}

export const ClientsTab: React.FC<ClientsTabProps> = ({
  students,
  onOpenStudent,
  onAddStudent,
  onOpenPaymentModal,
  onRefresh,
}) => {
  const { showToast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [localPaymentStudent, setLocalPaymentStudent] = useState<Student | null>(null);

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
    if (sortMode === 'balance' || filterMode === 'low_balance') {
      sorted.sort((a, b) => {
        const diff = (a.lessons_balance ?? 0) - (b.lessons_balance ?? 0);
        return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ru');
      });
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }
    return sorted;
  }, [activeStudents, inactiveStudents, filterMode, searchQuery, sortMode]);

  const handleQuickCopyInvoice = async (e: React.MouseEvent, student: Student) => {
    e.stopPropagation();
    hapticImpact('light');
    try {
      const [calc, settings] = await Promise.all([
        calculateStudentBilling(student.id),
        getTutorSettings(),
      ]);
      const msg = buildParentInvoiceMessage(student, calc, settings);
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(msg);
        setCopiedId(student.id);
        hapticNotification('success');
        showToast({ message: `Счёт для ${student.name} скопирован`, tone: 'success' });
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch (err) {
      console.error('Quick copy invoice error:', err);
      showToast({ message: 'Не удалось скопировать счёт', tone: 'error' });
    }
  };

  const handleOpenQuickPayment = (e: React.MouseEvent, student: Student) => {
    e.stopPropagation();
    hapticImpact('light');
    if (onOpenPaymentModal) {
      onOpenPaymentModal(student);
    } else {
      setLocalPaymentStudent(student);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f4f5f8] pb-28">
      {/* Header */}
      <div className="px-4 pt-safe pb-3 bg-white border-b border-slate-200/80 sticky top-0 z-10 space-y-2.5 shadow-2xs">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-none">
              Ученики
            </h1>
            <p className="text-xs text-slate-500 font-medium mt-1 tabular-nums">
              Активных: <b className="text-slate-900 font-semibold">{activeStudents.length}</b>
              {lowBalanceCount > 0 && (
                <span className="text-rose-600 font-semibold"> • К оплате: {lowBalanceCount}</span>
              )}
              {inactiveStudents.length > 0 ? ` • Пауза: ${inactiveStudents.length}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                hapticImpact('light');
                setSortMode((prev) => (prev === 'name' ? 'balance' : 'name'));
              }}
              className={`h-9 px-3 rounded-xl border text-xs font-bold flex items-center gap-1 active:scale-95 transition-all ${
                sortMode === 'balance'
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-slate-100 border-slate-200 text-slate-700'
              }`}
              title="Переключить сортировку"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              <span>{sortMode === 'balance' ? 'По балансу' : 'А–Я'}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                hapticImpact('light');
                onAddStudent();
              }}
              className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1 shadow-sm shadow-blue-500/20 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Ученик</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-9 py-2 bg-slate-100 border border-transparent rounded-xl text-xs font-semibold text-slate-900 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-blue-500 transition-all"
            placeholder="Поиск по имени ученика..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Очистить поиск"
              className="touch-hit absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {[
            { id: 'all', label: `Все (${activeStudents.length})` },
            {
              id: 'low_balance',
              label: `К оплате${lowBalanceCount > 0 ? ` (${lowBalanceCount})` : ''}`,
            },
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
              className={`shrink-0 px-3 py-1 rounded-xl text-[11px] font-bold border transition-all active:scale-95 ${
                filterMode === chip.id
                  ? chip.id === 'low_balance'
                    ? 'bg-rose-600 text-white border-rose-600 shadow-2xs'
                    : 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Students List */}
      <div className="flex-1 px-3.5 py-3.5 space-y-2.5 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-xs font-semibold">
            {students.length === 0
              ? 'У вас пока нет учеников. Добавьте первого!'
              : 'По выбранному фильтру учеников нет'}
          </div>
        ) : (
          filtered.map((student) => {
            const total = student.cycle_total_lessons ?? student.monthly_target_lessons ?? 12;
            const used = student.cycle_used_lessons ?? student.conducted_this_month ?? 0;
            const excused = student.cycle_excused_lessons ?? student.missed_this_month ?? 0;
            const balance = student.lessons_balance ?? 0;
            const rate = student.lesson_rate || 300000;
            const isPkg = student.billing_type === 'package';
            const cycleStart = student.cycle_start_date;
            const cycleEnd = student.cycle_end_date;
            const remaining = student.cycle_remaining_lessons ?? Math.max(0, balance);
            const prepaidExtra = student.cycle_prepaid_extra ?? 0;
            const isExhausted = isPkg && balance <= 0;
            const scheduleSummary = formatRecurringSummary(student.recurring_schedule);
            const isPaused = student.is_active === false;
            const tgUrl = getTelegramUrl(student.telegram);
            const billingPeriod = getStudentBillingPeriod(student.billing_day || '10');
            const progressPct = isExhausted
              ? 100
              : Math.min(100, Math.round((used / Math.max(1, total)) * 100));

            return (
              <div
                key={student.id}
                onClick={() => {
                  hapticImpact('light');
                  onOpenStudent(student);
                }}
                className={`w-full bg-white rounded-2xl p-3.5 shadow-2xs border overflow-hidden cursor-pointer active:scale-[0.99] transition-all hover:border-slate-300 space-y-2.5 ${
                  isPaused
                    ? 'border-slate-200 opacity-70'
                    : balance <= 0
                    ? 'border-rose-200/90'
                    : 'border-slate-200/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-2xs shrink-0 mt-0.5"
                      style={{ backgroundColor: student.color || '#3B82F6' }}
                    >
                      {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-[15px] font-semibold text-slate-900 leading-snug truncate">
                          {student.name}
                        </h3>
                        {isPaused && (
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[9px] font-semibold uppercase">
                            Пауза
                          </span>
                        )}
                      </div>

                      {scheduleSummary ? (
                        <div className="text-xs text-slate-700 font-medium flex items-center gap-1 mt-0.5 truncate tabular-nums">
                          <CalendarClock className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="truncate">{scheduleSummary}</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Расписание не задано
                        </div>
                      )}

                      <div className="text-[11px] text-slate-500 font-medium mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                        <span>{Math.round(rate / 1000)} тыс/ур.</span>
                        <span className="text-slate-400">
                          {isPkg
                            ? `Пакет ${total} ур.${cycleStart ? ` с ${formatShortRuDate(cycleStart)}` : ''}`
                            : `По датам (с ${billingPeriod.billingDay}-го числа)`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Balance Badge + Contact Quick Links */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-xl border inline-flex items-center gap-1 tabular-nums ${
                        balance <= 0
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : balance <= 2
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-emerald-50/80 text-emerald-800 border-emerald-200/80'
                      }`}
                    >
                      {balance <= 0 && <AlertCircle className="w-3.5 h-3.5 text-rose-600" />}
                      <span>{balance} ур.</span>
                    </span>

                    {/* 1-Tap Contact Icons */}
                    {(tgUrl || student.phone) && (
                      <div
                        className="flex items-center gap-1.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {tgUrl && (
                          <a
                            href={tgUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Написать в Telegram: ${student.name}`}
                            className="touch-hit w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center active:scale-90 transition-all"
                            title="Написать в Telegram"
                          >
                            <Send className="w-3.5 h-3.5" aria-hidden="true" />
                          </a>
                        )}
                        {student.phone && (
                          <a
                            href={`tel:${student.phone}`}
                            aria-label={`Позвонить: ${student.name}`}
                            className="touch-hit w-8 h-8 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center active:scale-90 transition-all"
                            title="Позвонить"
                          >
                            <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer: Active Cycle / Billing Period Progress + Quick Actions */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium mb-1 tabular-nums">
                      {isPkg ? (
                        balance <= 0 ? (
                          <span className="truncate text-rose-700 font-semibold">
                            Пакет завершён · {used}/{total} ур.
                            {balance < 0 ? ` · долг ${Math.abs(balance)} ур.` : ''}
                          </span>
                        ) : (
                          <span className="truncate">
                            Пакет{cycleStart ? ` с ${formatShortRuDate(cycleStart)}` : ''}:{' '}
                            <b className="text-slate-900">{used}</b> из {total} ур.
                            {excused > 0 ? ` · отм: ${excused}` : ''}
                            {cycleEnd ? ` · до ~${formatShortRuDate(cycleEnd)}` : ''}
                            {prepaidExtra > 0 ? ` (+${prepaidExtra})` : ''}
                          </span>
                        )
                      ) : (
                        <span className="truncate">
                          С <b className="text-slate-700">{billingPeriod.startShort}</b> по{' '}
                          <b className="text-slate-700">{billingPeriod.endShort}</b>:{' '}
                          <b className="text-slate-900">{used}</b> из {total} ур.
                          {excused > 0 ? ` (отм: ${excused})` : ''}
                        </span>
                      )}
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isPkg && balance <= 0
                            ? 'bg-rose-500'
                            : isPkg && remaining <= 2
                            ? 'bg-amber-500'
                            : 'bg-blue-600'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Quick Billing Buttons right on the card */}
                  <div
                    className="flex items-center gap-1.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => handleQuickCopyInvoice(e, student)}
                      className={`touch-hit h-8 px-2.5 rounded-lg text-[11px] font-bold border inline-flex items-center gap-1 active:scale-95 transition-all ${
                        copiedId === student.id
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                      title="Скопировать счёт на оплату для родителей"
                    >
                      {copiedId === student.id ? (
                        <>
                          <Check className="w-3 h-3" aria-hidden="true" />
                          <span>Счёт!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-slate-400" aria-hidden="true" />
                          <span>Счёт</span>
                        </>
                      )}
                    </button>

                    {!isPaused && (
                      <button
                        type="button"
                        onClick={(e) => handleOpenQuickPayment(e, student)}
                        className={`touch-hit h-8 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-0.5 active:scale-95 transition-all tabular-nums ${
                          balance <= 2
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                            : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/80'
                        }`}
                        title={`Зафиксировать оплату на ${total} уроков`}
                      >
                        <span>{balance <= 2 ? `+${total} ур.` : '+ Оплата'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!onOpenPaymentModal && (
        <AddPaymentModal
          isOpen={Boolean(localPaymentStudent)}
          student={localPaymentStudent}
          onClose={() => setLocalPaymentStudent(null)}
          onSaved={async () => {
            await onRefresh?.();
          }}
        />
      )}
    </div>
  );
};
