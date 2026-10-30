'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Student, Lesson, RecurringSlot } from '@/types';
import { X, Check, ChevronLeft, ChevronRight, Calendar, Clock, Edit2, Trash2, Plus, AlertCircle, RotateCcw } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { format, parseISO, addMonths, subMonths, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getTashkentNow } from '@/lib/formatters';
import { getStudentLessonsArchive } from '@/lib/storage';

interface ClientProfileScreenProps {
  student: Student;
  lessons: Lesson[];
  onBack: () => void;
  onDeleteStudent: (studentId: string) => void;
  onUpdateBillingDay?: (studentId: string, day: number) => void;
  onUpdateColor?: (studentId: string, color: string) => void;
  onSaveStudentInfo?: (studentId: string, updates: any) => void;
  onUpdateLessonMissReason?: (lessonId: string, missReason: string) => Promise<void>;
  onOpenLesson?: (lesson: Lesson) => void;
  // Legacy stubs for compatibility
  onAddPayment?: any;
  onToggleCalendarDate?: any;
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

export const ClientProfileScreen: React.FC<ClientProfileScreenProps> = ({
  student,
  lessons,
  onBack,
  onDeleteStudent,
  onSaveStudentInfo,
  onUpdateLessonMissReason,
  onOpenLesson,
}) => {
  const [activeTab, setActiveTab] = useState<'archive' | 'settings'>('archive');
  const [selectedMonth, setSelectedMonth] = useState<Date>(getTashkentNow());

  // Profile fields state
  const [studentName, setStudentName] = useState(student.name);
  const [studentPhone, setStudentPhone] = useState(student.phone || '');
  const [studentTelegram, setStudentTelegram] = useState(student.telegram || '');
  const [monthlyTarget, setMonthlyTarget] = useState<number>(student.monthly_target_lessons || 12);
  const [billingDay, setBillingDay] = useState<string>(String(student.billing_day || '10'));
  const [studentColor, setStudentColor] = useState<string>(student.color || '#3B82F6');
  const [scheduleNotes, setScheduleNotes] = useState<string>(student.schedule_notes || '');
  const [recurringSlots, setRecurringSlots] = useState<RecurringSlot[]>(student.recurring_schedule || []);

  // Inline reason edit modal state
  const [editingReasonLesson, setEditingReasonLesson] = useState<{ id: string; currentReason: string } | null>(null);
  const [reasonInput, setReasonInput] = useState('');

  const PRESET_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#14B8A6',
    '#F97316', '#84CC16', '#0EA5E9', '#A855F7'
  ];

  const [archiveLessons, setArchiveLessons] = useState<Lesson[]>([]);

