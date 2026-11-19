'use client';

import React, { useState, useEffect } from 'react';
import { RecurringSlot, BillingType } from '@/types';
import { X, UserPlus, Clock, SlidersHorizontal } from 'lucide-react';
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
  }) => void;
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
  const [perDayTimes, setPerDayTimes] = useState<Record<number, { start: string; end: string }>>({});

  useEffect(() => {
    if (isOpen) {
      setName('');
      setPhone('');
      setTelegram('');
      setMonthlyTarget(12);
      setBillingDay('10');
      setBillingType('date_to_date');
      setLessonRate(300000);
      setLessonsBalance(0);
      setSelectedDays([1, 3, 5]);
      setStartTime('16:00');
      setEndTime('17:30');
      setCustomPerDayTime(false);
      setPerDayTimes({
        1: { start: '16:00', end: '17:30' },
        3: { start: '16:00', end: '17:30' },
        5: { start: '16:00', end: '17:30' },
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

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

  const handleSave = () => {
    if (!name.trim()) {
      alert('Пожалуйста, введите имя ученика');
      return;
    }

    hapticNotification('success');

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

    onSave({
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

    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-3"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      style={{ touchAction: 'none' }}
    >
      <div
        className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-6 max-h-[92vh] overflow-y-auto border border-slate-200"
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: 'pan-y', overscrollBehaviorY: 'contain' } as React.CSSProperties}
      >
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">Новый ученик</h3>
              <p className="text-[11px] font-medium text-slate-500">
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
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
              Имя ученика *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Сахиб"
              className="w-full px-3.5 py-2.5 text-sm font-bold border border-slate-300 rounded-xl bg-slate-50 text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-hidden transition-all"
            />
          </div>

          {/* Schedule Builder (Put right under Name because schedule is the #1 thing a tutor sets) */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-700 uppercase tracking-wide">
                Дни и время уроков
              </span>
              {selectedDays.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    setCustomPerDayTime((prev) => !prev);
                  }}
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-lg inline-flex items-center gap-1 transition-all ${
                    customPerDayTime
                      ? 'bg-blue-600 text-white'
                      : 'text-blue-600 bg-blue-50 hover:bg-blue-100'
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
                    className={`w-9 h-9 rounded-xl font-bold text-xs flex items-center justify-center transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
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
                <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => handleStartTimeChange(e.target.value)}
                  className="flex-1 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold tabular-nums text-slate-900 focus:border-blue-600 focus:outline-hidden"
                />
                <span className="text-slate-400 text-xs font-bold">–</span>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="flex-1 bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-semibold tabular-nums text-slate-900 focus:border-blue-600 focus:outline-hidden"
                />
              </div>
            ) : (
              <div className="space-y-1.5 pt-1">
                {selectedDays.map((dayId) => {
                  const wd = WEEKDAYS.find((w) => w.id === dayId);
                  const slot = perDayTimes[dayId] || { start: startTime, end: endTime };
                  return (
                    <div key={dayId} className="flex items-center gap-2">
                      <span className="w-7 text-xs font-semibold text-slate-700">
                        {wd?.label}:
                      </span>
                      <input
                        type="time"
                        value={slot.start}
                        onChange={(e) => handleDayTimeChange(dayId, 'start', e.target.value)}
                        className="flex-1 bg-white border border-slate-300 rounded-xl px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-900 focus:border-blue-600 focus:outline-hidden"
                      />
                      <span className="text-slate-400 text-xs">–</span>
                      <input
                        type="time"
                        value={slot.end}
                        onChange={(e) => handleDayTimeChange(dayId, 'end', e.target.value)}
                        className="flex-1 bg-white border border-slate-300 rounded-xl px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-900 focus:border-blue-600 focus:outline-hidden"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Billing Type Selector */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
              Модель оплаты
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  setBillingType('date_to_date');
                }}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                  billingType === 'date_to_date'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                📅 По датам месяца
              </button>
              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  setBillingType('package');
                }}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all ${
                  billingType === 'package'
                    ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                    : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                }`}
              >
                📦 Пакетами уроков
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                Ставка за урок (сум)
              </label>
              <input
                type="number"
                value={lessonRate}
                onChange={(e) => setLessonRate(Number(e.target.value))}
                step={10000}
                className="w-full px-3.5 py-2 text-xs font-semibold tabular-nums border border-slate-300 rounded-xl bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-hidden transition-all"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                Текущий баланс (ур.)
              </label>
              <input
                type="number"
                value={lessonsBalance}
                onChange={(e) => setLessonsBalance(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs font-semibold tabular-nums border border-slate-300 rounded-xl bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-hidden transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                Уроков в пакете / мес.
              </label>
              <input
                type="number"
                value={monthlyTarget}
                onChange={(e) => setMonthlyTarget(Number(e.target.value))}
                min={1}
                max={60}
                className="w-full px-3.5 py-2 text-xs font-semibold tabular-nums border border-slate-300 rounded-xl bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-hidden transition-all"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                День оплаты
              </label>
              <input
                type="text"
                value={billingDay}
                onChange={(e) => setBillingDay(e.target.value)}
                placeholder="10 число"
                className="w-full px-3.5 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-slate-50 text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-hidden transition-all"
              />
            </div>
          </div>

          {/* Contacts */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                Телефон
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998 90 ..."
                className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-hidden transition-all"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                Telegram
              </label>
              <input
                type="text"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="@username"
                className="w-full px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-xl bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:outline-hidden transition-all"
              />
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 active:scale-95 transition-all"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-500/20 active:scale-95 transition-all"
          >
            Создать ученика
          </button>
        </div>
      </div>
    </div>
  );
};
