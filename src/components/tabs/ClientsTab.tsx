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
    <div className="flex flex-col h-full bg-[#F7F5F0] pb-28">
      {/* Header */}
      <div className="px-4 pt-safe pb-2.5 bg-white border-b border-[#E7E2D8] sticky top-0 z-10 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[#1C1917] tracking-tight leading-none">
              Ученики
            </h1>
            <p className="text-xs text-[#78716C] font-medium mt-1 tabular-nums">
              Активных: <b className="text-[#1C1917] font-semibold">{activeStudents.length}</b>
              {lowBalanceCount > 0 && (
                <span className="text-[#B93815] font-semibold"> · К оплате: {lowBalanceCount}</span>
              )}
              {inactiveStudents.length > 0 ? ` · Пауза: ${inactiveStudents.length}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                hapticImpact('light');
                setSortMode((prev) => (prev === 'name' ? 'balance' : 'name'));
              }}
              className={`h-8 px-2.5 rounded-full border text-xs font-semibold flex items-center gap-1 active:scale-95 transition-colors ${sortMode === 'balance'
                  ? 'bg-[#FEF6E7] border-[#F3DCAC] text-amber-900'
                  : 'bg-[#F2EFE9] border-[#E7E2D8] text-[#44403C]'
                }`}
              title="Переключить сортировку"
            >
              <ArrowUpDown className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{sortMode === 'balance' ? 'Баланс' : 'А–Я'}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                hapticImpact('light');
                onAddStudent();
              }}
              className="h-8 px-3 rounded-full bg-[#2F6FED] hover:bg-[#255CE0] text-white font-semibold text-xs flex items-center gap-1 shadow-xs active:scale-95 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
              <span>Ученик</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-[#8C857B]" aria-hidden="true" />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-9 py-2 bg-[#F2EFE9] border border-transparent rounded-xl text-xs font-semibold text-[#1C1917] placeholder-[#8C857B] focus:outline-hidden focus:bg-white focus:border-[#2F6FED] transition-colors"
            placeholder="Поиск по имени ученика..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Очистить поиск"
              className="touch-hit absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#8C857B] hover:text-[#44403C]"
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
              className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors active:scale-95 ${filterMode === chip.id
                  ? chip.id === 'low_balance'
                    ? 'bg-[#E85D3F] text-white border-[#E85D3F]'
                    : 'bg-[#1C1917] text-white border-[#1C1917]'
                  : 'bg-[#F7F5F0] text-[#57534E] border-[#E7E2D8] hover:bg-[#EFEBE2]'
                }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>

      {/* Students List */}
      <div className="flex-1 px-3 py-2.5 space-y-2 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-[#8C857B] text-xs font-semibold">
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
            const avatarColor = student.color || '#2F6FED';

            return (
              <div
                key={student.id}
                onClick={() => {
                  hapticImpact('light');
                  onOpenStudent(student);
                }}
                className={`w-full bento-card rounded-2xl p-3 overflow-hidden cursor-pointer active:scale-[0.99] transition-colors hover:border-[#D6CFC2] space-y-2 ${isPaused
                    ? 'border-[#E7E2D8] opacity-70'
                    : balance <= 0
                      ? 'border-[#F6BFA9]'
                      : 'border-[#E7E2D8]/90'
                  }`}
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 mt-0.5"
                      style={{
                        backgroundColor: `${avatarColor}1F`,
                        color: avatarColor,
                      }}
                    >
                      {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h3 className="text-[14px] font-semibold text-[#1C1917] leading-snug truncate">
                          {student.name}
                        </h3>
                        {isPaused && (
                          <span className="px-1.5 py-0.5 rounded-full bg-[#EFECE5] text-[#57534E] text-[9px] font-semibold uppercase">
                            Пауза
                          </span>
                        )}
                      </div>

                      {scheduleSummary ? (
                        <div className="text-xs text-[#44403C] font-medium flex items-center gap-1 mt-0.5 truncate tabular-nums">
                          <CalendarClock className="w-3.5 h-3.5 text-[#2F6FED] shrink-0" aria-hidden="true" />
                          <span className="truncate">{scheduleSummary}</span>
                        </div>
                      ) : (
                        <div className="text-[11px] text-[#8C857B] mt-0.5">
                          Расписание не задано
                        </div>
                      )}

                      <div className="text-[11px] text-[#78716C] font-medium mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                        <span>{Math.round(rate / 1000)} тыс/ур.</span>
                        <span className="text-[#8C857B]">
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
                      className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border inline-flex items-center gap-1 tabular-nums ${balance <= 0
                          ? 'bg-[#FDECE8] text-[#B93815] border-[#F6BFA9]'
                          : balance <= 2
                            ? 'bg-[#FEF6E7] text-amber-800 border-[#F3DCAC]'
                            : 'bg-[#E7F7F0] text-emerald-800 border-emerald-200/80'
                        }`}
                    >
                      {balance <= 0 && <AlertCircle className="w-3 h-3 text-[#E85D3F]" aria-hidden="true" />}
                      <span>{balance} ур.</span>
                    </span>

                    {/* 1-Tap Contact Icons */}
                    {(tgUrl || student.phone) && (
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {tgUrl && (
                          <a
                            href={tgUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Написать в Telegram: ${student.name}`}
                            className="touch-hit w-7 h-7 rounded-full bg-[#EEF3FE] text-[#2F6FED] hover:bg-[#E2EBFC] flex items-center justify-center active:scale-90 transition-colors"
                            title="Написать в Telegram"
                          >
                            <Send className="w-3 h-3" aria-hidden="true" />
                          </a>
                        )}
                        {student.phone && (
                          <a
                            href={`tel:${student.phone}`}
                            aria-label={`Позвонить: ${student.name}`}
                            className="touch-hit w-7 h-7 rounded-full bg-[#F2EFE9] text-[#57534E] hover:bg-[#EAE5DC] flex items-center justify-center active:scale-90 transition-colors"
                            title="Позвонить"
                          >
                            <Phone className="w-3 h-3" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer: Active Cycle / Billing Period Progress + Quick Actions */}
                <div className="pt-2 border-t border-[#EFECE5] flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between text-[11px] text-[#78716C] font-medium mb-1 tabular-nums">
                      {isPkg ? (
                        balance <= 0 ? (
                          <span className="truncate text-[#B93815] font-semibold">
                            Пакет завершён · {used}/{total} ур.
                            {balance < 0 ? ` · долг ${Math.abs(balance)} ур.` : ''}
                          </span>
                        ) : (
                          <span className="truncate">
                            Пакет{cycleStart ? ` с ${formatShortRuDate(cycleStart)}` : ''}:{' '}
                            <b className="text-[#1C1917]">{used}</b> из {total} ур.
                            {excused > 0 ? ` · отм: ${excused}` : ''}
                            {cycleEnd ? ` · до ~${formatShortRuDate(cycleEnd)}` : ''}
                            {prepaidExtra > 0 ? ` (+${prepaidExtra})` : ''}
                          </span>
                        )
                      ) : (
                        <span className="truncate">
                          С <b className="text-[#44403C]">{billingPeriod.startShort}</b> по{' '}
                          <b className="text-[#44403C]">{billingPeriod.endShort}</b>:{' '}
                          <b className="text-[#1C1917]">{used}</b> из {total} ур.
                          {excused > 0 ? ` (отм: ${excused})` : ''}
                        </span>
                      )}
                    </div>
                    <div className="w-full h-1.5 bg-[#EFECE5] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${isPkg && balance <= 0
                            ? 'bg-[#E85D3F]'
                            : isPkg && remaining <= 2
                              ? 'bg-amber-500'
                              : 'bg-[#2F6FED]'
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
                      className={`touch-hit h-7 px-2.5 rounded-full text-[11px] font-semibold border inline-flex items-center gap-1 active:scale-95 transition-colors ${copiedId === student.id
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-[#F7F5F0] hover:bg-[#EFEBE2] text-[#44403C] border-[#E7E2D8]'
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
                          <Copy className="w-3 h-3 text-[#8C857B]" aria-hidden="true" />
                          <span>Счёт</span>
                        </>
                      )}
                    </button>

                    {!isPaused && (
                      <button
                        type="button"
                        onClick={(e) => handleOpenQuickPayment(e, student)}
                        className={`touch-hit h-7 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-0.5 active:scale-95 transition-colors tabular-nums ${balance <= 2
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                            : 'bg-[#E7F7F0] hover:bg-[#D1F0E2] text-emerald-800 border border-emerald-200/80'
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