  useEffect(() => {
    let isMounted = true;
    getStudentLessonsArchive(student.id).then((data) => {
      if (isMounted && data.length > 0) {
        setArchiveLessons(data);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [student.id]);

  const activeLessons = archiveLessons.length > 0 ? archiveLessons : lessons.filter((l) => l.student_id === student.id);

  // Filter lessons for selected student and selected month
  const monthLessons = useMemo(() => {
    const start = startOfMonth(selectedMonth);
    const end = endOfMonth(selectedMonth);

    return activeLessons
      .filter((l) => {
        try {
          const d = parseISO(l.date);
          return isWithinInterval(d, { start, end });
        } catch {
          return false;
        }
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [activeLessons, selectedMonth]);

  const completedCount = monthLessons.filter((l) => l.status === 'completed').length;
  const missedCount = monthLessons.filter((l) => l.status === 'missed' || l.status === 'missed_excused' || l.status === 'missed_penalty').length;
  const makeupsCount = monthLessons.filter((l) => l.is_makeup || l.needs_makeup).length;

  const handlePrevMonth = () => {
    hapticImpact('light');
    setSelectedMonth((prev) => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    hapticImpact('light');
    setSelectedMonth((prev) => addMonths(prev, 1));
  };

  const handleSaveAllSettings = () => {
    hapticNotification('success');
    if (onSaveStudentInfo) {
      onSaveStudentInfo(student.id, {
        name: studentName,
        phone: studentPhone,
        telegram: studentTelegram,
        monthly_target_lessons: Number(monthlyTarget) || 12,
        billing_day: billingDay,
        color: studentColor,
        schedule_notes: scheduleNotes,
        recurring_schedule: recurringSlots,
      });
    }
    onBack();
  };

  const handleAddRecurringSlot = () => {
    hapticImpact('light');
    setRecurringSlots((prev) => [
      ...prev,
      { dayOfWeek: 1, startTime: '16:00', endTime: '17:30' },
    ]);
  };

  const handleRemoveRecurringSlot = (idx: number) => {
    hapticImpact('light');
    setRecurringSlots((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpdateRecurringSlot = (idx: number, updates: Partial<RecurringSlot>) => {
    setRecurringSlots((prev) =>
      prev.map((slot, i) => (i === idx ? { ...slot, ...updates } : slot))
    );
  };

  const handleSaveMissReason = async () => {
    if (!editingReasonLesson) return;
    hapticNotification('success');
    if (onUpdateLessonMissReason) {
      await onUpdateLessonMissReason(editingReasonLesson.id, reasonInput.trim());
    }
    setEditingReasonLesson(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f2f2f7] flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-white border-b border-gray-200">
        <button
          onClick={() => { hapticImpact('light'); onBack(); }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 active:scale-90 transition-transform"
        >
          <X className="w-5 h-5" strokeWidth={2.5} />
        </button>

        <div className="text-center">
          <h2 className="text-base font-black text-gray-900 leading-tight">{studentName}</h2>
          <span className="text-[11px] text-gray-500 font-semibold">
            {activeTab === 'archive' ? 'Архив посещаемости' : 'Настройки ученика'}
          </span>
        </div>

        <button
          onClick={handleSaveAllSettings}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 text-white shadow-md shadow-blue-500/20 active:scale-90 transition-transform"
        >
          <Check className="w-5 h-5" strokeWidth={3} />
        </button>
      </div>

      {/* Tabs Switcher */}
      <div className="flex bg-white px-4 py-2 gap-2 border-b border-gray-200">
        <button
          onClick={() => { hapticImpact('light'); setActiveTab('archive'); }}
          className={`flex-1 text-xs font-bold py-2 rounded-xl transition-all ${
            activeTab === 'archive' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 bg-gray-100'
          }`}
        >
          Архив ученика
        </button>
        <button
          onClick={() => { hapticImpact('light'); setActiveTab('settings'); }}
          className={`flex-1 text-xs font-bold py-2 rounded-xl transition-all ${
            activeTab === 'settings' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 bg-gray-100'
          }`}
        >
          Профиль и расписание
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24">
        {activeTab === 'archive' && (
          <div className="space-y-4">
            {/* Month Selector */}
            <div className="bg-white rounded-2xl p-3 shadow-xs border border-gray-200/80 flex items-center justify-between">
              <button
                onClick={handlePrevMonth}
                className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 active:scale-90"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="text-center">
                <span className="text-sm font-black text-gray-900 capitalize block">
                  {format(selectedMonth, 'LLLL yyyy', { locale: ru })}
                </span>
                <span className="text-[10px] text-gray-400 font-semibold">
                  Всего уроков в этом месяце: {monthLessons.length}
                </span>
              </div>
              <button
                onClick={handleNextMonth}
                className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-700 active:scale-90"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Plate */}
            <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Норма на месяц</span>
                <span className="text-xs font-black text-gray-800 bg-gray-100 px-2.5 py-0.5 rounded-lg">
                  {monthlyTarget} уроков
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-center">
                <div className="bg-green-50/70 p-2.5 rounded-2xl">
                  <span className="text-[10px] font-bold text-green-700 uppercase block">Проведено</span>
                  <span className="text-sm font-black text-green-700 mt-0.5 block">{completedCount} ✅</span>
                </div>
                <div className="bg-red-50/70 p-2.5 rounded-2xl">
                  <span className="text-[10px] font-bold text-red-700 uppercase block">Пропущено</span>
                  <span className="text-sm font-black text-red-700 mt-0.5 block">{missedCount} ❌</span>
                </div>
                <div className="bg-amber-50/70 p-2.5 rounded-2xl">
                  <span className="text-[10px] font-bold text-amber-700 uppercase block">Отработки</span>
                  <span className="text-sm font-black text-amber-700 mt-0.5 block">{makeupsCount} 🔄</span>
                </div>
              </div>
            </div>

            {/* Lessons Chronology */}
            <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80 space-y-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                Хронология уроков ({monthLessons.length})
              </h3>

              {monthLessons.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-xs font-medium">
                  В этом месяце нет уроков
                </div>
              ) : (
                <div className="space-y-2.5">
                  {monthLessons.map((l) => {
                    const isCompleted = l.status === 'completed';
                    const isMissed = l.status === 'missed' || l.status === 'missed_excused' || l.status === 'missed_penalty';
                    const dateParsed = parseISO(l.date);

                    return (
                      <div
                        key={l.id}
                        onClick={() => {
                          if (onOpenLesson) {
                            hapticImpact('light');
                            onOpenLesson(l);
                          }
                        }}
                        className={`p-3 rounded-2xl border transition-all cursor-pointer hover:shadow-xs active:scale-[0.99] ${
                          isCompleted
                            ? 'bg-green-50/30 border-green-200'
                            : isMissed
                            ? 'bg-red-50/30 border-red-200'
                            : 'bg-gray-50/50 border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black text-gray-900">
                              {format(dateParsed, 'd MMMM', { locale: ru })}
                            </span>
                            <span className="text-[11px] font-bold text-gray-400 capitalize">
                              ({format(dateParsed, 'EEEEEE', { locale: ru })})
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {isCompleted && (
                              <span className="text-[11px] font-black text-green-700 bg-green-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                <span>Проведен</span>
                                <span>✅</span>
                              </span>
                            )}
                            {isMissed && (
                              <span className="text-[11px] font-black text-red-700 bg-red-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                                <span>Пропущен</span>
                                <span>❌</span>
                              </span>
                            )}
                            {!isCompleted && !isMissed && (
                              <span className="text-[11px] font-bold text-gray-600 bg-gray-200 px-2 py-0.5 rounded-lg">
                                ⏳ План
                              </span>
                            )}
                            {l.is_makeup && (
                              <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-md">
                                🔄 Отработка
                              </span>
                            )}
                            <span className="text-[11px] text-gray-400 font-bold ml-1 hover:text-gray-700" title="Перенести / изменить">
                              ✏️
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-[11px] text-gray-500 font-semibold mt-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span>{l.time_str || '16:00 - 17:30'}</span>
                        </div>

                        {/* Miss Reason row with inline edit */}
                        {isMissed && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingReasonLesson({ id: l.id, currentReason: l.miss_reason || '' });
                              setReasonInput(l.miss_reason || '');
                            }}
                            className="mt-2 p-2 rounded-xl bg-white border border-red-200/80 text-xs flex items-center justify-between cursor-pointer hover:bg-red-50/50"
                          >
                            <span className="text-red-900 font-medium italic truncate">
                              Причина: <b>{l.miss_reason || 'Нажмите, чтобы указать причину'}</b>
                            </span>
                            <Edit2 className="w-3.5 h-3.5 text-gray-400 shrink-0 ml-2" />
                          </div>
                        )}

                        {l.notes && (
                          <p className="text-[11px] text-gray-500 mt-1 italic">
                            Заметка: {l.notes}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========== НАСТРОЙКИ И РАСПИСАНИЕ ========== */}
        {activeTab === 'settings' && (
          <div className="space-y-4">
            {/* Student Name */}
            <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80">
              <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">
                Имя ученика
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                className="w-full text-base font-bold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
              />
            </div>

            {/* Contacts & Billing Day */}
            <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80 space-y-3">
              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">
                  Телефон
                </label>
                <input
                  type="text"
                  value={studentPhone}
                  onChange={(e) => setStudentPhone(e.target.value)}
                  placeholder="+998 90 123 45 67"
                  className="w-full text-xs font-semibold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">
                  Telegram
                </label>
                <input
                  type="text"
                  value={studentTelegram}
                  onChange={(e) => setStudentTelegram(e.target.value)}
                  placeholder="@username"
                  className="w-full text-xs font-semibold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">
                    Норма уроков в мес.
                  </label>
                  <input
                    type="number"
                    value={monthlyTarget}
                    onChange={(e) => setMonthlyTarget(Number(e.target.value))}
                    min={1}
                    max={60}
                    className="w-full text-xs font-black text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1.5">
                    День оплаты
                  </label>
                  <input
                    type="text"
                    value={billingDay}
                    onChange={(e) => setBillingDay(e.target.value)}
                    placeholder="10 число"
                    className="w-full text-xs font-bold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Color Palette */}
            <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80">
              <label className="text-[11px] font-bold text-gray-400 uppercase block mb-2">
                Цвет карточки
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => {
                      hapticImpact('light');
                      setStudentColor(c);
                    }}
                    className={`w-8 h-8 rounded-full transition-transform active:scale-90 ${
                      studentColor === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Recurring Schedule Editor */}
            <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-gray-900 uppercase">Шаблон расписания</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">Автоматически продлевает уроки на 4 недели</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddRecurringSlot}
                  className="px-2.5 py-1.5 rounded-xl bg-blue-50 text-blue-600 font-bold text-xs flex items-center gap-1 active:scale-95"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить слот</span>
                </button>
              </div>

              {recurringSlots.length === 0 ? (
                <div className="text-center py-5 text-gray-400 text-xs font-medium">
                  Шаблон расписания пока пуст. Добавьте дни недели и время!
                </div>
              ) : (
                <div className="space-y-2">
                  {recurringSlots.map((slot, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-2xl bg-gray-50 border border-gray-200 flex items-center justify-between gap-2"
                    >
                      <select
                        value={slot.dayOfWeek}
                        onChange={(e) => handleUpdateRecurringSlot(idx, { dayOfWeek: Number(e.target.value) })}
                        className="bg-white text-xs font-bold text-gray-900 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-hidden"
                      >
                        {WEEKDAYS.map((wd) => (
                          <option key={wd.id} value={wd.id}>
                            {wd.label}
                          </option>
                        ))}
                      </select>

                      <input
                        type="time"
                        value={slot.startTime}
                        onChange={(e) => handleUpdateRecurringSlot(idx, { startTime: e.target.value })}
                        className="bg-white text-xs font-bold text-gray-900 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-hidden"
                      />

                      <span className="text-gray-400 text-xs">–</span>

                      <input
                        type="time"
                        value={slot.endTime || '17:30'}
                        onChange={(e) => handleUpdateRecurringSlot(idx, { endTime: e.target.value })}
                        className="bg-white text-xs font-bold text-gray-900 border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-hidden"
                      />

                      <button
                        type="button"
                        onClick={() => handleRemoveRecurringSlot(idx)}
                        className="w-7 h-7 rounded-lg bg-red-50 text-red-500 flex items-center justify-center active:scale-90"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Delete Student */}
            <div className="pt-4">
              <button
                type="button"
                onClick={() => {
                  if (confirm(`Вы уверены, что хотите удалить ученика «${student.name}» и всю его историю?`)) {
                    onDeleteStudent(student.id);
                  }
                }}
                className="w-full py-3 rounded-2xl bg-red-50 text-red-600 text-xs font-bold border border-red-200/80 flex items-center justify-center gap-1.5 active:scale-98"
              >
                <Trash2 className="w-4 h-4" />
                <span>Удалить ученика</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal for editing Miss Reason */}
      {editingReasonLesson && (
        <div className="fixed inset-0 z-60 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-3">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-bottom-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-base font-bold text-gray-900">Причина пропуска</h3>
                <p className="text-xs text-gray-500 mt-0.5">Укажите причину для архива ученика</p>
              </div>
              <button
                onClick={() => setEditingReasonLesson(null)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick chips */}
            <div className="flex flex-wrap gap-1.5">
              {['Болеет', 'Семейные обстоятельства', 'Уехал', 'Школьное мероприятие', 'Не вышел на связь'].map(
                (chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setReasonInput(chip)}
                    className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs font-medium text-gray-700 active:scale-95 transition-all"
                  >
                    {chip}
                  </button>
                )
              )}
            </div>

            <textarea
              rows={3}
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="Введите причину пропуска..."
              className="w-full px-3 py-2 text-xs border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-hidden focus:border-blue-500"
            />

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingReasonLesson(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-xs font-semibold"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSaveMissReason}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold shadow-md shadow-blue-500/20"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
