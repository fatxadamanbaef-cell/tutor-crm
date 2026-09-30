'use client';

import React, { useState } from 'react';
import { Student, Lesson } from '@/types';
import { X, UserPlus, Send, Zap, ChevronDown, ChevronUp } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { formatUZS, getTashkentTodayStr } from '@/lib/formatters';
import { generateUUID } from '@/lib/uuid';
import { addDays, getDay, format } from 'date-fns';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    student: {
      name: string;
      price_per_lesson: number;
      prepaid_balance: number;
      phone?: string;
      telegram?: string;
      billing_day?: string;
    },
    generatedLessons?: Lesson[]
  ) => void;
}

const WEEKDAYS = [
  { id: 1, label: 'Пн' },
  { id: 2, label: 'Вт' },
  { id: 3, label: 'Ср' },
  { id: 4, label: 'Чт' },
  { id: 5, label: 'Пт' },
  { id: 6, label: 'Сб' },
  { id: 0, label: 'Вс' },
];

export const AddStudentModal: React.FC<AddStudentModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [telegram, setTelegram] = useState('');
  const [phone, setPhone] = useState('');
  const [pricePerLesson, setPricePerLesson] = useState<number | string>(150000);
  const [initialBalance, setInitialBalance] = useState<number | string>(8);
  const [billingDay, setBillingDay] = useState('');

  // Expanded by default so users see schedule creation
  const [enableSchedule, setEnableSchedule] = useState(true);
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 3, 5]); // Mon, Wed, Fri
  const [startTime, setStartTime] = useState('18:00');
  const [duration, setDuration] = useState(90);
  const [startDateStr, setStartDateStr] = useState(getTashkentTodayStr());

  if (!isOpen) return null;

  const toggleDay = (dayId: number) => {
    hapticImpact('light');
    setSelectedDays((prev) =>
      prev.includes(dayId) ? prev.filter((d) => d !== dayId) : [...prev, dayId]
    );
  };

  const applyPreset = (days: number[]) => {
    hapticImpact('medium');
    setSelectedDays(days);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Введите имя ученика');
      return;
    }

    const studentId = generateUUID();
    const cleanTelegram = telegram.trim()
      ? telegram.trim().startsWith('@')
        ? telegram.trim()
        : `@${telegram.trim()}`
      : '';

    const studentData = {
      id: studentId,
      name: name.trim(),
      price_per_lesson: Number(pricePerLesson),
      prepaid_balance: Number(initialBalance),
      phone: phone.trim(),
      telegram: cleanTelegram,
      billing_day: billingDay,
      color: '#3B82F6', // Default blue for new students (can be changed in profile)
    };

    let generatedLessons: Lesson[] = [];

    if (enableSchedule && selectedDays.length > 0) {
      const [h, m] = startTime.split(':').map(Number);
      const totalMinutes = h * 60 + m + duration;
      const endH = Math.floor(totalMinutes / 60) % 24;
      const endM = totalMinutes % 60;
      const pad = (n: number) => n.toString().padStart(2, '0');
      const timeStr = `${pad(h)}:${pad(m)} - ${pad(endH)}:${pad(endM)}`;

      let curr = new Date(startDateStr);
      let count = 0;
      let safety = 0;
      const targetBalance = Number(initialBalance) || 8;

      while (count < targetBalance && safety < 180) {
        safety++;
        const dayOfWeek = getDay(curr);
        if (selectedDays.includes(dayOfWeek)) {
          const dateFormatted = format(curr, 'yyyy-MM-dd');
          const fullIso = `${dateFormatted}T${startTime}:00+05:00`;

          generatedLessons.push({
            id: generateUUID(),
            student_id: studentId,
            student_name: studentData.name,
            price_per_lesson: studentData.price_per_lesson,
            date: fullIso,
            time_str: timeStr,
            status: 'planned',
            notes: 'Плановый урок',
            created_at: new Date().toISOString(),
          });
          count++;
        }
        curr = addDays(curr, 1);
      }
    }

    onSave(studentData, generatedLessons.length > 0 ? generatedLessons : undefined);
    hapticNotification('success');
    setName('');
    setTelegram('');
    setPhone('');
    setEnableSchedule(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs text-zinc-200 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <h3 className="text-base font-extrabold text-zinc-100 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-teal-400" />
            <span>Новый ученик</span>
          </h3>
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-1 rounded-full text-zinc-400 hover:text-zinc-200 bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {/* Main Info */}
          <div>
            <label className="block text-zinc-400 font-medium mb-1">
              Имя ученика: <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например: Сахиб Рахимов"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 font-bold focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-zinc-400 font-medium mb-1 flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-sky-400" />
              <span>Telegram (@username):</span>
            </label>
            <input
              type="text"
              value={telegram}
              onChange={(e) => setTelegram(e.target.value)}
              placeholder="@username"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sky-300 font-semibold focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">
                Цена за 1 урок (UZS)
              </label>
              <input
                type="number"
                step="5000"
                value={pricePerLesson}
                onChange={(e) => setPricePerLesson(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-emerald-400 font-bold focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-medium mb-1">
                Оплачено уроков
              </label>
              <input
                type="number"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-teal-400 font-bold focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* День оплаты (Text Input) */}
          <div className="space-y-1.5">
            <label className="text-zinc-300 font-bold text-[11px] uppercase tracking-wider">📅 День оплаты / Условие</label>
            <input
              type="text"
              value={billingDay}
              onChange={(e) => setBillingDay(e.target.value)}
              placeholder="Например: 10 число или Каждую субботу"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 font-semibold focus:outline-none focus:border-teal-500"
            />
            <p className="text-[10px] text-zinc-500">Напишите текстом, как вам удобно (сохранится как есть)</p>
          </div>

          {/* Collapsible Auto-Schedule Accordion (Hidden by default) */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => {
                hapticImpact('light');
                setEnableSchedule(!enableSchedule);
              }}
              className="w-full p-3 flex items-center justify-between text-left hover:bg-zinc-950/50"
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enableSchedule}
                  onChange={(e) => setEnableSchedule(e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded text-teal-600 bg-zinc-950 border-zinc-800"
                />
                <span className="font-bold text-zinc-200">Добавить расписание на месяц</span>
              </div>
              {enableSchedule ? (
                <ChevronUp className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              )}
            </button>

            {enableSchedule && (
              <div className="p-3 pt-0 space-y-2.5 border-t border-zinc-800/80 animate-in fade-in duration-150">
                {/* Quick Presets */}
                <div className="grid grid-cols-2 gap-1.5 pt-2">
                  <button
                    type="button"
                    onClick={() => applyPreset([1, 3, 5])}
                    className="py-1 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-medium text-zinc-300"
                  >
                    Пн / Ср / Пт
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset([2, 4])}
                    className="py-1 px-2 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px] font-medium text-zinc-300"
                  >
                    Вт / Чт
                  </button>
                </div>

                {/* Weekdays */}
                <div className="grid grid-cols-7 gap-1">
                  {WEEKDAYS.map((w) => {
                    const isSelected = selectedDays.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => toggleDay(w.id)}
                        className={`py-1.5 rounded-xl text-center font-bold text-xs border transition-all ${
                          isSelected
                            ? 'bg-teal-600 border-teal-500 text-zinc-100'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                        }`}
                      >
                        {w.label}
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-400">С даты:</label>
                    <input
                      type="date"
                      value={startDateStr}
                      onChange={(e) => setStartDateStr(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400">Время начала:</label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1 text-zinc-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] text-zinc-400 block mb-1">Длительность каждого урока:</label>
                  <div className="grid grid-cols-4 gap-1">
                    {[45, 60, 90, 120].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDuration(d)}
                        className={`py-1 rounded-lg text-center font-bold text-[11px] border transition-all ${
                          duration === d
                            ? 'bg-teal-600 border-teal-400 text-zinc-100 shadow-sm'
                            : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-800'
                        }`}
                      >
                        {d} мин
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="w-full bg-teal-600 hover:bg-teal-500 text-zinc-100 font-bold py-3 px-4 rounded-xl shadow-lg active:scale-95 transition-all text-xs"
          >
            + Добавить ученика
          </button>
        </form>
      </div>
    </div>
  );
};


