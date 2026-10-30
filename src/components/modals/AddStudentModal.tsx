'use client';

import React, { useState } from 'react';
import { RecurringSlot } from '@/types';
import { X, UserPlus, Clock } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (student: {
    name: string;
    monthly_target_lessons: number;
    billing_day: string;
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
      phone: phone.trim(),
      telegram: telegram.trim(),
      recurring_schedule,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-3">
      <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center pb-2 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
              <UserPlus className="w-4 h-4" />
            </div>
            <h3 className="text-base font-black text-gray-900">Новый ученик</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">
              Имя ученика *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Сахиб"
              className="w-full px-3 py-2 text-xs font-bold border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">
                Телефон
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+998 90 ..."
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">
                Telegram
              </label>
              <input
                type="text"
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="@username"
                className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">
                Норма уроков в мес.
              </label>
              <input
                type="number"
                value={monthlyTarget}
                onChange={(e) => setMonthlyTarget(Number(e.target.value))}
                min={1}
                max={60}
                className="w-full px-3 py-2 text-xs font-black border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">
                День оплаты
              </label>
              <input
                type="text"
                value={billingDay}
                onChange={(e) => setBillingDay(e.target.value)}
                placeholder="10 число"
                className="w-full px-3 py-2 text-xs font-bold border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          {/* Schedule */}
          <div className="p-3 bg-gray-50 rounded-2xl border border-gray-200/80 space-y-2">
            <span className="text-[11px] font-bold text-gray-700 uppercase block">
              Периодическое расписание
            </span>
            <div className="flex gap-1">
              {WEEKDAYS.map((wd) => {
                const isSelected = selectedDays.includes(wd.id);
                return (
                  <button
                    key={wd.id}
                    type="button"
                    onClick={() => toggleDay(wd.id)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white text-gray-600 border border-gray-200'
                    }`}
                  >
                    {wd.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Clock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="bg-white border border-gray-200 text-xs font-bold rounded-lg px-2 py-1"
              />
              <span className="text-gray-400 text-xs">–</span>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="bg-white border border-gray-200 text-xs font-bold rounded-lg px-2 py-1"
              />
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-semibold"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/20 active:scale-98"
          >
            Создать ученика
          </button>
        </div>
      </div>
    </div>
  );
};
