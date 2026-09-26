'use client';

import React, { useState, useRef } from 'react';
import { Student, Lesson, LessonStatus } from '@/types';
import { ChevronLeft, ChevronRight, CreditCard, MessageSquare, Trash2, Check, FileText } from 'lucide-react';
import { formatUZS, getStudentBillingPeriod, getTashkentNow, getTashkentTodayStr } from '@/lib/formatters';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/telegram';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, addMonths, isSameDay } from 'date-fns';
import { toggleStudentCalendarDate } from '@/lib/storage';

interface ClientProfileScreenProps {
  student: Student;
  lessons: Lesson[];
  onBack: () => void;
  onAddPayment: (studentId: string, amountUzs: number, lessonsAdded: number, paymentDate?: string) => void;
  onDeleteStudent: (studentId: string) => void;
  onToggleCalendarDate: (studentId: string, dateStr: string) => void;
  onUpdateBillingDay: (studentId: string, day: number) => void;
  onUpdateColor: (studentId: string, color: string) => void;
}

export const ClientProfileScreen: React.FC<ClientProfileScreenProps> = ({
  student,
  lessons,
  onBack,
  onAddPayment,
  onDeleteStudent,
  onToggleCalendarDate,
  onUpdateBillingDay,
  onUpdateColor
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'payments' | 'lessons'>('info');

  // --- Calendar State ---
  const [monthOffset, setMonthOffset] = useState(0);
  const [localLessons, setLocalLessons] = useState<Lesson[]>(lessons);
  const processingRef = useRef<Record<string, boolean>>({});

  const billingDay = Number(student.billing_day) || 10;
  const totalLimit = student.package_total_lessons || 8;
  const currentPrice = student.price_per_lesson || 150000;

  const period = getStudentBillingPeriod(billingDay, getTashkentNow(), monthOffset);
  const viewedDate = addMonths(getTashkentNow(), monthOffset);
  const monthStart = startOfMonth(viewedDate);
  const monthEnd = endOfMonth(viewedDate);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarGridDays = eachDayOfInterval({ start: startDate, end: endDate });

  const periodLessons = localLessons
    .filter(
      (l) =>
        l.student_id === student.id &&
        l.date.substring(0, 10) >= period.startDate &&
        l.date.substring(0, 10) <= period.endDate
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const completedLessons = periodLessons.filter((l) => l.status === 'completed');
  const remainingCount = student.prepaid_balance;

  const handleDateCellClick = async (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (processingRef.current[dateStr]) return;
    if (dateStr < period.startDate || dateStr > period.endDate) return;

    const existingLesson = periodLessons.find((l) => l.date.substring(0, 10) === dateStr);
    const currentStatus = existingLesson?.status;

    let nextStatus: 'completed' | null = null;
    if (!existingLesson || currentStatus !== 'completed') {
      nextStatus = 'completed';
      hapticNotification('success');
    } else {
      nextStatus = null;
      hapticSelection();
    }

    processingRef.current[dateStr] = true;
    const prevLessons = [...localLessons];

    // Optimistic
    if (nextStatus === null) {
      setLocalLessons((prev) =>
        prev.filter((l) => !(l.student_id === student.id && l.date.substring(0, 10) === dateStr))
      );
    } else if (existingLesson) {
      setLocalLessons((prev) =>
        prev.map((l) =>
          l.student_id === student.id && l.date.substring(0, 10) === dateStr
            ? { ...l, status: nextStatus!, notes: 'Проведенный урок' }
            : l
        )
      );
    } else {
      const optimisticLesson: Lesson = {
        id: 'temp-' + Date.now(),
        student_id: student.id,
        student_name: student.name,
        price_per_lesson: currentPrice,
        date: `${dateStr}T18:00:00+05:00`,
        time_str: '18:00 - 19:30',
        status: nextStatus,
        notes: 'Проведенный урок',
        created_at: new Date().toISOString(),
      };
      setLocalLessons((prev) => [...prev, optimisticLesson]);
    }

    try {
      const result = await toggleStudentCalendarDate(student.id, dateStr);
      if (result.lesson && nextStatus !== null) {
        setLocalLessons((prev) =>
          prev.map((l) =>
            l.student_id === student.id && l.date.substring(0, 10) === dateStr && l.id.startsWith('temp-')
              ? { ...result.lesson!, status: nextStatus! }
              : l
          )
        );
      }
      onToggleCalendarDate(student.id, dateStr);
    } catch (e) {
      console.error('Failed to toggle calendar date:', e);
      setLocalLessons(prevLessons);
    } finally {
      processingRef.current[dateStr] = false;
    }
  };

  const handleCopyReport = async () => {
    hapticImpact('medium');
    let text = `Здравствуйте! 📚 Отчет по занятиям: ${student.name}\n`;
    text += `🗓 Период: ${period.startFormatted} — ${period.endFormatted}\n\n`;
    text += `✅ Проведено уроков: ${completedLessons.length}\n`;
    text += `Остаток абонемента: ${remainingCount >= 0 ? remainingCount : 'Долг ' + Math.abs(remainingCount)} из ${totalLimit}\n\n`;
    
    if (completedLessons.length > 0) {
      text += `📅 Даты занятий:\n`;
      completedLessons.forEach((l) => {
        text += `- ${format(new Date(l.date), 'dd.MM')} (${l.status === 'completed' ? 'Был' : 'Пропуск'})\n`;
      });
    }

    try {
      await navigator.clipboard.writeText(text);
      hapticNotification('success');
      alert('Отчет скопирован!');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col animate-in slide-in-from-right-full duration-300 pb-20">
      {/* Header */}
      <div className="bg-white px-4 py-3 flex items-center border-b border-gray-100 shadow-sm z-10 sticky top-0">
        <button onClick={() => { hapticImpact('light'); onBack(); }} className="p-2 -ml-2 text-blue-500">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="flex-1 text-center font-bold text-lg text-gray-900 truncate px-2">{student.name}</h1>
        <div className="w-10"></div>
      </div>

      {/* Tabs */}
      <div className="bg-white px-4 pt-2 border-b border-gray-100 flex justify-between">
        {(['info', 'payments', 'lessons'] as const).map(tab => {
          const labels = { info: 'Информация', payments: 'Оплаты', lessons: 'Занятия' };
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => { hapticImpact('light'); setActiveTab(tab); }}
              className={`pb-3 px-2 text-sm font-semibold transition-colors border-b-2 ${
                isActive ? 'text-blue-600 border-blue-600' : 'text-gray-400 border-transparent hover:text-gray-600'
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'info' && (
          <div className="space-y-6">
            <div className="flex flex-col items-center pt-4">
              <div 
                className="w-24 h-24 rounded-full flex items-center justify-center text-white font-black text-4xl shadow-md transition-colors"
                style={{ backgroundColor: student.color || '#3B82F6' }}
              >
                {student.name.charAt(0).toUpperCase()}
              </div>
              
              <div className="mt-6 w-full max-w-xs space-y-2">
                <label className="text-xs font-bold text-gray-400 uppercase ml-2">Цвет маркера</label>
                <div className="flex justify-between bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
                  {['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899'].map(c => (
                    <button
                      key={c}
                      onClick={() => onUpdateColor(student.id, c)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        (student.color || '#3B82F6') === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex justify-between items-center">
                <span className="text-sm text-gray-500">Стоимость</span>
                <span className="font-bold text-gray-900">{formatUZS(student.price_per_lesson)}</span>
              </div>
              <div className="px-4 py-3 border-b border-gray-50 flex justify-between items-center">
                <span className="text-sm text-gray-500">День оплаты</span>
                <span className="font-semibold text-gray-900">Каждое {billingDay} число</span>
              </div>
              <div className="px-4 py-3 border-b border-gray-50 flex justify-between items-center">
                <span className="text-sm text-gray-500">Телефон</span>
                <span className="font-semibold text-blue-600">{student.phone || 'Не указан'}</span>
              </div>
            </div>

            <button 
              onClick={() => {
                if (confirm('Точно удалить клиента?')) onDeleteStudent(student.id);
              }}
              className="w-full py-3.5 bg-red-50 text-red-600 font-bold rounded-2xl flex justify-center items-center gap-2 active:bg-red-100 transition-colors"
            >
              <Trash2 className="w-5 h-5" /> Удалить клиента
            </button>
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl p-6 text-white shadow-lg shadow-blue-500/20">
              <div className="text-sm text-blue-100 font-medium mb-1">Остаток средств (уроков)</div>
              <div className="text-4xl font-black">{student.prepaid_balance} <span className="text-xl font-semibold opacity-80">/ {totalLimit}</span></div>
            </div>

            <button
              onClick={() => {
                hapticImpact('medium');
                onAddPayment(student.id, currentPrice * 8, 8, getTashkentTodayStr());
                alert('8 уроков добавлено!');
              }}
              className="w-full py-4 bg-white border border-gray-100 shadow-sm rounded-2xl text-blue-600 font-bold flex justify-center items-center gap-2 active:scale-95 transition-all"
            >
              <CreditCard className="w-5 h-5" /> Добавить оплату (8 уроков)
            </button>
          </div>
        )}

        {activeTab === 'lessons' && (
          <div className="space-y-6">
            
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setMonthOffset((prev) => prev - 1)} className="p-2 bg-gray-50 rounded-xl text-gray-600">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="text-center">
                  <span className="text-[10px] uppercase font-bold text-gray-400 block tracking-wider">Расчетный период</span>
                  <span className="font-extrabold text-sm text-gray-900">{period.startFormatted} — {period.endFormatted}</span>
                </div>
                <button onClick={() => setMonthOffset((prev) => prev + 1)} className="p-2 bg-gray-50 rounded-xl text-gray-600">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold text-gray-400 uppercase mb-2">
                <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span className="text-red-400">Вс</span>
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {calendarGridDays.map((day) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isInsidePeriod = dateStr >= period.startDate && dateStr <= period.endDate;
                  const lesson = isInsidePeriod ? periodLessons.find((l) => l.date.substring(0, 10) === dateStr) : undefined;
                  const isCompleted = lesson?.status === 'completed';
                  const isToday = isSameDay(day, getTashkentNow());

                  let cellClass = 'h-12 rounded-2xl flex flex-col items-center justify-center font-bold text-sm transition-all border ';
                  if (!isInsidePeriod) {
                    cellClass += 'bg-gray-50/50 text-gray-300 border-transparent opacity-50 cursor-default';
                  } else if (isCompleted) {
                    cellClass += 'bg-blue-500 text-white border-blue-400 shadow-md shadow-blue-500/30';
                  } else if (isToday) {
                    cellClass += 'bg-white text-blue-500 border-blue-500 ring-1 ring-blue-500/20';
                  } else {
                    cellClass += 'bg-gray-50 text-gray-700 border-gray-100 hover:border-gray-300';
                  }

                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => isInsidePeriod ? handleDateCellClick(day) : undefined}
                      disabled={!isInsidePeriod}
                      className={cellClass}
                    >
                      {day.getDate()}
                      {isCompleted && <div className="w-1 h-1 rounded-full bg-white mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 flex justify-between items-center">
              <div>
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Проведено</span>
                <span className="text-lg font-black text-gray-900">{completedLessons.length}</span>
              </div>
              <div className="w-px h-8 bg-gray-100"></div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">{remainingCount >= 0 ? 'Осталось' : 'Долг'}</span>
                <span className={`text-lg font-black ${remainingCount >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                  {Math.abs(remainingCount)} из {totalLimit}
                </span>
              </div>
            </div>

            <button
              onClick={handleCopyReport}
              className="w-full flex items-center justify-center p-4 rounded-2xl bg-blue-50 text-blue-600 font-bold active:bg-blue-100 transition-colors"
            >
              <FileText className="w-5 h-5 mr-2" /> Скопировать отчет
            </button>

          </div>
        )}
      </div>
    </div>
  );
};
