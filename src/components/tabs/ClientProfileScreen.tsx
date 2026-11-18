'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Student,
  Lesson,
  RecurringSlot,
  BillingType,
  BillingCalculation,
  LessonStatus,
} from '@/types';
import {
  ArrowLeft,
  X,
  Check,
  Calendar,
  Clock,
  Edit2,
  Trash2,
  Plus,
  Wallet,
  ChevronDown,
  ChevronUp,
  Package,
  Sparkles,
  Loader2,
  Copy,
  FileText,
  Send,
  Phone,
  Settings,
} from 'lucide-react';
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
import { generateStudentReport } from '@/lib/reports';
import { getTutorSettings } from '@/lib/settings';

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
  onRefresh?: () => Promise<void> | void;
  onAddLessonForStudent?: (studentId: string) => void;
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

function addMinutesToTime(timeStr: string, minutes: number): string {
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return '17:30';
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function getTelegramUrl(tgRaw?: string): string | null {
  if (!tgRaw) return null;
  const cleaned = tgRaw.trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@/, '');
  if (!cleaned) return null;
  return `https://t.me/${cleaned}`;
}

export const ClientProfileScreen: React.FC<ClientProfileScreenProps> = ({
  student,
  lessons,
  onBack,
  onDeleteStudent,
  onSaveStudentInfo,
  onUpdateLessonMissReason,
  onOpenLesson,
  onRefresh,
  onAddLessonForStudent,
}) => {
  const [activeTab, setActiveTab] = useState<'archive' | 'settings'>('archive');
  const [isSaving, setIsSaving] = useState(false);

  // Profile fields state
  const [studentName, setStudentName] = useState(student.name);
  const [studentPhone, setStudentPhone] = useState(student.phone || '');
  const [studentTelegram, setStudentTelegram] = useState(student.telegram || '');
  const [monthlyTarget, setMonthlyTarget] = useState<number>(
    student.monthly_target_lessons || 12
  );
  const [billingDay, setBillingDay] = useState<string>(String(student.billing_day || '10'));
  const [billingType, setBillingType] = useState<BillingType>(
    student.billing_type || 'date_to_date'
  );
  const [lessonRate, setLessonRate] = useState<number>(student.lesson_rate || 300000);
  const [lessonsBalance, setLessonsBalance] = useState<number>(student.lessons_balance ?? 0);
  const [studentColor, setStudentColor] = useState<string>(student.color || '#3B82F6');
  const [scheduleNotes, setScheduleNotes] = useState<string>(student.schedule_notes || '');
  const [isActive, setIsActive] = useState<boolean>(student.is_active !== false);
  const [recurringSlots, setRecurringSlots] = useState<RecurringSlot[]>(
    student.recurring_schedule || []
  );
  const [billingCalc, setBillingCalc] = useState<BillingCalculation | null>(null);
  const [copyState, setCopyState] = useState<'invoice' | 'report' | null>(null);
  const [isCopyingReport, setIsCopyingReport] = useState(false);

  // Horizon & Timeline state (7 / 14 / 30 / 60 days)
  const [daysHorizon, setDaysHorizon] = useState<7 | 14 | 30 | 60>(30);
  const [directionFilter, setDirectionFilter] = useState<'all' | 'past' | 'upcoming'>('all');
  const [showPastInAllView, setShowPastInAllView] = useState<boolean>(false);
  const [horizonLessons, setHorizonLessons] = useState<Lesson[]>([]);
  const [isLoadingHorizon, setIsLoadingHorizon] = useState<boolean>(false);
  const prevHorizonKeyRef = useRef<string>('');

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
    const maxDayInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const d = new Date(Date.UTC(y, m, Math.min(bNum, maxDayInMonth)));
    return d.toISOString().substring(0, 10);
  });
  const [retroPackageCount, setRetroPackageCount] = useState<number>(
    student.monthly_target_lessons || 12
  );
  const [retroExcludedDates, setRetroExcludedDates] = useState<string[]>([]);
  const [isApplyingRetro, setIsApplyingRetro] = useState<boolean>(false);

  // Inline reason edit modal state
  const [editingReasonLesson, setEditingReasonLesson] = useState<{
    id: string;
    currentReason: string;
  } | null>(null);
  const [reasonInput, setReasonInput] = useState('');

  const PRESET_COLORS = [
    '#3B82F6',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#EC4899',
    '#06B6D4',
    '#14B8A6',
    '#F97316',
    '#84CC16',
    '#0EA5E9',
    '#A855F7',
  ];

  const todayStr = getTashkentTodayStr();
  const tgUrl = getTelegramUrl(studentTelegram);

  // Keep lessonsBalance synced with parent student updates
  useEffect(() => {
    setLessonsBalance(student.lessons_balance ?? 0);
  }, [student.id, student.lessons_balance]);

  // Track changes to this student's lessons in parent state
  const studentLessonsSignature = useMemo(
    () =>
      lessons
        .filter((l) => l.student_id === student.id)
        .map(
          (l) =>
            `${l.id}:${l.date}:${l.time_str}:${l.status}:${l.miss_reason || ''}:${l.notes || ''}`
        )
        .join('|'),
    [lessons, student.id]
  );

  // Load horizon lessons and unmarked past lessons
  useEffect(() => {
    let isMounted = true;
    const key = `${student.id}_${daysHorizon}`;
    if (prevHorizonKeyRef.current !== key) {
      prevHorizonKeyRef.current = key;
      setIsLoadingHorizon(true);
    }

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
  }, [student.id, daysHorizon, studentLessonsSignature]);

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
      await onRefresh?.();
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

    const isDeducted = (s: string) =>
      s === 'completed' || s === 'missed_penalty' || s === 'missed';
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
      await onRefresh?.();
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

    setUnmarkedLessons([]);
    setLessonsBalance((prev) => prev - countToDeduct);
    setHorizonLessons((prev) =>
      prev.map((l) =>
        lessonIds.includes(l.id) ? { ...l, status: 'completed' as LessonStatus } : l
      )
    );

    for (const id of lessonIds) {
      await setLessonStatusDirect(id, 'completed').catch((e) => console.error(e));
    }

    calculateStudentBilling(student.id).then(setBillingCalc).catch(() => {});
    await Promise.all([refreshAllLessons(), Promise.resolve(onRefresh?.())]);
  };

  // Retroactive package preview slots
  const retroSlotsPreview = useMemo(() => {
    if (!retroStartDate || retroStartDate > todayStr) return [];

    const slots =
      recurringSlots.length > 0 ? recurringSlots : student.recurring_schedule || [];
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
      await Promise.all([refreshAllLessons(), Promise.resolve(onRefresh?.())]);
      calculateStudentBilling(student.id).then(setBillingCalc).catch(() => {});
    } catch (e: any) {
      alert(e?.message || 'Ошибка применения пакета с прошлой даты');
    } finally {
      setIsApplyingRetro(false);
    }
  };

  const handleCopyInvoice = async () => {
    hapticImpact('light');
    try {
      const calc = billingCalc || (await calculateStudentBilling(student.id));
      const settings = getTutorSettings();
      let msg = `Здравствуйте! 📚 Направляю информацию по оплате занятий (${studentName}):\n\n`;
      if (calc.billingType === 'package') {
        const size = calc.packageSize || monthlyTarget || 12;
        const sum = calc.packageAmount || size * lessonRate;
        msg += `📦 Абонемент: ${size} уроков\n`;
        msg += `💳 Стоимость пакета: ${sum.toLocaleString('ru-RU')} сум (${lessonRate.toLocaleString('ru-RU')} сум/урок)\n`;
        msg += `⚖️ Текущий баланс: ${lessonsBalance} ур.\n`;
        if (lessonsBalance < 0) {
          const debt = Math.abs(lessonsBalance) * lessonRate;
          msg += `⚠️ Задолженность за ${Math.abs(lessonsBalance)} ур.: ${debt.toLocaleString('ru-RU')} сум\n`;
        }
      } else {
        const sD = calc.startDate?.split('-').reverse().join('.') || '';
        const eD = calc.endDate?.split('-').reverse().join('.') || '';
        msg += `📅 Расчётный период: ${sD} – ${eD}\n`;
        msg += `🗓 Занятий по графику: ${calc.scheduledLessonsCount || 0} ур.\n`;
        msg += `⚖️ Текущий баланс: ${lessonsBalance} ур.\n`;
        msg += `💳 К оплате: ${calc.lessonsToPay ?? 0} ур. = ${(calc.netAmount ?? 0).toLocaleString('ru-RU')} сум\n`;
      }
      if (settings.cardNumber) {
        msg += `\n💳 Реквизиты для оплаты:\n${settings.bankName}: ${settings.cardNumber}\nПолучатель: ${settings.cardHolder || settings.tutorName}\n`;
      }
      msg += `\nБуду рад(а) подтверждению после перевода! 🙏`;
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(msg);
        setCopyState('invoice');
        hapticNotification('success');
        setTimeout(() => setCopyState(null), 2000);
      }
    } catch (e) {
      console.error('Copy invoice failed:', e);
    }
  };

  const handleCopyParentReport = async () => {
    hapticImpact('light');
    setIsCopyingReport(true);
    try {
      const report = await generateStudentReport(student.id);
      if (report?.parentForwardText && navigator.clipboard) {
        const withBalance = `${report.parentForwardText}\n\n⚖️ Текущий баланс уроков: ${lessonsBalance} ур.`;
        await navigator.clipboard.writeText(withBalance);
        setCopyState('report');
        hapticNotification('success');
        setTimeout(() => setCopyState(null), 2000);
      }
    } catch (e) {
      console.error('Copy report failed:', e);
    } finally {
      setIsCopyingReport(false);
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
          is_active: isActive,
          recurring_schedule: recurringSlots,
        });
      }
      hapticNotification('success');
      setActiveTab('archive');
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
      prev.map((slot, i) => {
        if (i !== idx) return slot;
        const next = { ...slot, ...updates };
        if (updates.startTime) {
          next.endTime = addMinutesToTime(updates.startTime, 90);
        }
        return next;
      })
    );
  };

  const handleSaveMissReason = async () => {
    if (!editingReasonLesson) return;
    hapticNotification('success');
    if (onUpdateLessonMissReason) {
      await onUpdateLessonMissReason(editingReasonLesson.id, reasonInput.trim());
    }
    setHorizonLessons((prev) =>
      prev.map((l) =>
        l.id === editingReasonLesson.id ? { ...l, miss_reason: reasonInput.trim() } : l
      )
    );
    setEditingReasonLesson(null);
  };

  // Render a single lesson card in the student's timeline
  const renderLessonCard = (l: Lesson) => {
    const isCompleted = l.status === 'completed';
    const isPenalty =
      l.status === 'missed_penalty' || (l.status === 'missed' && !l.needs_makeup);
    const isExcused =
      l.status === 'missed_excused' || (l.status === 'missed' && l.needs_makeup);
    const isPlanned = !isCompleted && !isPenalty && !isExcused;
    const dateParsed = parseISO(l.date);
    const hasCustomNote = Boolean(
      l.notes &&
        !l.notes.startsWith('Регулярный урок') &&
        !l.notes.startsWith('Авто-слот')
    );

    return (
      <div
        key={l.id}
        onClick={() => {
          if (onOpenLesson) {
            hapticImpact('light');
            onOpenLesson(l);
          }
        }}
        className={`p-3 rounded-2xl border transition-all cursor-pointer active:scale-[0.99] space-y-2 ${
          isCompleted
            ? 'bg-white border-emerald-200/80'
            : isPenalty
            ? 'bg-white border-orange-200/80'
            : isExcused
            ? 'bg-slate-50/70 border-rose-200/70 opacity-85'
            : 'bg-white border-slate-200/90 shadow-2xs'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-extrabold text-slate-900">
              {format(dateParsed, 'd MMM', { locale: ru })}
            </span>
            <span className="text-[11px] font-bold text-slate-400 uppercase">
              {format(dateParsed, 'EEEEEE', { locale: ru })}
            </span>
            <span className="text-slate-300">•</span>
            <div className="flex items-center gap-1 font-mono text-xs text-slate-700 font-bold">
              <span>{l.time_str || '16:00 - 17:30'}</span>
            </div>
          </div>

          <div className="shrink-0">
            {isCompleted && (
              <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                ✅ Был (-1)
              </span>
            )}
            {isPenalty && (
              <span className="text-[10px] font-extrabold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-lg">
                🔥 Сгорел (-1)
              </span>
            )}
            {isExcused && (
              <span className="text-[10px] font-extrabold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg">
                🛑 Отмена (0)
              </span>
            )}
            {isPlanned && (
              <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">
                ⏳ План
              </span>
            )}
          </div>
        </div>

        {/* Notes and Miss Reason */}
        {(l.miss_reason || hasCustomNote) && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
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
                <span>Причина: {l.miss_reason}</span>
                <Edit2 className="w-2.5 h-2.5" />
              </button>
            ) : (
              <span />
            )}

            {hasCustomNote && (
              <div className="text-[11px] text-slate-600 bg-amber-50/70 px-2 py-0.5 rounded-md truncate max-w-[220px]">
                📝 {l.notes}
              </div>
            )}
          </div>
        )}

        {/* 1-Tap Quick Attendance Status Switcher */}
        <div
          className="flex items-center gap-1 pt-1 border-t border-slate-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleQuickLessonStatus(l.id, 'completed')}
            className={`flex-1 py-1 px-1.5 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 transition-all active:scale-95 ${
              isCompleted
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700'
            }`}
          >
            <span>✅ Был</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickLessonStatus(l.id, 'missed_penalty')}
            className={`flex-1 py-1 px-1.5 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 transition-all active:scale-95 ${
              isPenalty
                ? 'bg-orange-500 text-white shadow-2xs'
                : 'bg-slate-50 hover:bg-orange-50 text-slate-600 hover:text-orange-700'
            }`}
          >
            <span>🔥 Сгорел</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickLessonStatus(l.id, 'missed_excused')}
            className={`flex-1 py-1 px-1.5 rounded-lg font-bold text-[11px] flex items-center justify-center gap-1 transition-all active:scale-95 ${
              isExcused
                ? 'bg-rose-500 text-white shadow-2xs'
                : 'bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700'
            }`}
          >
            <span>🛑 Отмена</span>
          </button>

          {!isPlanned && (
            <button
              type="button"
              onClick={() => handleQuickLessonStatus(l.id, 'planned')}
              className="py-1 px-2 rounded-lg font-bold text-[11px] bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-700 transition-all active:scale-95"
              title="Вернуть в план"
            >
              <span>↩️ План</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f4f5f8] flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 bg-white border-b border-slate-200/80">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            hapticImpact('light');
            onBack();
          }}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-slate-100 text-slate-700 active:scale-90 transition-transform"
          title="Назад"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={2.5} />
        </button>

        <div className="text-center min-w-0 px-2">
          <div className="flex items-center justify-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: studentColor }}
            />
            <h2 className="text-base font-extrabold text-slate-900 leading-tight truncate">
              {studentName}
            </h2>
          </div>
          <span className="text-[11px] text-slate-500 font-medium block">
            {lessonRate.toLocaleString('ru-RU')} сум/ур. •{' '}
            {billingType === 'package' ? 'Пакет' : `Оплата ${billingDay}`}
          </span>
        </div>

        {/* Right Header Action: Contact icons on Archive tab, Save button on Settings tab */}
        {activeTab === 'settings' ? (
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveAllSettings}
            className="h-9 px-3 flex items-center justify-center gap-1 rounded-xl bg-blue-600 disabled:opacity-50 text-white text-xs font-bold shadow-sm shadow-blue-500/20 active:scale-90 transition-transform"
            title="Сохранить настройки"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                <span>Сохранить</span>
              </>
            )}
          </button>
        ) : (
          <div className="flex items-center gap-1.5">
            {tgUrl && (
              <a
                href={tgUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center active:scale-90 transition-transform"
                title="Открыть Telegram ученика"
              >
                <Send className="w-4 h-4" />
              </a>
            )}
            {studentPhone && (
              <a
                href={`tel:${studentPhone}`}
                className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center active:scale-90 transition-transform"
                title="Позвонить ученику"
              >
                <Phone className="w-4 h-4" />
              </a>
            )}
            {!tgUrl && !studentPhone && (
              <button
                type="button"
                onClick={() => {
                  hapticImpact('light');
                  setActiveTab('settings');
                }}
                className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center active:scale-90 transition-transform"
                title="Настройки профиля"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs Switcher */}
      <div className="flex bg-white px-4 py-2 gap-1.5 border-b border-slate-200/80">
        <button
          type="button"
          onClick={() => {
            hapticImpact('light');
            setActiveTab('archive');
          }}
          className={`flex-1 text-xs font-bold py-2 rounded-xl transition-all ${
            activeTab === 'archive'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 bg-slate-100 hover:bg-slate-200/70'
          }`}
        >
          Уроки и оплата
        </button>
        <button
          type="button"
          onClick={() => {
            hapticImpact('light');
            setActiveTab('settings');
          }}
          className={`flex-1 text-xs font-bold py-2 rounded-xl transition-all ${
            activeTab === 'settings'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 bg-slate-100 hover:bg-slate-200/70'
          }`}
        >
          Профиль и расписание
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3.5 pb-24 space-y-3.5">
        {activeTab === 'archive' && (
          <div className="space-y-3.5">
            {/* UNIFIED COMPACT FINANCIAL & ACTIONS CARD */}
            <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200/80 space-y-3">
              {/* Row 1: Balance + Quick Top-Up Buttons */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                      lessonsBalance <= 0
                        ? 'bg-rose-50 text-rose-600'
                        : lessonsBalance <= 2
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-blue-50 text-blue-600'
                    }`}
                  >
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block">
                      Баланс уроков
                    </span>
                    <span
                      className={`text-xl font-black leading-none ${
                        lessonsBalance <= 0 ? 'text-rose-600' : 'text-slate-900'
                      }`}
                    >
                      {lessonsBalance}{' '}
                      <span className="text-xs text-slate-500 font-bold">ур.</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAdjustBalance(-1)}
                    className="h-8 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center active:scale-95"
                    title="Списать 1 урок"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjustBalance(1)}
                    className="h-8 px-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs flex items-center gap-0.5 active:scale-95"
                    title="Добавить 1 урок"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjustBalance(Number(monthlyTarget) || 8)}
                    className="h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1 shadow-2xs active:scale-95"
                    title="Зачислить оплату пакета"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{Number(monthlyTarget) || 8} ур.</span>
                  </button>
                </div>
              </div>

              {/* Row 2: Compact Billing Calculation Strip */}
              {billingCalc && (
                <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/70 text-xs flex items-center justify-between gap-2">
                  {billingCalc.billingType === 'date_to_date' ? (
                    <>
                      <span className="text-slate-600 font-medium truncate">
                        Период {billingCalc.startDate?.split('-').slice(1).join('.')}–
                        {billingCalc.endDate?.split('-').slice(1).join('.')} (
                        {billingCalc.scheduledLessonsCount} ур.)
                      </span>
                      <span className="text-emerald-700 font-extrabold shrink-0">
                        К оплате: {billingCalc.netAmount?.toLocaleString('ru-RU')} сум
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-slate-600 font-medium">
                        Пакет на {billingCalc.packageSize} ур.
                      </span>
                      <span className="text-emerald-700 font-extrabold">
                        {billingCalc.packageAmount?.toLocaleString('ru-RU')} сум
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* Row 3: Unified Parent Copy & Retro Package Bar */}
              <div className="grid grid-cols-3 gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={handleCopyInvoice}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold border flex items-center justify-center gap-1 active:scale-95 transition-all ${
                    copyState === 'invoice'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-blue-50/80 hover:bg-blue-100 text-blue-700 border-blue-200/80'
                  }`}
                >
                  {copyState === 'invoice' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copyState === 'invoice' ? 'Скопирован!' : 'Счёт'}</span>
                </button>

                <button
                  type="button"
                  disabled={isCopyingReport}
                  onClick={handleCopyParentReport}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold border flex items-center justify-center gap-1 active:scale-95 transition-all disabled:opacity-60 ${
                    copyState === 'report'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {copyState === 'report' ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <FileText className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {copyState === 'report'
                      ? 'Скопирован!'
                      : isCopyingReport
                      ? 'Готовлю...'
                      : 'Отчёт'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    setIsRetroWizardOpen((prev) => !prev);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold border flex items-center justify-center gap-1 active:scale-95 transition-all ${
                    isRetroWizardOpen
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 border-indigo-200/80'
                  }`}
                  title="Открыть пакет задним числом с прошлой даты"
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>С даты</span>
                </button>
              </div>
            </div>

            {/* Retroactive Package Wizard Inline Panel */}
            {isRetroWizardOpen && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-indigo-200 space-y-3 animate-in fade-in-50 duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-extrabold text-slate-900">
                      Открыть пакет с прошлой даты
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsRetroWizardOpen(false)}
                    className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 leading-snug">
                  Заполняет уроки по расписанию с даты старта до сегодняшнего дня, отмечает
                  проведённые и вычисляет точный остаток баланса.
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                      Дата старта пакета
                    </label>
                    <input
                      type="date"
                      value={retroStartDate}
                      max={todayStr}
                      onChange={(e) => setRetroStartDate(e.target.value)}
                      className="w-full text-xs font-bold text-slate-900 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                      Уроков в пакете
                    </label>
                    <input
                      type="number"
                      value={retroPackageCount}
                      min={1}
                      max={100}
                      onChange={(e) => setRetroPackageCount(Number(e.target.value))}
                      className="w-full text-xs font-black text-slate-900 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Slots Preview & Exclude toggles */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Уроки в периоде ({retroSlotsPreview.length})
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Нажмите, чтобы отметить пропуск
                    </span>
                  </div>

                  {retroSlotsPreview.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400 bg-slate-50 rounded-2xl">
                      В выбранном диапазоне нет уроков по регулярному расписанию
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-slate-50 rounded-2xl border border-slate-200/60">
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
                                ? 'bg-rose-50 border-rose-200 text-rose-700 line-through opacity-80'
                                : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                            }`}
                          >
                            <span>
                              {format(d, 'd MMM, EEE', { locale: ru })}:{' '}
                              {isExcluded ? '🛑 Пропуск' : '✅ Был'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Calculation Summary Line */}
                <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs flex items-center justify-between">
                  <span className="text-slate-700 font-semibold">
                    Проведено: <b>{retroCompletedCount} ур.</b>
                  </span>
                  <span className="font-extrabold text-indigo-800">
                    Остаток на сегодня: {retroRemainingBalance} ур.
                  </span>
                </div>

                {/* Submit Action */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRetroWizardOpen(false)}
                    className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={isApplyingRetro || retroSlotsPreview.length === 0}
                    onClick={handleApplyRetroPackage}
                    className="flex-2 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm active:scale-95 transition-all"
                  >
                    {isApplyingRetro ? 'Применение...' : 'Применить и пересчитать'}
                  </button>
                </div>
              </div>
            )}

            {/* "⏳ Неотмеченные прошлые уроки (N)" Alert Banner */}
            {unmarkedLessons.length > 0 && (
              <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-amber-900 font-extrabold text-xs">
                    ⏳ Неотмеченные прошлые ({unmarkedLessons.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleMarkAllPastAsCompleted}
                    className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-2xs active:scale-95 transition-all"
                  >
                    ✅ Все были ({unmarkedLessons.length})
                  </button>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1 pt-0.5 no-scrollbar">
                  {unmarkedLessons.map((l) => {
                    const d = parseISO(l.date);
                    return (
                      <div
                        key={l.id}
                        className="shrink-0 bg-white border border-amber-200 rounded-xl p-2 shadow-2xs space-y-1.5 min-w-[130px]"
                      >
                        <div>
                          <span className="text-[11px] font-extrabold text-slate-900 block">
                            {format(d, 'd MMM, EEE', { locale: ru })}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono block">
                            {l.time_str || '16:00 - 17:30'}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleQuickLessonStatus(l.id, 'completed')}
                            className="flex-1 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs text-center active:scale-90"
                          >
                            ✅
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickLessonStatus(l.id, 'missed_penalty')}
                            className="flex-1 py-1 rounded-lg bg-orange-50 hover:bg-orange-100 text-orange-700 font-bold text-xs text-center active:scale-90"
                          >
                            🔥
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickLessonStatus(l.id, 'missed_excused')}
                            className="flex-1 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs text-center active:scale-90"
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

            {/* COMPACT SCHEDULE HORIZON FILTER BAR */}
            <div className="bg-white rounded-2xl p-3.5 shadow-2xs border border-slate-200/80 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-extrabold text-slate-800">Расписание ученика</span>
                  <span className="text-[11px] font-semibold text-slate-400">
                    • ✅ {horizonStats.completed} · 🔥 {horizonStats.penalty} · 🛑{' '}
                    {horizonStats.excused} · 📅 {horizonStats.planned}
                  </span>
                </div>
                {onAddLessonForStudent && (
                  <button
                    type="button"
                    onClick={() => {
                      hapticImpact('light');
                      onAddLessonForStudent(student.id);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-blue-600 text-white font-bold text-[11px] flex items-center gap-1 shadow-2xs active:scale-95 shrink-0"
                  >
                    <Plus className="w-3 h-3 stroke-[3]" />
                    <span>Урок</span>
                  </button>
                )}
              </div>

              {/* Combined Horizon + Direction Bar */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex bg-slate-100 p-0.5 rounded-xl gap-0.5">
                  {([7, 14, 30, 60] as const).map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        hapticImpact('light');
                        setDaysHorizon(h);
                      }}
                      className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all ${
                        daysHorizon === h
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {h}д
                    </button>
                  ))}
                </div>

                <div className="flex bg-slate-100 p-0.5 rounded-xl gap-0.5 flex-1">
                  {[
                    { id: 'all', label: 'Все' },
                    { id: 'upcoming', label: 'Будущие' },
                    { id: 'past', label: 'Прошлые' },
                  ].map((dir) => (
                    <button
                      key={dir.id}
                      type="button"
                      onClick={() => {
                        hapticImpact('light');
                        setDirectionFilter(dir.id as any);
                      }}
                      className={`flex-1 py-1 text-[11px] font-bold rounded-lg transition-all ${
                        directionFilter === dir.id
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-500'
                      }`}
                    >
                      {dir.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Interactive Timeline of Lessons (Today & Upcoming first, Past collapsible in 'all' mode!) */}
            <div className="space-y-3">
              {isLoadingHorizon ? (
                <div className="bg-white rounded-2xl p-8 text-center text-slate-400 text-xs font-medium border border-slate-200/80">
                  Загрузка расписания...
                </div>
              ) : timelineLessons.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center text-slate-400 text-xs font-medium border border-slate-200/80">
                  В выбранном периоде ({daysHorizon} дн) нет уроков
                </div>
              ) : (
                <div className="space-y-3">
                  {/* PAST LESSONS (Collapsible in 'all' mode so Today is immediately visible!) */}
                  {directionFilter !== 'upcoming' && pastTimelineLessons.length > 0 && (
                    <div className="space-y-2">
                      {directionFilter === 'all' ? (
                        <button
                          type="button"
                          onClick={() => {
                            hapticImpact('light');
                            setShowPastInAllView((prev) => !prev);
                          }}
                          className="w-full py-2 px-3 rounded-xl bg-white border border-slate-200/80 text-xs font-bold text-slate-600 flex items-center justify-between shadow-2xs active:scale-[0.99]"
                        >
                          <span>
                            Прошедшие занятия за {daysHorizon} дн ({pastTimelineLessons.length})
                          </span>
                          <span className="text-blue-600 flex items-center gap-1 text-[11px]">
                            <span>{showPastInAllView ? 'Скрыть' : 'Показать'}</span>
                            {showPastInAllView ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2 px-1">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            Прошедшие занятия ({pastTimelineLessons.length})
                          </span>
                          <div className="flex-1 h-px bg-slate-200" />
                        </div>
                      )}

                      {(directionFilter === 'past' || showPastInAllView) && (
                        <div className="space-y-2">
                          {pastTimelineLessons.map(renderLessonCard)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TODAY SECTION */}
                  {directionFilter !== 'past' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-px bg-blue-200" />
                        <div className="bg-blue-600 text-white text-[11px] font-extrabold px-3 py-1 rounded-full shadow-2xs flex items-center gap-1.5">
                          <Calendar className="w-3 h-3" />
                          <span>
                            Сегодня, {format(getTashkentNow(), 'd MMMM', { locale: ru })}
                          </span>
                          {todayTimelineLessons.length > 0 && (
                            <span className="bg-blue-700 px-1.5 py-0.2 rounded-full text-[10px]">
                              {todayTimelineLessons.length} ур.
                            </span>
                          )}
                        </div>
                        <div className="flex-1 h-px bg-blue-200" />
                      </div>

                      {todayTimelineLessons.length > 0 && (
                        <div className="space-y-2">
                          {todayTimelineLessons.map(renderLessonCard)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* UPCOMING LESSONS */}
                  {directionFilter !== 'past' && upcomingTimelineLessons.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                          Предстоящие занятия ({upcomingTimelineLessons.length})
                        </span>
                        <div className="flex-1 h-px bg-slate-200" />
                      </div>
                      <div className="space-y-2">
                        {upcomingTimelineLessons.map(renderLessonCard)}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Settings & Profile */}
        {activeTab === 'settings' && (
          <div className="space-y-3.5">
            {/* Recurring Schedule Editor (Placed at top of Settings because schedule changes happen most often) */}
            <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">Регулярное расписание</h4>
                  <p className="text-[11px] text-slate-400 font-medium">
                    При сохранении обновит будущие уроки на 9 недель
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddRecurringSlot}
                  className="py-1.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs rounded-xl flex items-center gap-1 active:scale-95 transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Добавить день</span>
                </button>
              </div>

              {recurringSlots.length === 0 ? (
                <div className="text-center py-5 text-slate-400 text-xs font-medium bg-slate-50 rounded-xl">
                  Регулярные дни не заданы
                </div>
              ) : (
                <div className="space-y-2">
                  {recurringSlots.map((slot, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-2"
                    >
                      <select
                        value={slot.dayOfWeek}
                        onChange={(e) =>
                          handleUpdateRecurringSlot(idx, { dayOfWeek: Number(e.target.value) })
                        }
                        className="bg-white text-xs font-bold text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden"
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
                        onChange={(e) =>
                          handleUpdateRecurringSlot(idx, { startTime: e.target.value })
                        }
                        className="flex-1 bg-white text-xs font-bold text-slate-900 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-hidden"
                      />

                      <span className="text-slate-400 text-xs">–</span>

                      <input
                        type="time"
                        value={slot.endTime || '17:30'}
                        onChange={(e) =>
                          handleUpdateRecurringSlot(idx, { endTime: e.target.value })
                        }
                        className="flex-1 bg-white text-xs font-bold text-slate-900 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-hidden"
                      />

                      <button
                        type="button"
                        onClick={() => handleRemoveRecurringSlot(idx)}
                        className="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center active:scale-90 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Student Name & Contacts */}
            <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200/80 space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                  Имя ученика
                </label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full text-sm font-bold text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    Телефон
                  </label>
                  <input
                    type="text"
                    value={studentPhone}
                    onChange={(e) => setStudentPhone(e.target.value)}
                    placeholder="+998 90 123 45 67"
                    className="w-full text-xs font-semibold text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    Telegram
                  </label>
                  <input
                    type="text"
                    value={studentTelegram}
                    onChange={(e) => setStudentTelegram(e.target.value)}
                    placeholder="@username"
                    className="w-full text-xs font-semibold text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500 focus:bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Billing Model & Rates */}
            <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200/80 space-y-3">
              <label className="text-[11px] font-bold text-slate-400 uppercase block">
                Модель оплаты и ставка
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
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
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
                      ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  📦 Пакетами уроков
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    Ставка за урок (сум)
                  </label>
                  <input
                    type="number"
                    value={lessonRate}
                    onChange={(e) => setLessonRate(Number(e.target.value))}
                    step={10000}
                    className="w-full text-xs font-black text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    Баланс уроков
                  </label>
                  <input
                    type="number"
                    value={lessonsBalance}
                    onChange={(e) => setLessonsBalance(Number(e.target.value))}
                    className="w-full text-xs font-black text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    Норма уроков в мес.
                  </label>
                  <input
                    type="number"
                    value={monthlyTarget}
                    onChange={(e) => setMonthlyTarget(Number(e.target.value))}
                    min={1}
                    max={60}
                    className="w-full text-xs font-black text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    День оплаты
                  </label>
                  <input
                    type="text"
                    value={billingDay}
                    onChange={(e) => setBillingDay(e.target.value)}
                    placeholder="10 число"
                    className="w-full text-xs font-bold text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Notes, Color & Active Status */}
            <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200/80 space-y-3">
              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                  Заметки об ученике / Цель обучения
                </label>
                <textarea
                  rows={2}
                  value={scheduleNotes}
                  onChange={(e) => setScheduleNotes(e.target.value)}
                  placeholder="Уровень, цель (IELTS, ЕГЭ, школьная программа), особенности..."
                  className="w-full text-xs font-medium text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-400 uppercase block mb-2">
                  Цвет ученика
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
                      className={`w-7 h-7 rounded-full border-2 transition-transform active:scale-90 ${
                        studentColor === c
                          ? 'border-slate-900 scale-110 shadow-sm'
                          : 'border-white'
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div>
                  <span className="text-xs font-bold text-slate-900 block">Статус ученика</span>
                  <span className="text-[11px] text-slate-500">
                    {isActive ? 'Активен в расписании' : 'На паузе / в архиве'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    setIsActive((prev) => !prev);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                    isActive
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-slate-100 text-slate-600 border-slate-300'
                  }`}
                >
                  {isActive ? '✅ Активен' : '⏸ На паузе'}
                </button>
              </div>
            </div>

            {/* Save & Delete Buttons */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveAllSettings}
                className="w-full py-3.5 rounded-2xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-black shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 active:scale-98 transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Сохранение...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Сохранить изменения</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      `Вы уверены, что хотите удалить ученика «${student.name}» и всю его историю?`
                    )
                  ) {
                    onDeleteStudent(student.id);
                  }
                }}
                className="w-full py-3 rounded-2xl bg-rose-50 text-rose-600 text-xs font-bold border border-rose-200/80 flex items-center justify-center gap-1.5 active:scale-98"
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
                <h3 className="text-base font-bold text-slate-900">Причина пропуска</h3>
                <p className="text-xs text-slate-500 mt-0.5">Укажите причину для архива ученика</p>
              </div>
              <button
                onClick={() => setEditingReasonLesson(null)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {[
                'Болеет',
                'Семейные обстоятельства',
                'Уехал',
                'Школьное мероприятие',
                'Не вышел на связь',
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setReasonInput(chip)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 active:scale-95 transition-all"
                >
                  {chip}
                </button>
              ))}
            </div>

            <textarea
              rows={3}
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="Введите причину пропуска..."
              className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:outline-hidden focus:border-blue-500"
            />

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingReasonLesson(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold"
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
