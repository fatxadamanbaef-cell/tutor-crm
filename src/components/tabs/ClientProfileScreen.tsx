'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Student, Lesson, RecurringSlot, BillingType, BillingCalculation, LessonStatus } from '@/types';
import { X, Check, Calendar, Clock, Edit2, Trash2, Plus, AlertCircle, RotateCcw, Wallet, ChevronDown, ChevronUp, Package, Sparkles, Loader2 } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getTashkentNow, getTashkentTodayStr, getTashkentDateString } from '@/lib/formatters';
import {
  getStudentHorizonLessons,
  getUnmarkedPastLessons,
  initializePackageFromPastDate,
  topUpStudentBalance,
  calculateStudentBilling,
  setLessonStatusDirect,
} from '@/lib/storage';

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
  const [isSaving, setIsSaving] = useState(false);

  // Profile fields state
  const [studentName, setStudentName] = useState(student.name);
  const [studentPhone, setStudentPhone] = useState(student.phone || '');
  const [studentTelegram, setStudentTelegram] = useState(student.telegram || '');
  const [monthlyTarget, setMonthlyTarget] = useState<number>(student.monthly_target_lessons || 12);
  const [billingDay, setBillingDay] = useState<string>(String(student.billing_day || '10'));
  const [billingType, setBillingType] = useState<BillingType>(student.billing_type || 'date_to_date');
  const [lessonRate, setLessonRate] = useState<number>(student.lesson_rate || 300000);
  const [lessonsBalance, setLessonsBalance] = useState<number>(student.lessons_balance ?? 0);
  const [studentColor, setStudentColor] = useState<string>(student.color || '#3B82F6');
  const [scheduleNotes, setScheduleNotes] = useState<string>(student.schedule_notes || '');
  const [recurringSlots, setRecurringSlots] = useState<RecurringSlot[]>(student.recurring_schedule || []);
  const [billingCalc, setBillingCalc] = useState<BillingCalculation | null>(null);

  // Horizon & Timeline state (7 / 14 / 30 / 60 days)
  const [daysHorizon, setDaysHorizon] = useState<7 | 14 | 30 | 60>(30);
  const [directionFilter, setDirectionFilter] = useState<'all' | 'past' | 'upcoming'>('all');
  const [horizonLessons, setHorizonLessons] = useState<Lesson[]>([]);
  const [isLoadingHorizon, setIsLoadingHorizon] = useState<boolean>(false);

  // Unmarked past lessons state
  const [unmarkedLessons, setUnmarkedLessons] = useState<Lesson[]>([]);

  // Retroactive package wizard state
  const [isRetroWizardOpen, setIsRetroWizardOpen] = useState<boolean>(false);
  const [retroStartDate, setRetroStartDate] = useState<string>(() => {
    const now = getTashkentNow();
    const curY = now.getFullYear();
    const curM = now.getMonth();
    const curD = now.getDate();
    const bMatch = String(student.billing_day || '10').match(/\d+/);
    const bNum = bMatch ? Math.min(31, Math.max(1, parseInt(bMatch[0], 10))) : 10;
    let y = curY;
    let m = curM;
    if (curD < bNum) {
      m -= 1;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
    }
    const d = new Date(Date.UTC(y, m, bNum));
    return d.toISOString().substring(0, 10);
  });
  const [retroPackageCount, setRetroPackageCount] = useState<number>(student.monthly_target_lessons || 12);
  const [retroExcludedDates, setRetroExcludedDates] = useState<string[]>([]);
  const [isApplyingRetro, setIsApplyingRetro] = useState<boolean>(false);

  // Inline reason edit modal state
  const [editingReasonLesson, setEditingReasonLesson] = useState<{ id: string; currentReason: string } | null>(null);
  const [reasonInput, setReasonInput] = useState('');

  const PRESET_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
    '#8B5CF6', '#EC4899', '#06B6D4', '#14B8A6',
    '#F97316', '#84CC16', '#0EA5E9', '#A855F7',
  ];

  const todayStr = getTashkentTodayStr();

  // Load horizon lessons and unmarked past lessons
  useEffect(() => {
    let isMounted = true;
    setIsLoadingHorizon(true);
    Promise.all([
      getUnmarkedPastLessons(student.id),
      getStudentHorizonLessons(student.id, daysHorizon),
    ])
      .then(([unmarked, horizon]) => {
        if (isMounted) {
          setUnmarkedLessons(unmarked);
          setHorizonLessons(horizon);
          setIsLoadingHorizon(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load student horizon lessons:', err);
        if (isMounted) setIsLoadingHorizon(false);
      });

    return () => {
      isMounted = false;
    };
  }, [student.id, daysHorizon]);

  // Load billing calculation
  useEffect(() => {
    let isMounted = true;
    calculateStudentBilling(student.id)
      .then((calc) => {
        if (isMounted) setBillingCalc(calc);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [student.id, billingType, lessonRate, lessonsBalance, recurringSlots]);

  const refreshAllLessons = async () => {
    const [unmarked, horizon] = await Promise.all([
      getUnmarkedPastLessons(student.id),
      getStudentHorizonLessons(student.id, daysHorizon),
    ]);
    setUnmarkedLessons(unmarked);
    setHorizonLessons(horizon);
  };

  const handleAdjustBalance = async (delta: number) => {
    hapticNotification('success');
    try {
      const newBal = await topUpStudentBalance(student.id, delta);
      setLessonsBalance(newBal);
      calculateStudentBilling(student.id).then(setBillingCalc).catch(() => {});
    } catch {
      setLessonsBalance((prev) => prev + delta);
    }
  };

  // 1-Tap Quick Status Switching with Idempotent Balance Updates
  const handleQuickLessonStatus = async (lessonId: string, targetStatus: LessonStatus) => {
    hapticImpact('medium');

    const currentLesson =
      horizonLessons.find((l) => l.id === lessonId) ||
      unmarkedLessons.find((l) => l.id === lessonId);

    if (!currentLesson || currentLesson.status === targetStatus) return;

    const isDeducted = (s: string) => s === 'completed' || s === 'missed_penalty' || s === 'missed';
    const prevDeducted = isDeducted(currentLesson.status);
    const nextDeducted = isDeducted(targetStatus);

    let delta = 0;
    if (!prevDeducted && nextDeducted) delta = -1;
    else if (prevDeducted && !nextDeducted) delta = 1;

    // Optimistic UI updates
    setLessonsBalance((prev) => prev + delta);
    setHorizonLessons((prev) =>
      prev.map((l) => (l.id === lessonId ? { ...l, status: targetStatus } : l))
    );
    setUnmarkedLessons((prev) =>
      prev.filter((l) => !(l.id === lessonId && targetStatus !== 'planned'))
    );

    try {
      const res = await setLessonStatusDirect(lessonId, targetStatus);
      if (typeof res.newBalance === 'number') {
        setLessonsBalance(res.newBalance);
      }
      calculateStudentBilling(student.id).then(setBillingCalc).catch(() => {});
    } catch (err) {
      console.error('Failed to update lesson status directly:', err);
      await refreshAllLessons();
    }
  };

  // Bulk mark all unmarked past lessons as completed
  const handleMarkAllPastAsCompleted = async () => {
    if (unmarkedLessons.length === 0) return;
    hapticNotification('success');

    const countToDeduct = unmarkedLessons.length;
    const lessonIds = unmarkedLessons.map((l) => l.id);

    // Optimistic updates
    setUnmarkedLessons([]);
    setLessonsBalance((prev) => prev - countToDeduct);
    setHorizonLessons((prev) =>
      prev.map((l) => (lessonIds.includes(l.id) ? { ...l, status: 'completed' as LessonStatus } : l))
    );

    for (const id of lessonIds) {
      await setLessonStatusDirect(id, 'completed').catch((e) => console.error(e));
    }

    calculateStudentBilling(student.id).then(setBillingCalc).catch(() => {});
    refreshAllLessons();
  };

  // Retroactive package preview slots
  const retroSlotsPreview = useMemo(() => {
    if (!retroStartDate || retroStartDate > todayStr) return [];

    const slots = recurringSlots.length > 0 ? recurringSlots : (student.recurring_schedule || []);
    if (slots.length === 0) return [];

    const normalizedSlots = slots.map((s) => ({
      dayOfWeek: Number(s.dayOfWeek),
      start: (s.startTime || '16:00').substring(0, 5),
      end: (s.endTime || '17:30').substring(0, 5),
    }));

    const items: Array<{ date: string; dow: number; timeStr: string }> = [];
    let cur = retroStartDate;

    while (cur <= todayStr) {
      const d = new Date(`${cur}T12:00:00+05:00`);
      const dayRaw = d.getDay();
      const dow = dayRaw === 0 ? 7 : dayRaw;
      const matching = normalizedSlots.filter((s) => s.dayOfWeek === dow);

      for (const m of matching) {
        items.push({
          date: cur,
          dow,
          timeStr: `${m.start} - ${m.end}`,
        });
      }

      d.setDate(d.getDate() + 1);
      cur = getTashkentDateString(d);
    }

    return items;
  }, [retroStartDate, recurringSlots, student.recurring_schedule, todayStr]);

  const toggleExcludeDate = (d: string) => {
    hapticImpact('light');
    setRetroExcludedDates((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  const retroCompletedCount = Math.max(
    0,
    retroSlotsPreview.filter((s) => !retroExcludedDates.includes(s.date)).length
  );
  const retroRemainingBalance = retroPackageCount - retroCompletedCount;

  const handleApplyRetroPackage = async () => {
    setIsApplyingRetro(true);
    hapticNotification('success');
    try {
      const { finalBalance } = await initializePackageFromPastDate(
        student.id,
        retroStartDate,
        retroPackageCount,
        retroExcludedDates
      );
      setLessonsBalance(finalBalance);
      setBillingType('package');
      setMonthlyTarget(retroPackageCount);
      setIsRetroWizardOpen(false);
      await refreshAllLessons();
      calculateStudentBilling(student.id).then(setBillingCalc).catch(() => {});
    } catch (e: any) {
      alert(e?.message || 'Ошибка применения пакета с прошлой даты');
    } finally {
      setIsApplyingRetro(false);
    }
  };

  // Filter lessons for timeline
  const timelineLessons = useMemo(() => {
    return horizonLessons.filter((l) => {
      const lDate = l.date.substring(0, 10);
      if (directionFilter === 'past') return lDate < todayStr;
      if (directionFilter === 'upcoming') return lDate >= todayStr;
      return true;
    });
  }, [horizonLessons, directionFilter, todayStr]);

  // Horizon summary counts
  const horizonStats = useMemo(() => {
    let completed = 0;
    let penalty = 0;
    let excused = 0;
    let planned = 0;

    timelineLessons.forEach((l) => {
      if (l.status === 'completed') completed++;
      else if (l.status === 'missed_penalty') penalty++;
      else if (l.status === 'missed_excused') excused++;
      else if (l.status === 'missed') {
        if (l.needs_makeup) excused++;
        else penalty++;
      } else {
        planned++;
      }
    });

    return { completed, penalty, excused, planned };
  }, [timelineLessons]);

  // Group lessons into Past, Today, and Upcoming
  const pastTimelineLessons = useMemo(
    () => timelineLessons.filter((l) => l.date.substring(0, 10) < todayStr),
    [timelineLessons, todayStr]
  );
  const todayTimelineLessons = useMemo(
    () => timelineLessons.filter((l) => l.date.substring(0, 10) === todayStr),
    [timelineLessons, todayStr]
  );
  const upcomingTimelineLessons = useMemo(
    () => timelineLessons.filter((l) => l.date.substring(0, 10) > todayStr),
    [timelineLessons, todayStr]
  );

  const handleSaveAllSettings = async () => {
    if (isSaving) return;
    if (!studentName.trim()) {
      alert('Пожалуйста, введите имя ученика');
      return;
    }

    setIsSaving(true);
    hapticImpact('medium');

    try {
      if (onSaveStudentInfo) {
        await onSaveStudentInfo(student.id, {
          name: studentName.trim(),
          phone: studentPhone.trim(),
          telegram: studentTelegram.trim(),
          monthly_target_lessons: Number(monthlyTarget) || 12,
          billing_day: billingDay.trim(),
          billing_type: billingType,
          lesson_rate: Number(lessonRate) || 300000,
          lessons_balance: Number(lessonsBalance) || 0,
          color: studentColor,
          schedule_notes: scheduleNotes,
          recurring_schedule: recurringSlots,
        });
      }
      hapticNotification('success');
      onBack();
    } catch (e: any) {
      console.error('Save settings error:', e);
      hapticNotification('error');
    } finally {
      setIsSaving(false);
    }
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
    setHorizonLessons((prev) =>
      prev.map((l) => (l.id === editingReasonLesson.id ? { ...l, miss_reason: reasonInput.trim() } : l))
    );
    setEditingReasonLesson(null);
  };

  // Helper to render a single lesson card in the timeline
  const renderLessonCard = (l: Lesson) => {
    const isCompleted = l.status === 'completed';
    const isPenalty = l.status === 'missed_penalty' || (l.status === 'missed' && !l.needs_makeup);
    const isExcused = l.status === 'missed_excused' || (l.status === 'missed' && l.needs_makeup);
    const isPlanned = !isCompleted && !isPenalty && !isExcused;
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
        className={`p-3 rounded-2xl border transition-all cursor-pointer hover:shadow-xs active:scale-[0.99] space-y-2.5 ${
          isCompleted
            ? 'bg-emerald-50/40 border-emerald-200'
            : isPenalty
            ? 'bg-orange-50/40 border-orange-200'
            : isExcused
            ? 'bg-red-50/40 border-red-200'
            : 'bg-white border-gray-200/80 shadow-xs'
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
            <div className="flex items-center gap-1 font-mono text-[11px] text-gray-600 font-bold ml-1">
              <Clock className="w-3 h-3 text-gray-400" />
              <span>{l.time_str || '16:00 - 17:30'}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isCompleted && (
              <span className="text-[10px] font-black text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-md">
                Был ✅
              </span>
            )}
            {isPenalty && (
              <span className="text-[10px] font-black text-orange-700 bg-orange-100/90 px-2 py-0.5 rounded-md">
                Сгорел 🔥 (-1)
              </span>
            )}
            {isExcused && (
              <span className="text-[10px] font-black text-red-700 bg-red-100/90 px-2 py-0.5 rounded-md">
                Отмена 🛑 (0)
              </span>
            )}
            {isPlanned && (
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                ⏳ План
              </span>
            )}
          </div>
        </div>

        {/* Notes and Miss Reason */}
        {(l.miss_reason || l.notes) && (
          <div className="flex items-center justify-between text-[11px] text-gray-500 font-medium">
            {l.miss_reason ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingReasonLesson({ id: l.id, currentReason: l.miss_reason || '' });
                  setReasonInput(l.miss_reason || '');
                }}
                className="text-[11px] font-semibold text-rose-600 hover:underline flex items-center gap-1"
              >
                <span>{l.miss_reason}</span>
                <Edit2 className="w-2.5 h-2.5" />
              </button>
            ) : (
              <span />
            )}

            {l.notes && (
              <div className="text-[11px] text-gray-400 italic truncate max-w-[200px]">
                📝 {l.notes}
              </div>
            )}
          </div>
        )}

        {/* 1-Tap Quick Attendance Status Switcher */}
        <div
          className="flex items-center gap-1 pt-1 border-t border-gray-100/80"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleQuickLessonStatus(l.id, 'completed')}
            className={`flex-1 py-1 px-1.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 transition-all active:scale-95 ${
              isCompleted
                ? 'bg-emerald-600 text-white shadow-xs font-black'
                : 'bg-gray-100 hover:bg-emerald-50 text-gray-700 hover:text-emerald-700'
            }`}
            title="Был (-1 баланс)"
          >
            <span>✅ Был</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickLessonStatus(l.id, 'missed_penalty')}
            className={`flex-1 py-1 px-1.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 transition-all active:scale-95 ${
              isPenalty
                ? 'bg-orange-500 text-white shadow-xs font-black'
                : 'bg-gray-100 hover:bg-orange-50 text-gray-700 hover:text-orange-700'
            }`}
            title="Сгорел (-1 баланс)"
          >
            <span>🔥 Сгорел</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickLessonStatus(l.id, 'missed_excused')}
            className={`flex-1 py-1 px-1.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 transition-all active:scale-95 ${
              isExcused
                ? 'bg-red-500 text-white shadow-xs font-black'
                : 'bg-gray-100 hover:bg-red-50 text-gray-700 hover:text-red-700'
            }`}
            title="Отмена (сохранить урок)"
          >
            <span>🛑 Отмена</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickLessonStatus(l.id, 'planned')}
            className={`py-1 px-2.5 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1 transition-all active:scale-95 ${
              isPlanned
                ? 'bg-blue-600 text-white shadow-xs font-black'
                : 'bg-gray-100 hover:bg-blue-50 text-gray-700 hover:text-blue-700'
            }`}
            title="Вернуть в план"
          >
            <span>📅 План</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f2f2f7] flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-white border-b border-gray-200">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            hapticImpact('light');
            onBack();
          }}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 active:scale-90 transition-transform"
        >
          <X className="w-5 h-5" strokeWidth={2.5} />
        </button>

        <div className="text-center">
          <h2 className="text-base font-black text-gray-900 leading-tight">{studentName}</h2>
          <span className="text-[11px] text-gray-500 font-semibold">
            {activeTab === 'archive' ? 'Горизонт расписания и биллинг' : 'Настройки ученика'}
          </span>
        </div>

        <button
          type="button"
          disabled={isSaving}
          onClick={handleSaveAllSettings}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-600 disabled:opacity-50 text-white shadow-md shadow-blue-500/20 active:scale-90 transition-transform"
          title="Сохранить настройки"
        >
          {isSaving ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Check className="w-5 h-5" strokeWidth={3} />
          )}
        </button>
      </div>

      {/* Tabs Switcher */}
      <div className="flex bg-white px-4 py-2 gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => {
            hapticImpact('light');
            setActiveTab('archive');
          }}
          className={`flex-1 text-xs font-bold py-2 rounded-xl transition-all ${
            activeTab === 'archive' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 bg-gray-100'
          }`}
        >
          Расписание и баланс
        </button>
        <button
          type="button"
          onClick={() => {
            hapticImpact('light');
            setActiveTab('settings');
          }}
          className={`flex-1 text-xs font-bold py-2 rounded-xl transition-all ${
            activeTab === 'settings' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 bg-gray-100'
          }`}
        >
          Профиль и настройки
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
        {activeTab === 'archive' && (
          <div className="space-y-4">
            {/* Balance & Quick Top-Up Plate */}
            <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide block">
                      Баланс ученика
                    </span>
                    <span className="text-lg font-black text-gray-900 leading-none">
                      {lessonsBalance}{' '}
                      <span className="text-xs text-gray-500 font-bold">ур.</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAdjustBalance(-1)}
                    className="h-8 px-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs flex items-center gap-1 active:scale-95"
                    title="Списать 1 урок"
                  >
                    <span>-1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjustBalance(1)}
                    className="h-8 px-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-1 active:scale-95"
                    title="Добавить 1 урок"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjustBalance(Number(monthlyTarget) || 8)}
                    className="h-8 px-2.5 rounded-xl bg-emerald-600 text-white font-bold text-xs flex items-center gap-1 shadow-xs active:scale-95"
                    title="Оплачен пакет"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[3]" />
                    <span>+{Number(monthlyTarget) || 8}</span>
                  </button>
                </div>
              </div>

              {/* Billing Calculation Box */}
              {billingCalc && (
                <div className="p-3 rounded-2xl bg-gray-50 border border-gray-200/80 text-xs space-y-1.5">
                  <div className="flex items-center justify-between font-bold text-gray-700">
                    <span>
                      {billingCalc.billingType === 'package' ? '📦 Пакетный биллинг' : '📅 Биллинг по датам'}
                    </span>
                    <span className="text-blue-600 font-black">
                      {lessonRate.toLocaleString('ru-RU')} сум/ур.
                    </span>
                  </div>

                  {billingCalc.billingType === 'date_to_date' ? (
                    <div className="text-[11px] text-gray-600 space-y-0.5">
                      <div className="flex justify-between">
                        <span>
                          Период ({billingCalc.startDate?.split('-').slice(1).join('.')} –{' '}
                          {billingCalc.endDate?.split('-').slice(1).join('.')}):
                        </span>
                        <span className="font-bold">{billingCalc.scheduledLessonsCount} ур. по графику</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-gray-200 font-black text-gray-900 text-xs">
                        <span>К оплате за период:</span>
                        <span className="text-emerald-700 font-black">
                          {billingCalc.lessonsToPay} ур. = {billingCalc.netAmount?.toLocaleString('ru-RU')} сум
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-600 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Стоимость пакета ({billingCalc.packageSize} ур.):</span>
                        <span className="font-bold text-emerald-700 text-xs font-black">
                          {billingCalc.packageAmount?.toLocaleString('ru-RU')} сум
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Quick Retroactive Package Button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    setIsRetroWizardOpen((prev) => !prev);
                  }}
                  className="w-full py-2 px-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200/80 flex items-center justify-between transition-all active:scale-98"
                >
                  <div className="flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    <span>📦 Открыть пакет с прошлой даты</span>
                  </div>
                  {isRetroWizardOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* PART B: Retroactive Package Wizard Inline Panel */}
            {isRetroWizardOpen && (
              <div className="bg-white rounded-3xl p-4 shadow-sm border border-indigo-200 space-y-3.5 animate-in fade-in-50 duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-black text-gray-900 uppercase tracking-wide">
                      Мастер открытия пакета с прошлой даты
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRetroWizardOpen(false)}
                    className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[11px] text-gray-500 leading-snug">
                  Заполняет уроки по расписанию с даты открытия пакета до сегодняшнего дня, отмечает проведенные занятия и
                  рассчитывает точный остаток баланса.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                      Дата старта пакета
                    </label>
                    <input
                      type="date"
                      value={retroStartDate}
                      max={todayStr}
                      onChange={(e) => setRetroStartDate(e.target.value)}
                      className="w-full text-xs font-bold text-gray-900 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-200 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                      Уроков в пакете
                    </label>
                    <input
                      type="number"
                      value={retroPackageCount}
                      min={1}
                      max={100}
                      onChange={(e) => setRetroPackageCount(Number(e.target.value))}
                      className="w-full text-xs font-black text-gray-900 bg-gray-50 px-2.5 py-1.5 rounded-xl border border-gray-200 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Slots Preview & Exclude toggles */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-400 uppercase block">
                      Уроки по расписанию в периоде ({retroSlotsPreview.length})
                    </span>
                    <span className="text-[10px] text-gray-400">Нажмите, чтобы исключить пропуск</span>
                  </div>

                  {retroSlotsPreview.length === 0 ? (
                    <div className="text-center py-4 text-xs text-gray-400 bg-gray-50 rounded-2xl">
                      В выбранном диапазоне нет уроков по регулярному расписанию
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1 bg-gray-50 rounded-2xl border border-gray-200/60">
                      {retroSlotsPreview.map((slot, idx) => {
                        const isExcluded = retroExcludedDates.includes(slot.date);
                        const d = parseISO(`${slot.date}T12:00:00+05:00`);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleExcludeDate(slot.date)}
                            className={`px-2 py-1 rounded-xl text-[11px] font-bold border transition-all active:scale-95 ${
                              isExcluded
                                ? 'bg-red-50 border-red-200 text-red-700 line-through opacity-80'
                                : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            }`}
                            title={isExcluded ? 'Пропуск (урок не сгорает)' : 'Был проведен (списать 1)'}
                          >
                            <span>
                              {format(d, 'd MMM, EEE', { locale: ru })}: {isExcluded ? '🛑 Пропуск' : '✅ Был'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Calculation Summary Line */}
                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl text-xs space-y-0.5">
                  <div className="flex justify-between text-gray-700 font-semibold text-[11px]">
                    <span>Будет проведено занятий:</span>
                    <span className="font-bold text-gray-900">{retroCompletedCount} ур.</span>
                  </div>
                  <div className="flex justify-between font-black text-indigo-900 pt-1 border-t border-indigo-200/60">
                    <span>Остаток баланса на сегодня:</span>
                    <span className="text-indigo-700 text-sm">{retroRemainingBalance} ур.</span>
                  </div>
                </div>

                {/* Submit Action */}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setIsRetroWizardOpen(false)}
                    className="flex-1 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-bold"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={isApplyingRetro || retroSlotsPreview.length === 0}
                    onClick={handleApplyRetroPackage}
                    className="flex-2 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black shadow-md shadow-indigo-500/20 active:scale-95 transition-all"
                  >
                    {isApplyingRetro ? 'Применение...' : 'Применить и пересчитать баланс'}
                  </button>
                </div>
              </div>
            )}

            {/* PART A: "⏳ Неотмеченные прошлые уроки (N)" Alert Banner */}
            {unmarkedLessons.length > 0 && (
              <div className="bg-amber-50/90 border border-amber-200 rounded-3xl p-3.5 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-amber-800 font-black text-xs">
                      ⏳ Неотмеченные прошлые уроки ({unmarkedLessons.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleMarkAllPastAsCompleted}
                    className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-xs active:scale-95 transition-all"
                  >
                    ✅ Отметить все ({unmarkedLessons.length})
                  </button>
                </div>

                {/* Horizontal interactive chips list */}
                <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                  {unmarkedLessons.map((l) => {
                    const d = parseISO(l.date);
                    return (
                      <div
                        key={l.id}
                        className="shrink-0 bg-white border border-amber-200 rounded-2xl p-2 shadow-xs space-y-1.5 min-w-[130px]"
                      >
                        <div>
                          <span className="text-[11px] font-black text-gray-900 block">
                            {format(d, 'd MMM, EEE', { locale: ru })}
                          </span>
                          <span className="text-[10px] text-gray-400 font-mono block">
                            {l.time_str || '16:00 - 17:30'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleQuickLessonStatus(l.id, 'completed')}
                            className="flex-1 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-black text-xs text-center active:scale-90"
                            title="Был (-1)"
                          >
                            ✅
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickLessonStatus(l.id, 'missed_penalty')}
                            className="flex-1 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 font-black text-xs text-center active:scale-90"
                            title="Сгорел (-1)"
                          >
                            🔥
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickLessonStatus(l.id, 'missed_excused')}
                            className="flex-1 py-1 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-black text-xs text-center active:scale-90"
                            title="Отмена (0)"
                          >
                            🛑
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PART 4: INTERACTIVE 7 / 14 / 30 / 60-DAY SCHEDULE HORIZON */}
            <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                  Горизонт расписания
                </span>
                <span className="text-[11px] font-bold text-gray-500">
                  Всего: {timelineLessons.length} ур.
                </span>
              </div>

              {/* Horizon Selector (7, 14, 30, 60 days) */}
              <div className="flex bg-gray-100 p-1 rounded-2xl gap-1">
                {([7, 14, 30, 60] as const).map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      hapticImpact('light');
                      setDaysHorizon(h);
                    }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all ${
                      daysHorizon === h
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-gray-500 hover:text-gray-900'
                    }`}
                  >
                    {h} дней
                  </button>
                ))}
              </div>

              {/* Direction Filter (Все, Прошедшие, Будущие) */}
              <div className="flex bg-gray-100 p-1 rounded-2xl gap-1">
                <button
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    setDirectionFilter('all');
                  }}
                  className={`flex-1 py-1 text-[11px] font-bold rounded-xl transition-all ${
                    directionFilter === 'all' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'
                  }`}
                >
                  Все (±{daysHorizon} дн)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    setDirectionFilter('past');
                  }}
                  className={`flex-1 py-1 text-[11px] font-bold rounded-xl transition-all ${
                    directionFilter === 'past' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'
                  }`}
                >
                  Прошедшие (-{daysHorizon} дн)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    setDirectionFilter('upcoming');
                  }}
                  className={`flex-1 py-1 text-[11px] font-bold rounded-xl transition-all ${
                    directionFilter === 'upcoming' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-500'
                  }`}
                >
                  Будущие (+{daysHorizon} дн)
                </button>
              </div>

              {/* Live Summary Bar for Selected Horizon */}
              <div className="grid grid-cols-4 gap-1.5 text-center pt-1 border-t border-gray-100">
                <div className="bg-emerald-50/80 p-2 rounded-2xl border border-emerald-100">
                  <span className="text-[10px] font-bold text-emerald-700 uppercase block">Проведено</span>
                  <span className="text-xs font-black text-emerald-800 mt-0.5 block">
                    {horizonStats.completed} ✅
                  </span>
                </div>
                <div className="bg-orange-50/80 p-2 rounded-2xl border border-orange-100">
                  <span className="text-[10px] font-bold text-orange-700 uppercase block">Сгорело</span>
                  <span className="text-xs font-black text-orange-800 mt-0.5 block">
                    {horizonStats.penalty} 🔥
                  </span>
                </div>
                <div className="bg-red-50/80 p-2 rounded-2xl border border-red-100">
                  <span className="text-[10px] font-bold text-red-700 uppercase block">Отменено</span>
                  <span className="text-xs font-black text-red-800 mt-0.5 block">
                    {horizonStats.excused} 🛑
                  </span>
                </div>
                <div className="bg-blue-50/80 p-2 rounded-2xl border border-blue-100">
                  <span className="text-[10px] font-bold text-blue-700 uppercase block">По плану</span>
                  <span className="text-xs font-black text-blue-800 mt-0.5 block">
                    {horizonStats.planned} 📅
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive Timeline of Lessons */}
            <div className="space-y-3">
              {isLoadingHorizon ? (
                <div className="bg-white rounded-3xl p-8 text-center text-gray-400 text-xs font-medium border border-gray-200/80">
                  Загрузка расписания на {daysHorizon} дней...
                </div>
              ) : timelineLessons.length === 0 ? (
                <div className="bg-white rounded-3xl p-8 text-center text-gray-400 text-xs font-medium border border-gray-200/80">
                  В выбранном периоде ({daysHorizon} дн) нет уроков
                </div>
              ) : (
                <div className="space-y-3">
                  {/* PAST LESSONS */}
                  {directionFilter !== 'upcoming' && pastTimelineLessons.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                          Прошедшие занятия ({pastTimelineLessons.length})
                        </span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>
                      <div className="space-y-2">{pastTimelineLessons.map(renderLessonCard)}</div>
                    </div>
                  )}

                  {/* TODAY DIVIDER */}
                  <div className="py-1">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-0.5 bg-blue-200" />
                      <div className="bg-blue-600 text-white text-[11px] font-black px-3 py-1 rounded-full shadow-xs flex items-center gap-1.5">
                        <Calendar className="w-3 h-3" />
                        <span>Сегодня, {format(getTashkentNow(), 'd MMMM', { locale: ru })}</span>
                        {todayTimelineLessons.length > 0 && (
                          <span className="bg-blue-700/80 px-1.5 py-0.2 rounded-full text-[10px]">
                            {todayTimelineLessons.length} ур.
                          </span>
                        )}
                      </div>
                      <div className="flex-1 h-0.5 bg-blue-200" />
                    </div>

                    {todayTimelineLessons.length > 0 && (
                      <div className="space-y-2 mt-2.5">
                        {todayTimelineLessons.map(renderLessonCard)}
                      </div>
                    )}
                  </div>

                  {/* UPCOMING LESSONS */}
                  {directionFilter !== 'past' && upcomingTimelineLessons.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">
                          Предстоящие занятия ({upcomingTimelineLessons.length})
                        </span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>
                      <div className="space-y-2">{upcomingTimelineLessons.map(renderLessonCard)}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Settings & Profile */}
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

            {/* Contacts & Monthly Target */}
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

            {/* Billing Model & Rates */}
            <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80 space-y-3">
              <label className="text-[11px] font-bold text-gray-400 uppercase block">
                Модель оплаты и баланс
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    setBillingType('date_to_date');
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                    billingType === 'date_to_date'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
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
                  className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                    billingType === 'package'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  📦 Пакетами уроков
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1">
                    Ставка за урок (сум)
                  </label>
                  <input
                    type="number"
                    value={lessonRate}
                    onChange={(e) => setLessonRate(Number(e.target.value))}
                    step={10000}
                    className="w-full text-xs font-black text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-gray-400 uppercase block mb-1">
                    Баланс уроков
                  </label>
                  <input
                    type="number"
                    value={lessonsBalance}
                    onChange={(e) => setLessonsBalance(Number(e.target.value))}
                    className="w-full text-xs font-black text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
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
                    className={`w-8 h-8 rounded-full border-2 transition-transform active:scale-90 ${
                      studentColor === c ? 'border-gray-900 scale-110 shadow-md' : 'border-white'
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
                  <h4 className="text-sm font-black text-gray-900">Регулярное расписание</h4>
                  <p className="text-[11px] text-gray-400 font-medium">Шаблон еженедельных занятий</p>
                </div>
                <button
                  type="button"
                  onClick={handleAddRecurringSlot}
                  className="py-1 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl flex items-center gap-1 active:scale-95 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить</span>
                </button>
              </div>

              {recurringSlots.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs font-medium">
                  Регулярные слоты не заданы.
                </div>
              ) : (
                <div className="space-y-2">
                  {recurringSlots.map((slot, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-2xl bg-gray-50 border border-gray-200/80 flex items-center gap-2"
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

            {/* Save Button */}
            <div className="pt-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveAllSettings}
                className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 active:scale-98 transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Сохранение...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Сохранить настройки ученика</span>
                  </>
                )}
              </button>
            </div>

            {/* Delete Student */}
            <div className="pt-2">
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
