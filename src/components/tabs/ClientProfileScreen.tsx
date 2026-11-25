'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  Student,
  Lesson,
  RecurringSlot,
  BillingType,
  BillingCalculation,
  LessonStatus,
  Payment,
  PaymentMethod,
} from '@/types';
import {
  ArrowLeft,
  X,
  Check,
  Calendar,
  Edit2,
  Trash2,
  Plus,
  Wallet,
  Package,
  Sparkles,
  Loader2,
  Copy,
  FileText,
  Send,
  Phone,
  Settings,
  Receipt,
  Flame,
  Ban,
  RotateCcw,
} from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { useToast } from '@/components/ui/ToastProvider';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  getTashkentNow,
  getTashkentTodayStr,
  getTashkentDateString,
  getStudentBillingPeriod,
  extractBillingDayNumber,
  isRealNote,
  formatTashkentPaymentDate,
  isIsoDateString,
  formatShortRuDate,
  addDaysStr,
} from '@/lib/formatters';
import {
  ensureRecurringLessonsForStudent,
  getStudentLessonsArchive,
  initializePackageFromPastDate,
  startNewPackageForStudent,
  topUpStudentBalance,
  calculateStudentBilling,
  setLessonStatusDirect,
  getStudentPayments,
  deleteStudentPayment,
  PAYMENT_METHOD_LABELS,
  type updateStudentSettings,
} from '@/lib/storage';
import {
  computeStudentCycleSummary,
  buildArchivePeriods,
  classifyLessonKind,
  getLessonDateStr,
  sortLessonsAsc,
  type PlannedSlotLabel,
} from '@/lib/packageCycle';
import { generateStudentReport } from '@/lib/reports';
import { getTutorSettings, buildParentInvoiceMessage } from '@/lib/settings';
import { AddPaymentModal } from '@/components/modals/AddPaymentModal';

interface ClientProfileScreenProps {
  student: Student;
  lessons: Lesson[];
  lessonsRevision?: number;
  onBack: () => void;
  onDeleteStudent: (studentId: string) => void;
  onUpdateBillingDay?: (studentId: string, day: number) => void;
  onUpdateColor?: (studentId: string, color: string) => void;
  onSaveStudentInfo?: (
    studentId: string,
    updates: Parameters<typeof updateStudentSettings>[1]
  ) => Promise<void> | void;
  onUpdateLessonMissReason?: (lessonId: string, missReason: string) => Promise<void>;
  onOpenLesson?: (lesson: Lesson) => void;
  onRefresh?: () => Promise<void> | void;
  onAddLessonForStudent?: (studentId: string) => void;
  onOpenPaymentModal?: (student: Student) => void;
  paymentsVersion?: number;
  onPaymentsChanged?: () => void;
  onAddPayment?: (...args: unknown[]) => void;
  onToggleCalendarDate?: (...args: unknown[]) => void;
}

