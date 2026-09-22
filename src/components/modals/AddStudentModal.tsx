'use client';

import React, { useState, useEffect } from 'react';
import { Student, PaymentType, Lesson } from '@/types';
import {
  X,
  UserPlus,
  Phone,
  Send,
  Calendar,
  Clock,
  Sparkles,
  Check,
} from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { generateRecurringLessons } from '@/lib/scheduleGenerator';
import { formatCurrency } from '@/lib/formatters';
import { format } from 'date-fns';
import confetti from 'canvas-confetti';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentToEdit?: Student | null;
  onSave: (
    student: Partial<Student> & { name: string },
    generatedLessons?: Lesson[]
  ) => void;
}

const COLOR_OPTIONS = [
  '#3B82F6', // Blue
  '#10B981', // Emerald
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F59E0B', // Amber
  '#06B6D4', // Cyan
];

const DAYS_MAP = [
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
  studentToEdit,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [pricePerLesson, setPricePerLesson] = useState(150000);
  const [paymentType, setPaymentType] = useState<PaymentType>('package');
  const [packageTotal, setPackageTotal] = useState(8);
  const [packageRemaining, setPackageRemaining] = useState(8);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [notes, setNotes] = useState('');

  // Schedule settings inside student modal
  const [includeSchedule, setIncludeSchedule] = useState(true);
  const [selectedDays, setSelectedDays] = useState<number[]>([2, 4]); // Default 2 days/week: Tue, Thu
  const [startTime, setStartTime] = useState('19:00');
  const [duration, setDuration] = useState(90); // 90 mins
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (studentToEdit) {
      setName(studentToEdit.name);
      setPhone(studentToEdit.phone || '');
      setTelegram(studentToEdit.telegram || '');
      setPricePerLesson(studentToEdit.price_per_lesson);
      setPaymentType(studentToEdit.payment_type);
      setPackageTotal(studentToEdit.package_total_lessons || 8);
      setPackageRemaining(studentToEdit.package_remaining_lessons ?? studentToEdit.package_total_lessons ?? 8);
      setColor(studentToEdit.color || COLOR_OPTIONS[0]);
      setNotes(studentToEdit.notes || '');
      setIncludeSchedule(false); // Don't regenerate schedule by default on edit unless requested
    } else {
      setName('');
      setPhone('');
      setTelegram('');
      setPricePerLesson(150000);
      setPaymentType('package');
      setPackageTotal(8);
      setPackageRemaining(8); // When new: always 100% remaining (0 completed)
      setColor(COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)]);
      setNotes('');
      setIncludeSchedule(true);
      setSelectedDays([2, 4]); // 2 times a week
      setStartTime('19:00');
      setDuration(90);
      setStartDate(format(new Date(), 'yyyy-MM-dd'));
    }
  }, [studentToEdit, isOpen]);

  if (!isOpen) return null;

  const toggleDay = (dayId: number) => {
    hapticImpact('light');
    if (selectedDays.includes(dayId)) {
      if (selectedDays.length > 1) {
        setSelectedDays(selectedDays.filter((d) => d !== dayId));
      }
    } else {
      setSelectedDays([...selectedDays, dayId]);
    }
  };

  const applyFrequencyPreset = (preset: '2_tue_thu' | '2_mon_thu' | '3_odd' | '3_even') => {
    hapticImpact('medium');
    if (preset === '2_tue_thu') setSelectedDays([2, 4]); // Вт, Чт
    if (preset === '2_mon_thu') setSelectedDays([1, 4]); // Пн, Чт
    if (preset === '3_odd') setSelectedDays([1, 3, 5]); // Пн, Ср, Пт
    if (preset === '3_even') setSelectedDays([2, 4, 6]); // Вт, Чт, Сб
  };

  const handleTotalChange = (val: number) => {
    setPackageTotal(val);
    if (!studentToEdit) {
      setPackageRemaining(val); // Always keep in sync for new student!
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Пожалуйста, введите имя ученика');
      return;
    }

    const studentId = studentToEdit?.id || `s_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    const studentData: Student = {
      id: studentId,
      name: name.trim(),
      phone: phone.trim(),
      telegram: telegram.trim().startsWith('@') || !telegram.trim() ? telegram.trim() : `@${telegram.trim()}`,
      price_per_lesson: Number(pricePerLesson),
      payment_type: paymentType,
      package_total_lessons: Number(packageTotal),
      package_remaining_lessons: studentToEdit ? Number(packageRemaining) : Number(packageTotal),
      color,
      notes: notes.trim(),
      is_active: true,
      created_at: studentToEdit?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let generatedLessons: Lesson[] | undefined;
    if (includeSchedule && selectedDays.length > 0) {
      generatedLessons = generateRecurringLessons({
        student_id: studentId,
        student_name: studentData.name,
        student_color: studentData.color,
        student_payment_type: studentData.payment_type,
        selected_days: selectedDays,
        start_time: startTime,
        duration_minutes: duration,
        price: studentData.price_per_lesson,
        start_date: startDate,
        total_lessons: Number(packageTotal) || 8,
        notes: `Регулярный урок`,
      });
    }

    onSave(studentData, generatedLessons);

    confetti({
      particleCount: 70,
      spread: 80,
      origin: { y: 0.6 },
    });

    hapticNotification('success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-400" />
            <span>{studentToEdit ? 'Редактировать ученика' : 'Новый ученик'}</span>
          </h3>
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-1 rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* SECTION 1: Personal Info */}
          <div className="space-y-3">
            <div>
              <label className="block text-slate-300 mb-1 font-semibold">
                Имя и Фамилия ученика <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Мадина, Сахиб"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 text-sm font-semibold focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">
                  Telegram (@username)
                </label>
                <input
                  type="text"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  placeholder="@username"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">
                  Телефон
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+998 90 000 00 00"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 2: Price and Payment Model */}
          <div className="p-3 bg-slate-950/70 rounded-2xl border border-slate-800/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200">Оплата и стоимость</span>
              <span className="text-[11px] text-slate-400">(в узбекских сум)</span>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                Стоимость 1 урока (сум)
              </label>
              <input
                type="number"
                step="5000"
                value={pricePerLesson}
                onChange={(e) => setPricePerLesson(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 text-sm font-bold focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1.5 font-medium">
                Формат оплаты
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentType('package')}
                  className={`py-2 px-2.5 rounded-xl border font-bold text-xs transition-all ${
                    paymentType === 'package'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                >
                  📦 Абонемент (пакет)
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentType('per_lesson')}
                  className={`py-2 px-2.5 rounded-xl border font-bold text-xs transition-all ${
                    paymentType === 'per_lesson'
                      ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}
                >
                  💵 Поурочно (разово)
                </button>
              </div>
            </div>

            {paymentType === 'package' && (
              <div>
                <label className="block text-slate-400 mb-1.5 font-medium">
                  Количество уроков в абонементе
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[6, 8, 10, 12].map((cnt) => (
                    <button
                      key={cnt}
                      type="button"
                      onClick={() => handleTotalChange(cnt)}
                      className={`py-2 rounded-xl border font-bold text-xs transition-all ${
                        packageTotal === cnt
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                          : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      {cnt} ур.
                    </button>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                  <span>Общая стоимость абонемента:</span>
                  <span className="font-bold text-emerald-400 text-xs">
                    {formatCurrency(pricePerLesson * packageTotal)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: Integrated Schedule (Directly inside student creation) */}
          <div className="p-3.5 bg-gradient-to-br from-indigo-950/30 to-blue-950/20 rounded-2xl border border-indigo-800/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                <span className="font-bold text-slate-200">
                  Расписание занятий
                </span>
              </div>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeSchedule}
                  onChange={(e) => setIncludeSchedule(e.target.checked)}
                  className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="text-[11px] font-semibold text-indigo-300">
                  Создать расписание
                </span>
              </label>
            </div>

            {includeSchedule && (
              <div className="space-y-3 pt-1">
                {/* Frequency Quick Presets */}
                <div>
                  <label className="block text-slate-400 mb-1.5 font-medium">
                    Частота занятий в неделю:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyFrequencyPreset('2_tue_thu')}
                      className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold transition-all text-left ${
                        selectedDays.includes(2) && selectedDays.includes(4) && selectedDays.length === 2
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      2 раза: Вт / Чт
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFrequencyPreset('2_mon_thu')}
                      className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold transition-all text-left ${
                        selectedDays.includes(1) && selectedDays.includes(4) && selectedDays.length === 2
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      2 раза: Пн / Чт
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFrequencyPreset('3_odd')}
                      className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold transition-all text-left ${
                        selectedDays.includes(1) && selectedDays.includes(3) && selectedDays.includes(5) && selectedDays.length === 3
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      3 раза: Пн / Ср / Пт
                    </button>
                    <button
                      type="button"
                      onClick={() => applyFrequencyPreset('3_even')}
                      className={`py-1.5 px-2 rounded-xl border text-[11px] font-bold transition-all text-left ${
                        selectedDays.includes(2) && selectedDays.includes(4) && selectedDays.includes(6) && selectedDays.length === 3
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                          : 'bg-slate-950 text-slate-400 border-slate-800'
                      }`}
                    >
                      3 раза: Вт / Чт / Сб
                    </button>
                  </div>
                </div>

                {/* Day pills */}
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">
                    Выбранные дни:
                  </label>
                  <div className="grid grid-cols-7 gap-1">
                    {DAYS_MAP.map((day) => {
                      const isSelected = selectedDays.includes(day.id);
                      return (
                        <button
                          key={day.id}
                          type="button"
                          onClick={() => toggleDay(day.id)}
                          className={`py-2 rounded-xl border font-bold text-xs transition-all ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                              : 'bg-slate-950 text-slate-400 border-slate-800'
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Time & Duration */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">
                      Время урока
                    </label>
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-bold focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">
                      Длительность
                    </label>
                    <select
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value={45}>45 минут</option>
                      <option value={60}>60 минут (1 час)</option>
                      <option value={90}>90 минут (1.5 часа)</option>
                      <option value={120}>120 минут (2 часа)</option>
                    </select>
                  </div>
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-slate-400 mb-1 font-medium">
                    Начать уроки с даты:
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Color Tag */}
          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">
              Цвет карточки ученика
            </label>
            <div className="flex items-center gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    color === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-slate-900' : 'opacity-70'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">
              Заметки (класс, цели, особенности)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Подготовка к экзаменам, 9 класс..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-blue-600/30 transition-all active:scale-95 text-sm"
            >
              {studentToEdit ? 'Сохранить изменения' : 'Создать ученика и расписание'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
