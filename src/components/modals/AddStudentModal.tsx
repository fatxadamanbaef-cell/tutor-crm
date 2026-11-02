'use client';

import React, { useState } from 'react';
import { RecurringSlot, BillingType } from '@/types';
import { X, UserPlus, Clock } from 'lucide-react';
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

  if (!isOpen) return null;

  const toggleDay = (dayId: number) => {
    hapticImpact('light');
    setSelectedDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId].sort()
    );
  };

  const handleSave = () => {
    if (!name.trim()) {
      alert('Пожалуйста, введите имя ученика');
      return;
    }

    hapticNotification('success');

    const recurring_schedule: RecurringSlot[] = selectedDays.map((dow) => ({
      dayOfWeek: dow,
      startTime,
      endTime,
    }));

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
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-3">
      <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-6 max-h-[90vh] overflow-y-auto border border-slate-200">
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 leading-tight">Новый ученик</h3>
              <p className="text-[11px] font-medium text-slate-500">Заполните данные для CRM</p>
            </div>
          </div>
          <button
            onClick={onClose}
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
                className="w-full px-3.5 py-2.5 text-xs font-semibold border border-slate-300 rounded-xl bg-slate-50 text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-hidden transition-all"
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
                className="w-full px-3.5 py-2.5 text-xs font-semibold border border-slate-300 rounded-xl bg-slate-50 text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-hidden transition-all"
              />
            </div>
          </div>

          {/* Billing Type Selector */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
              Модель биллинга
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
                📦 Пакетная оплата
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
                className="w-full px-3.5 py-2 text-xs font-black border border-slate-300 rounded-xl bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-hidden transition-all"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                Начальный баланс
              </label>
              <input
                type="number"
                value={lessonsBalance}
                onChange={(e) => setLessonsBalance(Number(e.target.value))}
                className="w-full px-3.5 py-2 text-xs font-black border border-slate-300 rounded-xl bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-hidden transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wide block mb-1">
                Норма уроков в мес.
              </label>
              <input
                type="number"
                value={monthlyTarget}
                onChange={(e) => setMonthlyTarget(Number(e.target.value))}
                min={1}
                max={60}
                className="w-full px-3.5 py-2 text-xs font-black border border-slate-300 rounded-xl bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-hidden transition-all"
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
                className="w-full px-3.5 py-2 text-xs font-bold border border-slate-300 rounded-xl bg-slate-50 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-hidden transition-all"
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/90 space-y-2.5">
            <span className="text-[11px] font-black text-slate-700 uppercase tracking-wide block">
              Периодическое расписание
            </span>

            {/* Days Chips */}
            <div className="flex justify-between gap-1">
              {WEEKDAYS.map((wd) => {
                const isSelected = selectedDays.includes(wd.id);
                return (
                  <button
                    key={wd.id}
                    type="button"
                    onClick={() => toggleDay(wd.id)}
                    className={`w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs scale-105'
                        : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {wd.label}
                  </button>
                );
              })}
            </div>

            {/* Time */}
            <div className="flex items-center gap-2 pt-1">
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-black text-slate-900 focus:border-blue-600 focus:outline-hidden"
              />
              <span className="text-slate-400 text-xs font-bold">–</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="bg-white border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs font-black text-slate-900 focus:border-blue-600 focus:outline-hidden"
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