const PAYMENT_METHOD_BADGE_STYLES: Record<PaymentMethod, string> = {
  payme: 'bg-cyan-50 text-cyan-800 border-cyan-200/80',
  click: 'bg-blue-50 text-blue-800 border-blue-200/80',
  card: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
  cash: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
};

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
  lessonsRevision = 0,
  onBack,
  onDeleteStudent,
  onSaveStudentInfo,
  onUpdateLessonMissReason,
  onOpenLesson,
  onRefresh,
  onAddLessonForStudent,
  onOpenPaymentModal,
  paymentsVersion = 0,
  onPaymentsChanged,
}) => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'archive' | 'settings'>('archive');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Payment history & local modal fallback state
  const [studentPayments, setStudentPayments] = useState<Payment[]>([]);
  const [loadedPaymentsKey, setLoadedPaymentsKey] = useState<string>('');
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState<string | null>(null);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [isLocalPaymentOpen, setIsLocalPaymentOpen] = useState(false);

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
  const [copyState, setCopyState] = useState<'invoice' | 'report' | 'archive_report' | null>(null);
  const [isCopyingReport, setIsCopyingReport] = useState(false);

  // Full lessons archive & simplified 3-tab schedule view
  const [allStudentLessons, setAllStudentLessons] = useState<Lesson[]>([]);
  const [loadedLessonsKey, setLoadedLessonsKey] = useState<string>('');
  const [scheduleView, setScheduleView] = useState<'current' | 'upcoming' | 'archive'>('current');
  const [cycleSubFilter, setCycleSubFilter] = useState<
    'all' | 'completed' | 'missed' | 'remaining'
  >('all');
  const [upcomingHorizonDays, setUpcomingHorizonDays] = useState<30 | 60>(30);
  const [selectedArchiveId, setSelectedArchiveId] = useState<string>('');
  const [isCopyingArchiveReport, setIsCopyingArchiveReport] = useState<boolean>(false);

  // New Package / Retroactive Package Panel state
  const [isNewPackagePanelOpen, setIsNewPackagePanelOpen] = useState<boolean>(false);
  const [newPkgStartDate, setNewPkgStartDate] = useState<string>(() => getTashkentTodayStr());
  const [newPkgCount, setNewPkgCount] = useState<number>(student.monthly_target_lessons || 12);
  const [newPkgBalanceMode, setNewPkgBalanceMode] = useState<'reset' | 'add' | 'keep'>(() =>
    (student.lessons_balance ?? 0) >= (student.monthly_target_lessons || 12) ? 'keep' : 'reset'
  );
  const [retroExcludedDates, setRetroExcludedDates] = useState<string[]>([]);
  const [isApplyingNewPkg, setIsApplyingNewPkg] = useState<boolean>(false);

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
  const billingPeriod = useMemo(() => getStudentBillingPeriod(billingDay || '10'), [billingDay]);

  // Keep lessonsBalance, billingDay, monthlyTarget synced with parent student updates without an effect
  const propBalance = student.lessons_balance ?? 0;
  const [prevPropBalance, setPrevPropBalance] = useState<number>(propBalance);
  if (propBalance !== prevPropBalance) {
    setPrevPropBalance(propBalance);
    setLessonsBalance(propBalance);
  }

  const propBillingDay = String(student.billing_day || '10');
  const [prevPropBillingDay, setPrevPropBillingDay] = useState<string>(propBillingDay);
  if (propBillingDay !== prevPropBillingDay) {
    setPrevPropBillingDay(propBillingDay);
    setBillingDay(propBillingDay);
  }

  const propMonthlyTarget = student.monthly_target_lessons || 12;
  const [prevPropMonthlyTarget, setPrevPropMonthlyTarget] = useState<number>(propMonthlyTarget);
  if (propMonthlyTarget !== prevPropMonthlyTarget) {
    setPrevPropMonthlyTarget(propMonthlyTarget);
    setMonthlyTarget(propMonthlyTarget);
  }

  // Count parent lessons for this student (only changes when lessons are added/deleted, not on status tap)
  const studentLessonsCount = useMemo(
    () => lessons.filter((l) => l.student_id === student.id).length,
    [lessons, student.id]
  );

  const lessonsKey = `${student.id}_${studentLessonsCount}_${lessonsRevision}`;
  const isLoadingLessons = loadedLessonsKey !== lessonsKey;

  // Load full student lesson history + auto-ensured future recurring slots
  useEffect(() => {
    let isMounted = true;

    ensureRecurringLessonsForStudent(student.id, 9)
      .catch((e) => console.error('ensureRecurringLessonsForStudent error:', e))
      .then(() => getStudentLessonsArchive(student.id))
      .then((list) => {
        if (isMounted) {
          setAllStudentLessons(sortLessonsAsc(list));
          setLoadedLessonsKey(lessonsKey);
        }
      })
      .catch((err) => {
        console.error('Failed to load student lessons:', err);
        if (isMounted) setLoadedLessonsKey(lessonsKey);
      });

    return () => {
      isMounted = false;
    };
  }, [student.id, lessonsKey]);

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

  const paymentsKey = `${student.id}_${paymentsVersion}`;
  const isLoadingPayments = loadedPaymentsKey !== paymentsKey;

  // Load student payment history
  useEffect(() => {
    let isMounted = true;
    getStudentPayments(student.id, 30)
      .then((list) => {
        if (isMounted) {
          setStudentPayments(list);
          setLoadedPaymentsKey(paymentsKey);
        }
      })
      .catch(() => {
        if (isMounted) setLoadedPaymentsKey(paymentsKey);
      });
    return () => {
      isMounted = false;
    };
  }, [student.id, paymentsKey]);

  const handleTriggerPaymentModal = () => {
    hapticImpact('light');
    const currentStudentSnapshot: Student = {
      ...student,
      name: studentName,
      lesson_rate: lessonRate,
      lessons_balance: lessonsBalance,
      monthly_target_lessons: monthlyTarget,
      billing_type: billingType,
      billing_day: billingDay,
    };
    if (onOpenPaymentModal) {
      onOpenPaymentModal(currentStudentSnapshot);
    } else {
      setIsLocalPaymentOpen(true);
    }
  };

  const handleDeletePayment = async (payment: Payment) => {
    if (deletingPaymentId === payment.id) return;
    hapticImpact('medium');
    setDeletingPaymentId(payment.id);
    try {
      const { newBalance } = await deleteStudentPayment(payment.id);
      setStudentPayments((prev) => prev.filter((p) => p.id !== payment.id));
      setConfirmDeletePaymentId(null);
      setLessonsBalance(newBalance);
      hapticNotification('success');
      showToast({ message: `Платёж удалён · баланс ${newBalance} ур.`, tone: 'default' });
      calculateStudentBilling(student.id).then(setBillingCalc).catch(() => {});
      onPaymentsChanged?.();
      await onRefresh?.();
    } catch (err: unknown) {
      console.error('Failed to delete payment:', err);
      hapticNotification('error');
      showToast({
        message: err instanceof Error && err.message ? err.message : 'Не удалось удалить платёж',
        tone: 'error',
      });
    } finally {
      setDeletingPaymentId(null);
    }
  };

  const refreshAllLessons = async () => {
    await ensureRecurringLessonsForStudent(student.id, 9).catch(() => {});
    const list = await getStudentLessonsArchive(student.id);
    setAllStudentLessons(sortLessonsAsc(list));
  };

  const handleAdjustBalance = async (delta: number) => {
    hapticNotification('success');
    try {
      const newBal = await topUpStudentBalance(student.id, delta);
      setLessonsBalance(newBal);
      showToast({ message: `Баланс: ${newBal} ур.`, tone: 'success' });
      calculateStudentBilling(student.id).then(setBillingCalc).catch(() => {});
      await onRefresh?.();
    } catch {
      setLessonsBalance((prev) => prev + delta);
    }
  };

  const unmarkedLessons = useMemo(
    () =>
      allStudentLessons.filter((l) => {
        const d = getLessonDateStr(l);
        return d <= todayStr && (l.status === 'planned' || (l.status as string) === 'scheduled');
      }),
    [allStudentLessons, todayStr]
  );

  // 1-Tap Quick Status Switching with Idempotent Balance Updates
  const handleQuickLessonStatus = async (lessonId: string, targetStatus: LessonStatus) => {
    hapticImpact('medium');

    const currentLesson = allStudentLessons.find((l) => l.id === lessonId);

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
    setAllStudentLessons((prev) =>
      prev.map((l) => (l.id === lessonId ? { ...l, status: targetStatus } : l))
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

    setLessonsBalance((prev) => prev - countToDeduct);
    setAllStudentLessons((prev) =>
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

  // Retroactive package preview slots (only when newPkgStartDate < todayStr)
  const retroSlotsPreview = useMemo(() => {
    if (!newPkgStartDate || newPkgStartDate >= todayStr) return [];

    const slots =
      recurringSlots.length > 0 ? recurringSlots : student.recurring_schedule || [];
    if (slots.length === 0) return [];

    const normalizedSlots = slots.map((s) => ({
      dayOfWeek: Number(s.dayOfWeek),
      start: (s.startTime || '16:00').substring(0, 5),
      end: (s.endTime || '17:30').substring(0, 5),
    }));

    const items: Array<{ date: string; dow: number; timeStr: string }> = [];
    let cur = newPkgStartDate;

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
  }, [newPkgStartDate, recurringSlots, student.recurring_schedule, todayStr]);

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
  const retroRemainingBalance = newPkgCount - retroCompletedCount;

  const openNewPackagePanel = (preferredMode?: 'reset' | 'add' | 'keep') => {
    hapticImpact('light');
    const targetSize = monthlyTarget || 12;
    setNewPkgStartDate(todayStr);
    setNewPkgCount(targetSize);
    setRetroExcludedDates([]);
    if (preferredMode) {
      setNewPkgBalanceMode(preferredMode);
    } else if (lessonsBalance >= targetSize) {
      setNewPkgBalanceMode('keep');
    } else {
      setNewPkgBalanceMode('reset');
    }
    setIsNewPackagePanelOpen(true);
  };

  const handleApplyNewPackage = async () => {
    if (!newPkgStartDate || isApplyingNewPkg) return;
    setIsApplyingNewPkg(true);
    hapticNotification('success');
    const pkgSize = Math.max(1, Number(newPkgCount) || 12);

    try {
      if (newPkgStartDate < todayStr) {
        const { finalBalance } = await initializePackageFromPastDate(
          student.id,
          newPkgStartDate,
          pkgSize,
          retroExcludedDates
        );
        setLessonsBalance(finalBalance);
        setBillingType('package');
        setMonthlyTarget(pkgSize);
        setBillingDay(newPkgStartDate);
        setIsNewPackagePanelOpen(false);
        showToast({ message: `Пакет применён · баланс ${finalBalance} ур.`, tone: 'success' });
      } else {
        const { finalBalance, startDate } = await startNewPackageForStudent(student.id, {
          startDate: newPkgStartDate,
          packageSize: pkgSize,
          balanceMode: newPkgBalanceMode,
        });
        setLessonsBalance(finalBalance);
        setBillingType('package');
        setMonthlyTarget(pkgSize);
        setBillingDay(startDate);
        setIsNewPackagePanelOpen(false);
        showToast({
          message: `Новый пакет ${pkgSize} ур. с ${formatShortRuDate(startDate)} · баланс ${finalBalance} ур.`,
          tone: 'success',
        });
      }
      await Promise.all([refreshAllLessons(), Promise.resolve(onRefresh?.())]);
      calculateStudentBilling(student.id).then(setBillingCalc).catch(() => {});
    } catch (e: unknown) {
      showToast({
        message:
          e instanceof Error && e.message ? e.message : 'Ошибка запуска нового пакета',
        tone: 'error',
      });
    } finally {
      setIsApplyingNewPkg(false);
    }
  };

  const handleCopyInvoice = async () => {
    hapticImpact('light');
    try {
      const [calc, settings] = await Promise.all([
        billingCalc ? Promise.resolve(billingCalc) : calculateStudentBilling(student.id),
        getTutorSettings(),
      ]);
      const msg = buildParentInvoiceMessage(
        {
          name: studentName,
          lesson_rate: lessonRate,
          lessons_balance: lessonsBalance,
          monthly_target_lessons: monthlyTarget,
        },
        calc,
        settings
      );
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(msg);
        setCopyState('invoice');
        hapticNotification('success');
        showToast({ message: `Счёт для ${studentName} скопирован`, tone: 'success' });
        setTimeout(() => setCopyState(null), 2000);
      }
    } catch (e) {
      console.error('Copy invoice failed:', e);
      showToast({ message: 'Не удалось скопировать счёт', tone: 'error' });
    }
  };

  const handleCopyParentReport = async () => {
    hapticImpact('light');
    setIsCopyingReport(true);
    try {
      const report = await generateStudentReport(student.id);
      if (report?.parentForwardText && navigator.clipboard) {
        await navigator.clipboard.writeText(report.parentForwardText);
        setCopyState('report');
        hapticNotification('success');
        showToast({ message: 'Отчёт для родителей скопирован', tone: 'success' });
        setTimeout(() => setCopyState(null), 2000);
      }
    } catch (e) {
      console.error('Copy report failed:', e);
      showToast({ message: 'Не удалось скопировать отчёт', tone: 'error' });
    } finally {
      setIsCopyingReport(false);
    }
  };

  // Active cycle / package summary (single source of truth)
  const cycleSummary = useMemo(
    () =>
      computeStudentCycleSummary(
        {
          id: student.id,
          billing_type: billingType,
          billing_day: billingDay,
          monthly_target_lessons: monthlyTarget,
          lessons_balance: lessonsBalance,
          recurring_schedule: recurringSlots,
        },
        allStudentLessons,
        todayStr
      ),
    [
      student.id,
      billingType,
      billingDay,
      monthlyTarget,
      lessonsBalance,
      recurringSlots,
      allStudentLessons,
      todayStr,
    ]
  );

  const archivePeriods = useMemo(
    () =>
      buildArchivePeriods(
        {
          id: student.id,
          billing_type: billingType,
          billing_day: billingDay,
          monthly_target_lessons: monthlyTarget,
          lessons_balance: lessonsBalance,
          recurring_schedule: recurringSlots,
        },
        allStudentLessons,
        studentPayments,
        cycleSummary.startDate,
        todayStr
      ),
    [
      student.id,
      billingType,
      billingDay,
      monthlyTarget,
      lessonsBalance,
      recurringSlots,
      allStudentLessons,
      studentPayments,
      cycleSummary.startDate,
      todayStr,
    ]
  );

  const activeArchivePeriod = useMemo(
    () => archivePeriods.find((p) => p.id === selectedArchiveId) || archivePeriods[0] || null,
    [archivePeriods, selectedArchiveId]
  );

  const handleCopyArchiveReport = async () => {
    if (!activeArchivePeriod) return;
    hapticImpact('light');
    setIsCopyingArchiveReport(true);
    try {
      const report = await generateStudentReport(student.id, {
        startDate: activeArchivePeriod.startDate,
        endDate: activeArchivePeriod.endDate,
        label: activeArchivePeriod.label,
      });
      if (report?.parentForwardText && navigator.clipboard) {
        await navigator.clipboard.writeText(report.parentForwardText);
        setCopyState('archive_report');
        hapticNotification('success');
        showToast({ message: 'Отчёт за выбранный период скопирован', tone: 'success' });
        setTimeout(() => setCopyState(null), 2000);
      }
    } catch (e) {
      console.error('Copy archive report failed:', e);
      showToast({ message: 'Не удалось скопировать отчёт', tone: 'error' });
    } finally {
      setIsCopyingArchiveReport(false);
    }
  };

  // Current cycle partitioned lists
  const todayCycleLessons = useMemo(
    () => cycleSummary.cycleLessons.filter((l) => getLessonDateStr(l) === todayStr),
    [cycleSummary.cycleLessons, todayStr]
  );

  const remainingPlannedInCycle = useMemo(
    () =>
      cycleSummary.cycleLessons.filter((l) => {
        const d = getLessonDateStr(l);
        return d > todayStr && classifyLessonKind(l) === 'planned';
      }),
    [cycleSummary.cycleLessons, todayStr]
  );

  const pastCycleLessonsDesc = useMemo(
    () =>
      cycleSummary.cycleLessons
        .filter((l) => getLessonDateStr(l) < todayStr)
        .slice()
        .reverse(),
    [cycleSummary.cycleLessons, todayStr]
  );

  const filteredCycleLessons = useMemo(() => {
    if (cycleSubFilter === 'all') return cycleSummary.cycleLessons;
    if (cycleSubFilter === 'completed') {
      return cycleSummary.cycleLessons
        .filter((l) => classifyLessonKind(l) === 'completed')
        .slice()
        .reverse();
    }
    if (cycleSubFilter === 'missed') {
      return cycleSummary.cycleLessons
        .filter((l) => {
          const kind = classifyLessonKind(l);
          return kind === 'excused' || kind === 'penalty';
        })
        .slice()
        .reverse();
    }
    return cycleSummary.cycleLessons.filter((l) => classifyLessonKind(l) === 'planned');
  }, [cycleSummary.cycleLessons, cycleSubFilter]);

  // Future lessons for "Будущие" tab
  const upcomingWindowLessons = useMemo(() => {
    const endHorizonStr = addDaysStr(todayStr, upcomingHorizonDays);
    return allStudentLessons.filter((l) => {
      const d = getLessonDateStr(l);
      return d >= todayStr && d <= endHorizonStr;
    });
  }, [allStudentLessons, todayStr, upcomingHorizonDays]);

  const upcomingClosingCount = useMemo(() => {
    if (billingType !== 'package') return 0;
    return upcomingWindowLessons.filter((l) => Boolean(cycleSummary.plannedSlotNumbers[l.id]))
      .length;
  }, [billingType, upcomingWindowLessons, cycleSummary.plannedSlotNumbers]);

  // Archive period lessons & stats
  const archivePeriodLessons = useMemo(() => {
    if (!activeArchivePeriod) return [];
    return allStudentLessons
      .filter((l) => {
        const d = getLessonDateStr(l);
        return d >= activeArchivePeriod.startDate && d <= activeArchivePeriod.endDate;
      })
      .slice()
      .reverse();
  }, [allStudentLessons, activeArchivePeriod]);

  const archivePeriodStats = useMemo(() => {
    let completed = 0;
    let penalty = 0;
    let excused = 0;
    let planned = 0;
    for (const l of archivePeriodLessons) {
      const k = classifyLessonKind(l);
      if (k === 'completed') completed++;
      else if (k === 'penalty') penalty++;
      else if (k === 'excused') excused++;
      else planned++;
    }
    return { completed, penalty, excused, planned };
  }, [archivePeriodLessons]);

  const handleSaveAllSettings = async () => {
    if (isSaving) return;
    if (!studentName.trim()) {
      showToast({ message: 'Пожалуйста, введите имя ученика', tone: 'warning' });
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
    } catch (e: unknown) {
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
    setAllStudentLessons((prev) =>
      prev.map((l) =>
        l.id === editingReasonLesson.id ? { ...l, miss_reason: reasonInput.trim() } : l
      )
    );
    setEditingReasonLesson(null);
  };

  // Render a single lesson card in the student's timeline
  const renderLessonCard = (
    l: Lesson,
    options?: { slotLabel?: PlannedSlotLabel; isNextPackage?: boolean }
  ) => {
    const isCompleted = l.status === 'completed';
    const isPenalty =
      l.status === 'missed_penalty' || (l.status === 'missed' && !l.needs_makeup);
    const isExcused =
      l.status === 'missed_excused' || (l.status === 'missed' && l.needs_makeup);
    const isPlanned = !isCompleted && !isPenalty && !isExcused;
    const dateParsed = parseISO(l.date);
    const hasCustomNote = isRealNote(l.notes);
    const slotLabel = options?.slotLabel;
    const isNextPackage = options?.isNextPackage;

    return (
      <div
        key={l.id}
        onClick={() => {
          if (onOpenLesson) {
            hapticImpact('light');
            onOpenLesson(l);
          }
        }}
        className={`p-3 rounded-2xl border transition-colors cursor-pointer active:scale-[0.99] space-y-2 ${
          isCompleted
            ? 'bg-white border-emerald-200/80'
            : isPenalty
            ? 'bg-white border-[#F6BFA9]'
            : isExcused
            ? 'bg-[#F5F3EE] border-[#E7E2D8] opacity-80'
            : 'bento-card-soft border-[#E7E2D8]/90'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-xs font-semibold text-slate-900">
              {format(dateParsed, 'd MMM', { locale: ru })}
            </span>
            <span className="text-[11px] font-semibold text-slate-400 uppercase">
              {format(dateParsed, 'EEEEEE', { locale: ru })}
            </span>
            <span className="text-slate-300">•</span>
            <div className="flex items-center gap-1 tabular-nums text-xs text-slate-700 font-semibold">
              <span>{l.time_str || '16:00 - 17:30'}</span>
            </div>
          </div>

          <div className="shrink-0">
            {isCompleted && (
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg tabular-nums">
                -1 ур.
              </span>
            )}
            {isPenalty && (
              <span className="text-[10px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-lg tabular-nums">
                -1 ур.
              </span>
            )}
            {isExcused && (
              <span className="text-[10px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg tabular-nums">
                0 ур.
              </span>
            )}
            {isPlanned && slotLabel && (
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg tabular-nums border ${
                  slotLabel.isFinal
                    ? 'text-indigo-700 bg-indigo-50 border-indigo-200'
                    : 'text-blue-700 bg-blue-50 border-blue-200/70'
                }`}
              >
                {slotLabel.index}/{slotLabel.total}
                {slotLabel.isFinal ? ' · финал' : ''}
              </span>
            )}
            {isPlanned && !slotLabel && isNextPackage && (
              <span className="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-lg">
                След. пакет
              </span>
            )}
            {isPlanned && !slotLabel && !isNextPackage && (
              <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">
                План
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
                <Edit2 className="w-2.5 h-2.5" aria-hidden="true" />
              </button>
            ) : (
              <span />
            )}

            {hasCustomNote && (
              <div className="text-[11px] text-slate-600 bg-amber-50/70 px-2 py-0.5 rounded-md truncate max-w-[220px]">
                {l.notes}
              </div>
            )}
          </div>
        )}

        {/* 1-Tap Quick Attendance Status Switcher */}
        <div
          className="flex items-center gap-1 pt-1.5 border-t border-slate-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => handleQuickLessonStatus(l.id, 'completed')}
            className={`touch-hit flex-1 h-8 px-1.5 rounded-lg font-semibold text-[11px] flex items-center justify-center gap-1 transition-all active:scale-95 ${
              isCompleted
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-slate-50 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700'
            }`}
          >
            <Check className="w-3 h-3 stroke-[2.5]" aria-hidden="true" />
            <span>Был</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickLessonStatus(l.id, 'missed_penalty')}
            className={`touch-hit flex-1 h-8 px-1.5 rounded-lg font-semibold text-[11px] flex items-center justify-center gap-1 transition-all active:scale-95 ${
              isPenalty
                ? 'bg-orange-500 text-white shadow-2xs'
                : 'bg-slate-50 hover:bg-orange-50 text-slate-600 hover:text-orange-700'
            }`}
          >
            <Flame className="w-3 h-3" aria-hidden="true" />
            <span>Сгорел</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickLessonStatus(l.id, 'missed_excused')}
            className={`touch-hit flex-1 h-8 px-1.5 rounded-lg font-semibold text-[11px] flex items-center justify-center gap-1 transition-all active:scale-95 ${
              isExcused
                ? 'bg-rose-500 text-white shadow-2xs'
                : 'bg-slate-50 hover:bg-rose-50 text-slate-600 hover:text-rose-700'
            }`}
          >
            <Ban className="w-3 h-3" aria-hidden="true" />
            <span>Отмена</span>
          </button>

          {!isPlanned && (
            <button
              type="button"
              onClick={() => handleQuickLessonStatus(l.id, 'planned')}
              className="touch-hit h-8 px-2 rounded-lg font-semibold text-[11px] bg-slate-50 hover:bg-blue-50 text-slate-500 hover:text-blue-700 inline-flex items-center gap-1 transition-all active:scale-95"
              title="Вернуть в план"
              aria-label="Вернуть в план"
            >
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              <span>План</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#F7F5F0] flex flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 pt-safe pb-2.5 bg-white border-b border-[#E7E2D8]">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            hapticImpact('light');
            onBack();
          }}
          className="touch-hit w-9 h-9 flex items-center justify-center rounded-full bg-[#F2EFE9] text-[#44403C] active:scale-90 transition-transform"
          title="Назад"
          aria-label="Назад к списку учеников"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={2.5} aria-hidden="true" />
        </button>

        <div className="text-center min-w-0 px-2">
          <div className="flex items-center justify-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: studentColor }}
            />
            <h2 className="text-base font-semibold text-[#1C1917] leading-tight truncate">
              {studentName}
            </h2>
          </div>
          <span className="text-[11px] text-[#78716C] font-medium block tabular-nums">
            {lessonRate.toLocaleString('ru-RU')} сум/ур. •{' '}
            {billingType === 'package'
              ? `Пакет · с ${formatShortRuDate(cycleSummary.startDate)}`
              : `Оплата ${extractBillingDayNumber(billingDay)}-го`}
          </span>
        </div>

        {/* Right Header Action: Contact icons on Archive tab, Save button on Settings tab */}
        {activeTab === 'settings' ? (
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSaveAllSettings}
            className="h-9 px-3.5 flex items-center justify-center gap-1 rounded-full bg-[#2F6FED] disabled:opacity-50 text-white text-xs font-semibold shadow-xs active:scale-90 transition-transform"
            title="Сохранить настройки"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[2.5]" />
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
                aria-label="Открыть Telegram ученика"
                className="touch-hit w-9 h-9 rounded-full bg-[#EEF3FE] text-[#2F6FED] flex items-center justify-center active:scale-90 transition-transform"
                title="Открыть Telegram ученика"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
              </a>
            )}
            {studentPhone && (
              <a
                href={`tel:${studentPhone}`}
                aria-label="Позвонить ученику"
                className="touch-hit w-9 h-9 rounded-full bg-[#E7F7F0] text-emerald-700 flex items-center justify-center active:scale-90 transition-transform"
                title="Позвонить ученику"
              >
                <Phone className="w-4 h-4" aria-hidden="true" />
              </a>
            )}
            {!tgUrl && !studentPhone && (
              <button
                type="button"
                aria-label="Настройки профиля"
                onClick={() => {
                  hapticImpact('light');
                  setActiveTab('settings');
                }}
                className="touch-hit w-9 h-9 rounded-full bg-[#F2EFE9] text-[#57534E] flex items-center justify-center active:scale-90 transition-transform"
                title="Настройки профиля"
              >
                <Settings className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs Switcher */}
      <div className="flex bg-white px-4 py-2 gap-1.5 border-b border-[#E7E2D8]">
        <button
          type="button"
          onClick={() => {
            hapticImpact('light');
            setActiveTab('archive');
          }}
          className={`flex-1 text-xs font-semibold py-2 rounded-full transition-colors ${
            activeTab === 'archive'
              ? 'bg-[#1C1917] text-white shadow-2xs'
              : 'text-[#57534E] bg-[#F2EFE9] hover:bg-[#EAE5DC]'
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
          className={`flex-1 text-xs font-semibold py-2 rounded-full transition-colors ${
            activeTab === 'settings'
              ? 'bg-[#1C1917] text-white shadow-2xs'
              : 'text-[#57534E] bg-[#F2EFE9] hover:bg-[#EAE5DC]'
          }`}
        >
          Профиль и расписание
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-3.5 pb-24 space-y-3">
        {activeTab === 'archive' && (
          <div className="space-y-3">
            {/* UNIFIED COMPACT FINANCIAL & ACTIONS CARD */}
            <div className="bento-card rounded-3xl p-4 space-y-3">
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
                      className={`text-xl font-bold leading-none tabular-nums ${
                        lessonsBalance <= 0 ? 'text-rose-600' : 'text-slate-900'
                      }`}
                    >
                      {lessonsBalance}{' '}
                      <span className="text-xs text-slate-500 font-semibold">ур.</span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleAdjustBalance(-1)}
                    className="touch-hit h-9 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs flex items-center active:scale-95 tabular-nums"
                    title="Списать 1 урок"
                  >
                    -1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdjustBalance(1)}
                    className="touch-hit h-9 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold text-xs flex items-center gap-0.5 active:scale-95 tabular-nums"
                    title="Добавить 1 урок"
                  >
                    +1
                  </button>
                  <button
                    type="button"
                    onClick={handleTriggerPaymentModal}
                    className="touch-hit h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center gap-1 shadow-2xs active:scale-95 tabular-nums"
                    title="Зафиксировать оплату"
                  >
                    <Plus className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                    <span>Оплата</span>
                  </button>
                </div>
              </div>

              {/* Row 2: Active Cycle / Package Summary Card */}
              <div className="p-3 rounded-2xl bg-[#F7F5F0] border border-[#E7E2D8] space-y-2.5 tabular-nums">
                <div className="flex items-center justify-between gap-2 text-xs">
                  {billingType === 'package' ? (
                    <>
                      <span className="text-slate-700 font-semibold truncate">
                        📦 Пакет · с {formatShortRuDate(cycleSummary.startDate)}
                      </span>
                      {cycleSummary.isExhausted ? (
                        <span
                          className={`font-semibold shrink-0 ${
                            cycleSummary.debtLessons > 0 ? 'text-rose-700' : 'text-amber-700'
                          }`}
                        >
                          {cycleSummary.debtLessons > 0
                            ? `Долг ${cycleSummary.debtLessons} ур.`
                            : 'Завершён'}
                        </span>
                      ) : cycleSummary.estimatedEndDate ? (
                        <span className="text-indigo-700 font-semibold shrink-0">
                          до ~{formatShortRuDate(cycleSummary.estimatedEndDate)}
                        </span>
                      ) : (
                        <span className="text-slate-500 font-medium shrink-0">
                          Ост. {cycleSummary.remainingLessons} ур.
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="text-slate-700 font-semibold truncate">
                        📅 Цикл {billingPeriod.startShort} – {billingPeriod.endShort}
                      </span>
                      {billingCalc ? (
                        <span className="text-emerald-700 font-semibold shrink-0">
                          К оплате: {billingCalc.netAmount?.toLocaleString('ru-RU')} сум
                        </span>
                      ) : (
                        <span className="text-slate-500 font-medium shrink-0">
                          {cycleSummary.totalLessons} ур.
                        </span>
                      )}
                    </>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-semibold">
                    <span className="text-slate-700">
                      {cycleSummary.usedLessons} из {cycleSummary.totalLessons} ур. ({cycleSummary.progressPct}%)
                    </span>
                    {cycleSummary.prepaidExtraLessons > 0 && (
                      <span className="text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.5 rounded-md text-[10px]">
                        +{cycleSummary.prepaidExtraLessons} след. пакет
                      </span>
                    )}
                  </div>
                  <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        billingType === 'package' && cycleSummary.isExhausted
                          ? 'bg-rose-500'
                          : billingType === 'package' && cycleSummary.remainingLessons <= 2
                          ? 'bg-amber-500'
                          : 'bg-blue-600'
                      }`}
                      style={{ width: `${cycleSummary.progressPct}%` }}
                    />
                  </div>
                </div>

                {/* 4 Cycle Stat Pills */}
                <div className="grid grid-cols-4 gap-1.5 text-[11px] font-semibold">
                  <div className="px-2 py-1 rounded-lg bg-white border border-slate-200/70 text-emerald-700 text-center">
                    ✅ {cycleSummary.completedLessons}
                    <span className="block text-[9px] text-slate-400 font-medium">Был</span>
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-white border border-slate-200/70 text-orange-700 text-center">
                    🔥 {cycleSummary.penaltyLessons}
                    <span className="block text-[9px] text-slate-400 font-medium">Сгорел</span>
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-white border border-slate-200/70 text-rose-700 text-center">
                    🛑 {cycleSummary.excusedLessons}
                    <span className="block text-[9px] text-slate-400 font-medium">Отмены</span>
                  </div>
                  <div className="px-2 py-1 rounded-lg bg-white border border-slate-200/70 text-blue-700 text-center">
                    ⏳ {cycleSummary.remainingLessons}
                    <span className="block text-[9px] text-slate-400 font-medium">
                      {billingType === 'package' ? 'Осталось' : 'План'}
                    </span>
                  </div>
                </div>

                {billingType === 'package' &&
                  cycleSummary.isExhausted &&
                  cycleSummary.prepaidExtraLessons > 0 && (
                    <button
                      type="button"
                      onClick={() => openNewPackagePanel('keep')}
                      className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.99] transition-all"
                    >
                      <Package className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Начать новый пакет ({lessonsBalance} ур. на балансе)</span>
                    </button>
                  )}
              </div>

              {/* Row 3: Unified Parent Copy & New Package Bar */}
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
                    if (isNewPackagePanelOpen) {
                      hapticImpact('light');
                      setIsNewPackagePanelOpen(false);
                    } else {
                      openNewPackagePanel();
                    }
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] font-bold border flex items-center justify-center gap-1 active:scale-95 transition-all ${
                    isNewPackagePanelOpen
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-indigo-50/80 hover:bg-indigo-100 text-indigo-700 border-indigo-200/80'
                  }`}
                  title="Запустить новый пакет с сегодняшней или прошлой даты"
                >
                  <Package className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Новый пакет</span>
                </button>
              </div>
            </div>

            {/* New Package / Retroactive Package Inline Panel */}
            {isNewPackagePanelOpen && (
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-indigo-200 space-y-3 animate-in fade-in-50 duration-150">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <h4 className="text-xs font-semibold text-slate-900">
                      Новый пакет уроков
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsNewPackagePanelOpen(false)}
                    className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-slate-400"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-[11px] text-slate-500 leading-snug">
                  {newPkgStartDate < todayStr
                    ? 'Прошлая дата: заполнит уроки по расписанию с выбранного дня, отметит проведённые и пересчитает остаток.'
                    : 'Текущая или будущая дата: запустит отсчёт нового пакета и обновит дату старта.'}
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                      Дата старта пакета
                    </label>
                    <input
                      type="date"
                      value={newPkgStartDate}
                      onChange={(e) => setNewPkgStartDate(e.target.value)}
                      className="w-full text-xs font-bold text-slate-900 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                      Уроков в пакете
                    </label>
                    <input
                      type="number"
                      value={newPkgCount}
                      min={1}
                      max={100}
                      onChange={(e) => setNewPkgCount(Number(e.target.value))}
                      className="w-full text-xs font-semibold tabular-nums text-slate-900 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 focus:outline-hidden"
                    />
                  </div>
                </div>

                {newPkgStartDate < todayStr ? (
                  <>
                    {/* Retroactive Slots Preview & Exclude toggles */}
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
                    <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs flex items-center justify-between tabular-nums">
                      <span className="text-slate-700 font-semibold">
                        Проведено: <b>{retroCompletedCount} ур.</b>
                      </span>
                      <span className="font-semibold text-indigo-800">
                        Остаток на сегодня: {retroRemainingBalance} ур.
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="space-y-1.5 pt-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Что сделать со старым балансом ({lessonsBalance} ур.)?
                    </span>
                    <div className="space-y-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          hapticImpact('light');
                          setNewPkgBalanceMode('reset');
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-semibold transition-all tabular-nums ${
                          newPkgBalanceMode === 'reset'
                            ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        Начать с нуля (= {Math.max(1, Number(newPkgCount) || 12)} ур.)
                      </button>

                      {lessonsBalance !== 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            hapticImpact('light');
                            setNewPkgBalanceMode('add');
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-semibold transition-all tabular-nums ${
                            newPkgBalanceMode === 'add'
                              ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                              : 'bg-slate-50 border-slate-200 text-slate-700'
                          }`}
                        >
                          Добавить к остатку ({lessonsBalance} + {Math.max(1, Number(newPkgCount) || 12)} ={' '}
                          {lessonsBalance + Math.max(1, Number(newPkgCount) || 12)} ур.)
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          hapticImpact('light');
                          setNewPkgBalanceMode('keep');
                        }}
                        className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-semibold transition-all tabular-nums ${
                          newPkgBalanceMode === 'keep'
                            ? 'bg-indigo-50 border-indigo-400 text-indigo-900'
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        Только дата старта (баланс {lessonsBalance} ур. не менять)
                      </button>
                    </div>
                  </div>
                )}

                {/* Submit Action */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsNewPackagePanelOpen(false)}
                    className="flex-1 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={
                      isApplyingNewPkg ||
                      (newPkgStartDate < todayStr && retroSlotsPreview.length === 0)
                    }
                    onClick={handleApplyNewPackage}
                    className="flex-2 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold shadow-sm active:scale-95 transition-all"
                  >
                    {isApplyingNewPkg
                      ? 'Применение...'
                      : newPkgStartDate < todayStr
                      ? 'Применить и пересчитать'
                      : 'Запустить пакет'}
                  </button>
                </div>
              </div>
            )}

            {/* Compact Payment History Block */}
            <div className="bento-card rounded-3xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold text-slate-800">История оплат</span>
                  {studentPayments.length > 0 && (
                    <span className="text-[11px] font-semibold text-slate-400 tabular-nums">
                      ({studentPayments.length})
                    </span>
                  )}
                </div>

                {studentPayments.length > 3 && (
                  <button
                    type="button"
                    onClick={() => {
                      hapticImpact('light');
                      setShowAllPayments((prev) => !prev);
                    }}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                  >
                    {showAllPayments ? 'Свернуть' : `Все (${studentPayments.length})`}
                  </button>
                )}
              </div>

              {isLoadingPayments ? (
                <div className="py-3 text-center text-[11px] text-slate-400 font-medium">
                  Загрузка оплат...
                </div>
              ) : studentPayments.length === 0 ? (
                <div className="py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-slate-500 font-medium">
                    Платежей пока нет
                  </span>
                  <button
                    type="button"
                    onClick={handleTriggerPaymentModal}
                    className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800"
                  >
                    + Записать оплату
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(showAllPayments ? studentPayments : studentPayments.slice(0, 3)).map((p) => {
                    const isConfirming = confirmDeletePaymentId === p.id;
                    const isDeleting = deletingPaymentId === p.id;
                    const badgeStyle =
                      PAYMENT_METHOD_BADGE_STYLES[p.payment_method] || PAYMENT_METHOD_BADGE_STYLES.payme;
                    const methodLabel = PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method;

                    return (
                      <div
                        key={p.id}
                        className="rounded-xl bg-slate-50/90 border border-slate-200/70 px-3 py-2 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-slate-900 tabular-nums">
                                {p.amount_uzs.toLocaleString('ru-RU')} сум
                              </span>
                              {p.lessons_added > 0 && (
                                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-1.5 py-0.2 rounded-md tabular-nums">
                                  +{p.lessons_added} ур.
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-semibold px-1.5 py-0.2 rounded-md border ${badgeStyle}`}
                              >
                                {methodLabel}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 mt-0.5 truncate">
                              <span className="tabular-nums">{formatTashkentPaymentDate(p.paid_at)}</span>
                              {p.note && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="truncate">{p.note}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              hapticImpact('light');
                              setConfirmDeletePaymentId((prev) => (prev === p.id ? null : p.id));
                            }}
                            aria-label="Удалить платёж"
                            title="Удалить ошибочный платёж"
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors active:scale-90 ${
                              isConfirming
                                ? 'bg-rose-100 text-rose-700'
                                : 'text-slate-400 hover:bg-rose-50 hover:text-rose-600'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {isConfirming && (
                          <div className="pt-1.5 border-t border-slate-200/80 flex items-center justify-between gap-2">
                            <span className="text-[11px] text-rose-700 font-medium leading-tight tabular-nums">
                              Удалить{p.lessons_added > 0 ? ` и списать ${p.lessons_added} ур.` : ''}?
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => setConfirmDeletePaymentId(null)}
                                className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold"
                              >
                                Отмена
                              </button>
                              <button
                                type="button"
                                disabled={isDeleting}
                                onClick={() => handleDeletePayment(p)}
                                className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white text-[11px] font-bold flex items-center gap-1"
                              >
                                {isDeleting ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <span>Удалить</span>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* "⏳ Неотмеченные прошлые уроки (N)" Alert Banner */}
            {unmarkedLessons.length > 0 && (
              <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-amber-900 font-semibold text-xs tabular-nums">
                    ⏳ Не отмечено: {unmarkedLessons.length}
                  </span>
                  <button
                    type="button"
                    onClick={handleMarkAllPastAsCompleted}
                    className="px-2.5 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] shadow-2xs active:scale-95 transition-all tabular-nums"
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
                          <span className="text-[11px] font-semibold text-slate-900 block">
                            {format(d, 'd MMM, EEE', { locale: ru })}
                          </span>
                          <span className="text-[10px] text-slate-400 tabular-nums block">
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

            {/* SIMPLIFIED 3-TAB SCHEDULE & ARCHIVE SECTION */}
            <div className="bento-card rounded-3xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-800">Расписание ученика</span>
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

              {/* 3 Main Views: Current Cycle | Upcoming | Archive */}
              <div className="flex bg-slate-100 p-0.5 rounded-xl gap-0.5">
                {(
                  [
                    {
                      id: 'current',
                      label: billingType === 'package' ? 'Текущий пакет' : 'Текущий период',
                    },
                    { id: 'upcoming', label: 'Будущие' },
                    { id: 'archive', label: 'Архив' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      hapticImpact('light');
                      setScheduleView(tab.id);
                    }}
                    className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                      scheduleView === tab.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Sub-filters for Current Cycle */}
              {scheduleView === 'current' && (
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 tabular-nums">
                  {(
                    [
                      { id: 'all', label: `Все (${cycleSummary.cycleLessons.length})` },
                      { id: 'completed', label: `✅ Был (${cycleSummary.completedLessons})` },
                      {
                        id: 'missed',
                        label: `🛑 Отмены и пропуски (${cycleSummary.excusedLessons + cycleSummary.penaltyLessons})`,
                      },
                      {
                        id: 'remaining',
                        label: `⏳ Осталось (${cycleSummary.cycleLessons.filter((l) => classifyLessonKind(l) === 'planned').length})`,
                      },
                    ] as const
                  ).map((chip) => (
                    <button
                      key={chip.id}
                      type="button"
                      onClick={() => {
                        hapticImpact('light');
                        setCycleSubFilter(chip.id);
                      }}
                      className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all active:scale-95 ${
                        cycleSubFilter === chip.id
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Sub-controls for Upcoming */}
              {scheduleView === 'upcoming' && (
                <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px] tabular-nums">
                  <span className="text-slate-600 font-medium">
                    За {upcomingHorizonDays} дн: <b>{upcomingWindowLessons.length} ур.</b>
                    {billingType === 'package' && upcomingClosingCount > 0
                      ? ` (${upcomingClosingCount} закрывают пакет)`
                      : ''}
                  </span>
                  <div className="flex bg-slate-100 p-0.5 rounded-lg gap-0.5 shrink-0">
                    {([30, 60] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => {
                          hapticImpact('light');
                          setUpcomingHorizonDays(d);
                        }}
                        className={`px-2 py-0.5 rounded-md font-bold transition-all ${
                          upcomingHorizonDays === d
                            ? 'bg-white text-slate-900 shadow-2xs'
                            : 'text-slate-500'
                        }`}
                      >
                        {d}д
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sub-controls for Archive */}
              {scheduleView === 'archive' && archivePeriods.length > 0 && (
                <div className="space-y-2 pt-0.5">
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                    {archivePeriods.map((ap) => {
                      const isSelected = activeArchivePeriod?.id === ap.id;
                      return (
                        <button
                          key={ap.id}
                          type="button"
                          onClick={() => {
                            hapticImpact('light');
                            setSelectedArchiveId(ap.id);
                          }}
                          className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all active:scale-95 tabular-nums ${
                            isSelected
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {ap.label}
                        </button>
                      );
                    })}
                  </div>

                  {activeArchivePeriod && (
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-[11px] tabular-nums">
                      <div className="flex items-center gap-2 font-semibold flex-wrap">
                        <span className="text-emerald-700">✅ {archivePeriodStats.completed}</span>
                        <span className="text-orange-700">🔥 {archivePeriodStats.penalty}</span>
                        <span className="text-rose-700">🛑 {archivePeriodStats.excused}</span>
                        <span className="text-slate-500">Всего: {archivePeriodLessons.length}</span>
                      </div>
                      <button
                        type="button"
                        disabled={isCopyingArchiveReport}
                        onClick={handleCopyArchiveReport}
                        className={`px-2.5 py-1 rounded-lg font-bold border flex items-center gap-1 shrink-0 active:scale-95 transition-all ${
                          copyState === 'archive_report'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {copyState === 'archive_report' ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <FileText className="w-3 h-3" />
                        )}
                        <span>
                          {copyState === 'archive_report'
                            ? 'Скопирован!'
                            : isCopyingArchiveReport
                            ? 'Готовлю...'
                            : 'Отчёт'}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Interactive Timeline Content */}
            <div className="space-y-3">
              {isLoadingLessons ? (
                <div className="bg-white rounded-2xl p-8 text-center text-slate-400 text-xs font-medium border border-slate-200/80">
                  Загрузка расписания...
                </div>
              ) : scheduleView === 'current' ? (
                cycleSummary.cycleLessons.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 text-center text-slate-400 text-xs font-medium border border-slate-200/80">
                    В текущем {billingType === 'package' ? 'пакете' : 'периоде'} пока нет уроков
                  </div>
                ) : cycleSubFilter === 'all' ? (
                  <div className="space-y-3">
                    {/* TODAY SECTION */}
                    {todayCycleLessons.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-px bg-blue-200" />
                          <div className="bg-blue-600 text-white text-[11px] font-semibold px-3 py-1 rounded-full shadow-2xs flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            <span>
                              Сегодня, {format(getTashkentNow(), 'd MMMM', { locale: ru })}
                            </span>
                            <span className="bg-blue-700 px-1.5 py-0.2 rounded-full text-[10px] tabular-nums">
                              {todayCycleLessons.length} ур.
                            </span>
                          </div>
                          <div className="flex-1 h-px bg-blue-200" />
                        </div>
                        <div className="space-y-2">
                          {todayCycleLessons.map((l) =>
                            renderLessonCard(l, {
                              slotLabel: cycleSummary.plannedSlotNumbers[l.id],
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {/* REMAINING IN CURRENT PACKAGE / PERIOD */}
                    {remainingPlannedInCycle.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-1">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            {billingType === 'package'
                              ? `Осталось в пакете (${remainingPlannedInCycle.length})`
                              : `Предстоящие в периоде (${remainingPlannedInCycle.length})`}
                          </span>
                          <div className="flex-1 h-px bg-slate-200" />
                        </div>
                        <div className="space-y-2">
                          {remainingPlannedInCycle.map((l) =>
                            renderLessonCard(l, {
                              slotLabel: cycleSummary.plannedSlotNumbers[l.id],
                            })
                          )}
                        </div>
                      </div>
                    )}

                    {/* PAST COMPLETED / MISSED IN THIS CYCLE (Newest first!) */}
                    {pastCycleLessonsDesc.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-1">
                          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            {billingType === 'package'
                              ? `Пройдено и отменено в пакете (${pastCycleLessonsDesc.length})`
                              : `Прошедшие в периоде (${pastCycleLessonsDesc.length})`}
                          </span>
                          <div className="flex-1 h-px bg-slate-200" />
                        </div>
                        <div className="space-y-2">
                          {pastCycleLessonsDesc.map((l) => renderLessonCard(l))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : filteredCycleLessons.length === 0 ? (
                  <div className="bg-white rounded-2xl p-6 text-center text-slate-400 text-xs font-medium border border-slate-200/80">
                    По выбранному фильтру уроков нет
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredCycleLessons.map((l) =>
                      renderLessonCard(l, {
                        slotLabel: cycleSummary.plannedSlotNumbers[l.id],
                      })
                    )}
                  </div>
                )
              ) : scheduleView === 'upcoming' ? (
                upcomingWindowLessons.length === 0 ? (
                  <div className="bg-white rounded-2xl p-8 text-center text-slate-400 text-xs font-medium border border-slate-200/80">
                    В ближайшие {upcomingHorizonDays} дней уроков не запланировано
                  </div>
                ) : (
                  <div className="space-y-2">
                    {upcomingWindowLessons.map((l) => {
                      const slotLabel = cycleSummary.plannedSlotNumbers[l.id];
                      const isNextPackage =
                        billingType === 'package' &&
                        !slotLabel &&
                        classifyLessonKind(l) === 'planned';
                      return renderLessonCard(l, { slotLabel, isNextPackage });
                    })}
                  </div>
                )
              ) : archivePeriods.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center text-slate-400 text-xs font-medium border border-slate-200/80">
                  Прошлых пакетов и периодов пока нет
                </div>
              ) : archivePeriodLessons.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 text-center text-slate-400 text-xs font-medium border border-slate-200/80">
                  За выбранный период уроков не найдено
                </div>
              ) : (
                <div className="space-y-2">
                  {archivePeriodLessons.map((l) => renderLessonCard(l))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Settings & Profile */}
        {activeTab === 'settings' && (
          <div className="space-y-3.5">
            {/* Recurring Schedule Editor (Placed at top of Settings because schedule changes happen most often) */}
            <div className="bento-card rounded-3xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Регулярное расписание</h4>
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
            <div className="bento-card rounded-3xl p-4 space-y-3">
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
            <div className="bento-card rounded-3xl p-4 space-y-3">
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
                    className="w-full text-xs font-semibold tabular-nums text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500"
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
                    className="w-full text-xs font-semibold tabular-nums text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500"
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
                    className="w-full text-xs font-semibold tabular-nums text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase block mb-1">
                    {billingType === 'package' ? 'Дата старта пакета' : 'День оплаты'}
                  </label>
                  {billingType === 'package' ? (
                    <input
                      type="date"
                      value={isIsoDateString(billingDay) ? billingDay : cycleSummary.startDate}
                      onChange={(e) => setBillingDay(e.target.value)}
                      className="w-full text-xs font-bold text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500"
                    />
                  ) : (
                    <input
                      type="text"
                      value={
                        isIsoDateString(billingDay)
                          ? String(extractBillingDayNumber(billingDay))
                          : billingDay
                      }
                      onChange={(e) => setBillingDay(e.target.value)}
                      placeholder="10 число"
                      className="w-full text-xs font-bold text-slate-900 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:border-blue-500"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Notes, Color & Active Status */}
            <div className="bento-card rounded-3xl p-4 space-y-3">
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
                className="w-full py-3.5 rounded-2xl bg-[#2F6FED] hover:bg-[#255CE0] disabled:opacity-50 text-white text-xs font-semibold shadow-sm flex items-center justify-center gap-2 active:scale-98 transition-colors"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Сохранение...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 stroke-[2.5]" />
                    <span>Сохранить изменения</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="w-full py-3 rounded-2xl bg-[#FDECE8] text-[#B93815] text-xs font-semibold border border-[#F6BFA9] flex items-center justify-center gap-1.5 active:scale-98"
              >
                <Trash2 className="w-4 h-4" aria-hidden="true" />
                <span>Удалить ученика</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        danger
        title="Удалить ученика?"
        description={`Ученик «${student.name}» и вся история его уроков будут удалены безвозвратно.`}
        confirmLabel="Удалить"
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => {
          setIsDeleteConfirmOpen(false);
          onDeleteStudent(student.id);
        }}
      />

      {/* Modal for editing Miss Reason */}
      {editingReasonLesson && (
        <div className="fixed inset-0 z-60 bg-black/45 flex items-end sm:items-center justify-center p-3">
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

      {!onOpenPaymentModal && (
        <AddPaymentModal
          isOpen={isLocalPaymentOpen}
          student={student}
          onClose={() => setIsLocalPaymentOpen(false)}
          onSaved={async ({ payment, newBalance }) => {
            setStudentPayments((prev) => [payment, ...prev]);
            setLessonsBalance(newBalance);
            calculateStudentBilling(student.id).then(setBillingCalc).catch(() => {});
            onPaymentsChanged?.();
            await onRefresh?.();
          }}
        />
      )}
    </div>
  );
};
