'use client';

import React, { useState } from 'react';
import { RecurringSlot, BillingType } from '@/types';
import { X, UserPlus, Clock, SlidersHorizontal, Loader2, Calendar, Package } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (student: {
    name: string;
    monthly_target_lessons: number;
    billing_day: string;
    billing_type?: BillingType;
    lesson_rate?: number;
    lessons_balance?: number;
    phone?: string;
    telegram?: string;
    recurring_schedule?: RecurringSlot[];
  }) => Promise<void> | void;
}

const WEEKDAYS = [
  { id: 1, label: 'Пн' },
  { id: 2, label: 'Вт' },
  { id: 3, label: 'Ср' },
  { id: 4, label: 'Чт' },
  { id: 5, label: 'Пт' },
  { id: 6, label: 'Сб' },
  { id: 7, label: 'Вс' },
];

function addMinutes(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '17:30';
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export const AddStudentModal: React.FC<AddStudentModalProps> = ({ isOpen, onClose, onSave }) => {
  if (!isOpen) return null;
  return <AddStudentModalContent onClose={onClose} onSave={onSave} />;
};

const AddStudentModalContent: React.FC<Omit<AddStudentModalProps, 'isOpen'>> = ({
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [monthlyTarget, setMonthlyTarget] = useState(12);
  const [billingDay, setBillingDay] = useState('10');
  const [billingType, setBillingType] = useState<BillingType>('date_to_date');
  const [lessonRate, setLessonRate] = useState(300000);
  const [lessonsBalance, setLessonsBalance] = useState(0);

  // Recurring Schedule
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]); // Mon, Wed, Fri
  const [startTime, setStartTime] = useState('16:00');
  const [endTime, setEndTime] = useState('17:30');
  const [customPerDayTime, setCustomPerDayTime] = useState(false);
  const [perDayTimes, setPerDayTimes] = useState<Record<number, { start: string; end: string }>>({
    1: { start: '16:00', end: '17:30' },
    3: { start: '16:00', end: '17:30' },
    5: { start: '16:00', end: '17:30' },
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const toggleDay = (dayId: number) => {
    hapticImpact('light');
    setSelectedDays((prev) => {
      const next = prev.includes(dayId)
        ? prev.filter((d) => d !== dayId)
        : [...prev, dayId].sort();
      return next;
    });
    setPerDayTimes((prev) => {
      if (prev[dayId]) return prev;
      return { ...prev, [dayId]: { start: startTime, end: endTime } };
    });
  };

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    setEndTime(addMinutes(newStart, 90));
  };

  const handleDayTimeChange = (dayId: number, field: 'start' | 'end', value: string) => {
    setPerDayTimes((prev) => {
      const cur = prev[dayId] || { start: startTime, end: endTime };
      if (field === 'start') {
        return {
          ...prev,
          [dayId]: { start: value, end: addMinutes(value, 90) },
        };
      }
      return {
        ...prev,
        [dayId]: { ...cur, end: value },
      };
    });
  };

  const handleSave = async () => {
    if (isSubmitting) return;
    if (!name.trim()) {
      setErrorMsg('Пожалуйста, введите имя ученика');
      hapticNotification('warning');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const recurring_schedule: RecurringSlot[] = selectedDays.map((dow) => {
      if (customPerDayTime && perDayTimes[dow]) {
        return {
          dayOfWeek: dow,
          startTime: perDayTimes[dow].start,
          endTime: perDayTimes[dow].end,
        };
      }
      return {
        dayOfWeek: dow,
        startTime,
        endTime,
      };
    });

    try {
      await onSave({
        name: name.trim(),
        monthly_target_lessons: Number(monthlyTarget) || 12,
        billing_day: billingDay.trim() || '10',
        billing_type: billingType,
        lesson_rate: Number(lessonRate) || 300000,
        lessons_balance: Number(lessonsBalance) || 0,
        phone: phone.trim(),
        telegram: telegram.trim(),
        recurring_schedule,
      });
      hapticNotification('success');
      onClose();
    } catch (e: unknown) {
      hapticNotification('error');
      const message = e instanceof Error ? e.message : 'Ошибка при сохранении ученика';
      setErrorMsg(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#1C1917]/45 flex items-end sm:items-center justify-center p-3"
      onClick={(e) => {
        e.stopPropagation();
        if (!isSubmitting) onClose();
      }}
      style={{ touchAction: 'none' }}
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-6 max-h-[92vh] overflow-y-auto border border-[#E7E2D8]"
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'pan-y', overscrollBehaviorY: 'contain' } as React.CSSProperties}
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-[#EFECE5]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#EEF3FE] flex items-center justify-center text-[#2F6FED]">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#1C1917] leading-tight">Новый ученик</h3>
              <p className="text-[11px] font-medium text-[#78716C]">
                Расписание создастся автоматически
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-[#F2EFE9] flex items-center justify-center text-[#78716C] hover:text-[#1C1917] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-[#57534E] uppercase tracking-wide block mb-1">
              Имя ученика *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Сахиб"
              className="w-full px-3.5 py-2.5 text-sm font-semibold border border-[#E7E2D8] rounded-xl bg-[#F7F5F0] text-[#1C1917] placeholder:text-[#8C857B] placeholder:font-normal focus:bg-white focus:border-[#2F6FED] focus:ring-2 focus:ring-[#2F6FED]/15 focus:outline-hidden transition-colors"
            />
          </div>

          {/* Schedule Builder */}
          <div className="p-3.5 bg-[#F7F5F0] rounded-2xl border border-[#E7E2D8] space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-[#44403C] uppercase tracking-wide">
                Дни и время уроков
              </span>
              {selectedDays.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    setCustomPerDayTime((prev) => !prev);
                  }}
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg inline-flex items-center gap-1 transition-colors ${customPerDayTime
                    ? 'bg-[#2F6FED] text-white'
                    : 'text-[#2F6FED] bg-[#EEF3FE] hover:bg-[#E2EBFC]'
                    }`}
                >
                  <SlidersHorizontal className="w-3 h-3" />
                  <span>{customPerDayTime ? 'Разное время' : 'Разное время?'}</span>
                </button>
              )}
            </div>

            {/* Days Chips */}
            <div className="flex justify-between gap-1">
              {WEEKDAYS.map((wd) => {
                const isSelected = selectedDays.includes(wd.id);
                return (
                  <button
                    key={wd.id}
                    type="button"
                    onClick={() => toggleDay(wd.id)}
                    className={`w-9 h-9 rounded-xl font-bold text-xs flex items-center justify-center transition-colors active:scale-95 ${isSelected
                      ? 'bg-[#1C1917] text-white shadow-xs'
                      : 'bg-white text-[#44403C] border border-[#E7E2D8] hover:bg-[#EFEBE2]'
                      }`}
                  >
                    {wd.label}
                  </button>
                );
              })}
            </div>

            {/* Time Selection: Shared or Per-Day */}
            {!customPerDayTime ? (
              <div className="flex items-center gap-2 pt-1">
                <Clock className="w-4 h-4 text-[#8C857B] shrink-0" />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  className="flex-1 bg-white border border-[#E7E2D8] rounded-xl px-2.5 py-1.5 text-xs font-semibold tabular-nums text-[#1C1917] focus:border-[#2F6FED] focus:outline-hidden"
                />
                <span className="text-[#8C857B] text-xs font-bold">–</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="flex-1 bg-white border border-[#E7E2D8] rounded-xl px-2.5 py-1.5 text-xs font-semibold tabular-nums text-[#1C1917] focus:border-[#2F6FED] focus:outline-hidden"
                />
              </div>
            ) : (
              <div className="space-y-1.5 pt-1">
                {selectedDays.map((dayId) => {
                  const wd = WEEKDAYS.find((w) => w.id === dayId);
                  const slot = perDayTimes[dayId] || { start: startTime, end: endTime };
                  return (
                    <div key={dayId} className="flex items-center gap-2">
                      <span className="w-7 text-xs font-semibold text-[#44403C]">
                        {wd?.label}:
                      </span>
                      <input
                        type="time"
                        value={slot.start}
                        onChange={(e) => handleDayTimeChange(dayId, 'start', e.target.value)}
                        className="flex-1 bg-white border border-[#E7E2D8] rounded-xl px-2.5 py-1 text-xs font-semibold tabular-nums text-[#1C1917] focus:border-[#2F6FED] focus:outline-hidden"
                      />
                      <span className="text-[#8C857B] text-xs">–</span>
                      <input
                        type="time"
                        value={slot.end}
                        onChange={(e) => handleDayTimeChange(dayId, 'end', e.target.value)}
                        className="flex-1 bg-white border border-[#E7E2D8] rounded-xl px-2.5 py-1 text-xs font-semibold tabular-nums text-[#1C1917] focus:border-[#2F6FED] focus:outline-hidden"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Billing Type Selector */}
          <div>
            <label className="text-[11px] font-semibold text-[#57534E] uppercase tracking-wide block mb-1">
              Модель оплаты
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  setBillingType('date_to_date');
                }}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-colors flex items-center justify-center gap-1.5 ${billingType === 'date_to_date'
                  ? 'bg-[#2F6FED] text-white border-[#2F6FED] shadow-xs'
                  : 'bg-[#F7F5F0] text-[#44403C] border-[#E7E2D8] hover:bg-[#EFEBE2]'
                  }`}
              >
                <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                <span>По датам месяца</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  setBillingType('package');
                }}
                className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-colors flex items-center justify-center gap-1.5 ${billingType === 'package'
                  ? 'bg-[#2F6FED] text-white border-[#2F6FED] shadow-xs'
                  : 'bg-[#F7F5F0] text-[#44403C] border-[#E7E2D8] hover:bg-[#EFEBE2]'
                  }`}
              >
                <Package className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Пакетами уроков</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-[#57534E] uppercase tracking-wide block mb-1">
                Ставка за урок (сум)
              </label>
              <input
                type="number"
                value={lessonRate}
                onChange={(e) => setLessonRate(Number(e.target.value))}
                step={10000}
                className="w-full px-3.5 py-2 text-xs font-semibold tabular-nums border border-[#E7E2D8] rounded-xl bg-[#F7F5F0] text-[#1C1917] focus:bg-white focus:border-[#2F6FED] focus:outline-hidden transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[#57534E] uppercase tracking-wide block mb-1">
                Текущий баланс (ур.)
              </label>
              <input
                type="number"
                value={lessonsBalance}
                onChange={(e) => setLessonsBalance(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs font-semibold tabular-nums border border-[#E7E2D8] rounded-xl bg-[#F7F5F0] text-[#1C1917] focus:bg-white focus:border-[#2F6FED] focus:outline-hidden transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-[#57534E] uppercase tracking-wide block mb-1">
                Уроков в пакете / мес.
              </label>
              <input
                type="number"
                value={monthlyTarget}
                onChange={(e) => setMonthlyTarget(Number(e.target.value))}
                min={1}
                max={60}
                className="w-full px-3.5 py-2 text-xs font-semibold tabular-nums border border-[#E7E2D8] rounded-xl bg-[#F7F5F0] text-[#1C1917] focus:bg-white focus:border-[#2F6FED] focus:outline-hidden transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[#57534E] uppercase tracking-wide block mb-1">
                День оплаты
              </label>
              <input
                type="text"
                value={billingDay}
                onChange={(e) => setBillingDay(e.target.value)}
                placeholder="10 число"
                className="w-full px-3.5 py-2 text-xs font-semibold border border-[#E7E2D8] rounded-xl bg-[#F7F5F0] text-[#1C1917] focus:bg-white focus:border-[#2F6FED] focus:outline-hidden transition-colors"
              />
            </div>
          </div>

          {/* Contacts */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-[#57534E] uppercase tracking-wide block mb-1">
                Телефон
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998 90 ..."
                className="w-full px-3.5 py-2 text-xs font-semibold border border-[#E7E2D8] rounded-xl bg-[#F7F5F0] text-[#1C1917] placeholder:text-[#8C857B] focus:bg-white focus:border-[#2F6FED] focus:outline-hidden transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-[#57534E] uppercase tracking-wide block mb-1">
                Telegram
              </label>
              <input
                type="text"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="@username"
                className="w-full px-3.5 py-2 text-xs font-semibold border border-[#E7E2D8] rounded-xl bg-[#F7F5F0] text-[#1C1917] placeholder:text-[#8C857B] focus:bg-white focus:border-[#2F6FED] focus:outline-hidden transition-colors"
              />
            </div>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            aria-live="polite"
            className="px-3 py-2 rounded-xl bg-[#FDECE8] border border-[#F6BFA9] text-[#B93815] text-xs font-semibold"
          >
            {errorMsg}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-2 pt-2 border-t border-[#EFECE5]">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-[#E7E2D8] bg-[#F7F5F0] text-[#44403C] font-semibold text-xs hover:bg-[#EFEBE2] disabled:opacity-50 active:scale-95 transition-colors"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSave}
            className="flex-1 py-3 rounded-2xl bg-[#2F6FED] hover:bg-[#255CE0] disabled:opacity-70 text-white font-semibold text-xs shadow-sm flex items-center justify-center gap-1.5 active:scale-95 transition-colors"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Создание...</span>
              </>
            ) : (
              <span>Создать ученика</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
