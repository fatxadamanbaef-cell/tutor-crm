import { supabase } from './supabase';
import { Student, Lesson, LessonStatus, RecurringSlot } from '@/types';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  addDaysStr,
  formatLongRuDate,
  getStudentBillingPeriod,
  getTashkentNow,
  getTashkentTodayStr,
} from './formatters';
import {
  classifyLessonKind,
  computeStudentCycleSummary,
  getLessonDateStr,
  type StudentCycleSummary,
} from './packageCycle';

export interface StudentAttendanceReport {
  student: Student;
  monthName: string;
  targetLessons: number;
  completedLessons: Lesson[];
  missedLessons: Lesson[];
  plannedLessons: Lesson[];
  pendingMakeups: Array<{ date: string; reason: string }>;
  telegramHtml: string;
  parentForwardText: string;
}

function formatRuDate(dateStr?: string): string {
  if (!dateStr) return 'Не указана';
  try {
    const raw = dateStr.includes('T') ? dateStr.substring(0, 10) : dateStr;
    const d = parseISO(raw);
    return format(d, 'd MMMM', { locale: ru });
  } catch {
    return dateStr;
  }
}

function formatRuDay(dateStr: string): string {
  try {
    const raw = dateStr.includes('T') ? dateStr.substring(0, 10) : dateStr;
    const d = parseISO(raw);
    const day = format(d, 'EEE', { locale: ru });
    return day.charAt(0).toUpperCase() + day.slice(1);
  } catch {
    return '';
  }
}

export function getLessonPlural(n: number): string {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return 'уроков';
  if (rem > 1 && rem < 5) return 'урока';
  if (rem === 1) return 'урок';
  return 'уроков';
}

export interface ReportDateRangeOptions {
  startDate?: string;
  endDate?: string;
  label?: string;
}

function mapReportLessonRow(
  l: {
    id: string;
    student_id: string;
    lesson_date: string;
    start_time?: string | null;
    end_time?: string | null;
    status: string;
    miss_reason?: string | null;
    needs_makeup?: boolean | null;
    is_makeup?: boolean | null;
    notes?: string | null;
    created_at: string;
  },
  studentName: string
): Lesson {
  const startTimeClean = (l.start_time || '18:00').substring(0, 5);
  const endTimeClean = (l.end_time || '19:30').substring(0, 5);
  const timeStr = `${startTimeClean} - ${endTimeClean}`;
  const isoDate = `${l.lesson_date}T${startTimeClean}:00+05:00`;

  const realStatus: LessonStatus =
    l.status === 'completed'
      ? 'completed'
      : l.status === 'planned' || l.status === 'scheduled'
      ? 'planned'
      : l.status === 'missed_penalty'
      ? 'missed_penalty'
      : l.status === 'missed_excused'
      ? 'missed_excused'
      : 'missed';

  return {
    id: l.id,
    student_id: l.student_id,
    student_name: studentName,
    date: isoDate,
    time_str: timeStr,
    status: realStatus,
    miss_reason: l.miss_reason || l.notes || undefined,
    needs_makeup: Boolean(l.needs_makeup),
    is_makeup: Boolean(l.is_makeup),
    notes: l.notes || '',
    created_at: l.created_at,
  };
}

/**
 * Generate attendance and archive report for a student.
 * - Default (no 2nd arg): uses the student's active cycle (current package or current billing_day cycle).
 * - With Date: legacy calendar month report.
 * - With { startDate, endDate, label }: custom archive period report.
 */
export async function generateStudentReport(
  studentId: string,
  targetOrOptions?: Date | ReportDateRangeOptions
): Promise<StudentAttendanceReport | null> {
  if (!supabase) return null;

  // 1. Fetch student
  const { data: studentData, error: stErr } = await supabase
    .from('tutor_students')
    .select('*')
    .eq('id', studentId)
    .single();

  if (stErr || !studentData) return null;

  const target =
    Number(studentData.monthly_target_lessons) || Number(studentData.package_total_lessons) || 12;

  let recurring: RecurringSlot[] = [];
  if (Array.isArray(studentData.recurring_schedule)) {
    recurring = studentData.recurring_schedule;
  } else if (typeof studentData.recurring_schedule === 'string') {
    try {
      recurring = JSON.parse(studentData.recurring_schedule);
    } catch {}
  }

  const student: Student = {
    id: studentData.id,
    name: studentData.name,
    monthly_target_lessons: target,
    recurring_schedule: recurring,
    billing_day: studentData.billing_day || '10 число',
    billing_type: studentData.billing_type === 'package' ? 'package' : 'date_to_date',
    lesson_rate: typeof studentData.lesson_rate === 'number' ? studentData.lesson_rate : 300000,
    lessons_balance: typeof studentData.lessons_balance === 'number' ? studentData.lessons_balance : 0,
    phone: studentData.phone || '',
    telegram: studentData.telegram || '',
    created_at: studentData.created_at,
    schedule_notes: studentData.notes || '',
    color: studentData.color || '#3B82F6',
    makeup_debt: 0,
  };

  // 2. Fetch pending makeups
  const { data: makeupsData } = await supabase
    .from('tutor_makeups')
    .select('id, reason, missed_date, status')
    .eq('student_id', studentId)
    .eq('status', 'pending');

  const pendingMakeups = (makeupsData || []).map((m) => ({
    date: m.missed_date || '',
    reason: m.reason || 'Пропуск',
  }));

  student.makeup_debt = pendingMakeups.length;

  const todayStr = getTashkentTodayStr();
  const isCustomRange =
    Boolean(targetOrOptions) &&
    !(targetOrOptions instanceof Date) &&
    typeof targetOrOptions === 'object';
  const isLegacyMonthDate = targetOrOptions instanceof Date;

  let periodLabel: string;
  let reportTargetCount = target;
  let cycleSummary: StudentCycleSummary | null = null;
  let scopedLessons: Lesson[] = [];

  if (isCustomRange) {
    const opts = targetOrOptions as ReportDateRangeOptions;
    const startStr = opts.startDate || addDaysStr(todayStr, -30);
    const endStr = opts.endDate || todayStr;
    periodLabel = opts.label || `${formatLongRuDate(startStr)} – ${formatLongRuDate(endStr)}`;

    const { data: lessonsData } = await supabase
      .from('tutor_lessons')
      .select('*')
      .eq('student_id', studentId)
      .gte('lesson_date', startStr)
      .lte('lesson_date', endStr)
      .order('lesson_date', { ascending: true })
      .order('start_time', { ascending: true });

    scopedLessons = (lessonsData || []).map((l) => mapReportLessonRow(l, student.name));
  } else if (isLegacyMonthDate) {
    const targetMonthDate = targetOrOptions as Date;
    periodLabel = format(targetMonthDate, 'LLLL yyyy', { locale: ru });
    const startStr = format(startOfMonth(targetMonthDate), 'yyyy-MM-dd');
    const endStr = format(endOfMonth(targetMonthDate), 'yyyy-MM-dd');

    const { data: lessonsData } = await supabase
      .from('tutor_lessons')
      .select('*')
      .eq('student_id', studentId)
      .gte('lesson_date', startStr)
      .lte('lesson_date', endStr)
      .order('lesson_date', { ascending: true })
      .order('start_time', { ascending: true });

    scopedLessons = (lessonsData || []).map((l) => mapReportLessonRow(l, student.name));
  } else {
    // Active cycle mode (package or date_to_date)
    const fetchFrom = addDaysStr(todayStr, -120);
    const fetchTo = addDaysStr(todayStr, 65);

    const { data: lessonsData } = await supabase
      .from('tutor_lessons')
      .select('*')
      .eq('student_id', studentId)
      .gte('lesson_date', fetchFrom)
      .lte('lesson_date', fetchTo)
      .order('lesson_date', { ascending: true })
      .order('start_time', { ascending: true });

    const allMapped = (lessonsData || []).map((l) => mapReportLessonRow(l, student.name));
    cycleSummary = computeStudentCycleSummary(student, allMapped, todayStr);
    reportTargetCount = cycleSummary.totalLessons;

    if (student.billing_type === 'package') {
      periodLabel = `Пакет ${cycleSummary.totalLessons} ${getLessonPlural(cycleSummary.totalLessons)} (с ${formatLongRuDate(cycleSummary.startDate)})`;
      scopedLessons = cycleSummary.cycleLessons.filter((l) => {
        const d = getLessonDateStr(l);
        const kind = classifyLessonKind(l);
        return (d >= cycleSummary!.startDate && d <= todayStr) || kind === 'planned' || d > todayStr;
      });
    } else {
      periodLabel = `${formatLongRuDate(cycleSummary.startDate)} – ${formatLongRuDate(cycleSummary.endDate)}`;
      scopedLessons = cycleSummary.cycleLessons;
    }
  }

  const completedLessons: Lesson[] = [];
  const missedLessons: Lesson[] = [];
  const plannedLessons: Lesson[] = [];

  for (const lessonItem of scopedLessons) {
    if (lessonItem.status === 'completed') {
      completedLessons.push(lessonItem);
    } else if (
      lessonItem.status === 'missed' ||
      lessonItem.status === 'missed_penalty' ||
      lessonItem.status === 'missed_excused'
    ) {
      missedLessons.push(lessonItem);
    } else {
      plannedLessons.push(lessonItem);
    }
  }

  const penaltyCount = missedLessons.filter((l) => l.status === 'missed_penalty').length;
  const excusedCount = missedLessons.filter((l) => l.status === 'missed_excused').length;
  const legacyMissedCount = missedLessons.filter((l) => l.status === 'missed').length;

  // 4. Build Telegram HTML
  let html = `📋 <b>Отчет по ученику: ${student.name}</b>\n`;
  html += `🗓 <b>Период:</b> ${periodLabel}\n`;
  if (cycleSummary && student.billing_type === 'package') {
    html += `📦 <b>Размер пакета:</b> ${cycleSummary.totalLessons} ${getLessonPlural(cycleSummary.totalLessons)}\n`;
  } else {
    html += `🎯 <b>Норма на период:</b> ${reportTargetCount} ${getLessonPlural(reportTargetCount)}\n`;
    html += `📅 <b>День оплаты:</b> ${student.billing_day || 'не указан'}\n`;
  }
  html += `\n`;

  html += `📊 <b>Посещаемость:</b>\n`;
  html += `• Проведено: <b>${completedLessons.length} из ${reportTargetCount}</b> ✅\n`;
  if (penaltyCount > 0) {
    html += `• Сгорело (платный пропуск): <b>${penaltyCount}</b> 🔥\n`;
  }
  if (excusedCount > 0) {
    html += `• Уважительных отмен: <b>${excusedCount}</b> 🛑\n`;
  }
  if (legacyMissedCount > 0 || (penaltyCount === 0 && excusedCount === 0 && missedLessons.length > 0)) {
    html += `• Пропущено: <b>${legacyMissedCount || missedLessons.length}</b> ❌\n`;
  }
  if (cycleSummary && student.billing_type === 'package') {
    if (cycleSummary.remainingLessons > 0) {
      html += `• Осталось в пакете: <b>${cycleSummary.remainingLessons}</b>${cycleSummary.estimatedEndDate ? ` (до ~${formatLongRuDate(cycleSummary.estimatedEndDate)})` : ''} ⏳\n`;
    } else if (cycleSummary.debtLessons > 0) {
      html += `• Пакет завершён, долг: <b>${cycleSummary.debtLessons} ур.</b> ⚠️\n`;
    } else {
      html += `• Пакет завершён (баланс: 0 ур.)\n`;
    }
    if (cycleSummary.prepaidExtraLessons > 0) {
      html += `• Предоплачено на следующий пакет: <b>${cycleSummary.prepaidExtraLessons} ур.</b>\n`;
    }
  } else {
    html += `• Запланировано: <b>${plannedLessons.length}</b> ⏳\n`;
  }
  if (pendingMakeups.length > 0) {
    html += `• Долг по отработкам в ВС: <b>${pendingMakeups.length}</b> 🔄\n`;
  }
  html += `\n`;

  if (completedLessons.length > 0) {
    html += `✅ <b>Проведенные уроки:</b>\n`;
    completedLessons.forEach((l, i) => {
      const d = formatRuDate(l.date);
      const day = formatRuDay(l.date);
      const time = (l.time_str || '').split(' - ')[0];
      html += `${i + 1}. ${d} (${day} ${time})${l.is_makeup ? ' <i>[Отработка]</i>' : ''}\n`;
    });
    html += `\n`;
  }

  if (missedLessons.length > 0) {
    html += `⚠️ <b>Пропуски и отмены:</b>\n`;
    missedLessons.forEach((l, i) => {
      const d = formatRuDate(l.date);
      const day = formatRuDay(l.date);
      const icon = l.status === 'missed_excused' ? '🛑' : l.status === 'missed_penalty' ? '🔥' : '❌';
      const statusLabel = l.status === 'missed_excused' ? 'Отмена' : l.status === 'missed_penalty' ? 'Сгорел' : 'Пропуск';
      const reason = l.miss_reason ? ` — <i>${l.miss_reason}</i>` : '';
      const mk = l.needs_makeup ? ' [на отработке]' : '';
      html += `${i + 1}. ${icon} <b>${statusLabel}:</b> ${d} (${day})${reason}${mk}\n`;
    });
    html += `\n`;
  }

  // 5. Ready-to-forward text for parents
  let parentText: string;
  if (cycleSummary && student.billing_type === 'package') {
    parentText = `Здравствуйте! 📚 Направляю отчет по занятиям для ученика ${student.name}:\n\n`;
    parentText += `📦 Итоги по текущему пакету (${cycleSummary.totalLessons} ур., с ${formatLongRuDate(cycleSummary.startDate)}):\n`;
    parentText += `• Проведено занятий: ${completedLessons.length}\n`;
    if (penaltyCount > 0) {
      parentText += `• Сгорело (платные пропуски): ${penaltyCount}\n`;
    }
    if (excusedCount > 0) {
      parentText += `• Уважительных отмен (перенесены): ${excusedCount}\n`;
    }
    if (legacyMissedCount > 0 || (penaltyCount === 0 && excusedCount === 0 && missedLessons.length > 0)) {
      parentText += `• Пропущено: ${legacyMissedCount || missedLessons.length}\n`;
    }
    if (cycleSummary.remainingLessons > 0) {
      const est = cycleSummary.estimatedEndDate
        ? ` (ориентировочно до ${formatLongRuDate(cycleSummary.estimatedEndDate)})`
        : '';
      parentText += `• Осталось в пакете: ${cycleSummary.remainingLessons} ${getLessonPlural(cycleSummary.remainingLessons)}${est}\n`;
    } else if (cycleSummary.debtLessons > 0) {
      parentText += `• Пакет завершён · задолженность: ${cycleSummary.debtLessons} ${getLessonPlural(cycleSummary.debtLessons)}\n`;
    } else {
      parentText += `• Текущий пакет завершён (баланс: 0 ур.)\n`;
    }
    if (cycleSummary.prepaidExtraLessons > 0) {
      parentText += `• Предоплачено на следующий пакет: ${cycleSummary.prepaidExtraLessons} ${getLessonPlural(cycleSummary.prepaidExtraLessons)}\n`;
    }
  } else {
    parentText = `Здравствуйте! 📚 Направляю отчет по занятиям для ученика ${student.name} за ${periodLabel}:\n\n`;
    parentText += `📊 Итоги периода:\n`;
    parentText += `• Норма уроков: ${reportTargetCount} ${getLessonPlural(reportTargetCount)}\n`;
    parentText += `• Проведено занятий: ${completedLessons.length}\n`;
    if (penaltyCount > 0) {
      parentText += `• Сгорело (платные пропуски): ${penaltyCount}\n`;
    }
    if (excusedCount > 0) {
      parentText += `• Уважительных отмен: ${excusedCount}\n`;
    }
    if (legacyMissedCount > 0 || (penaltyCount === 0 && excusedCount === 0 && missedLessons.length > 0)) {
      parentText += `• Пропущено: ${legacyMissedCount || missedLessons.length}\n`;
    }
    if (!isCustomRange && !isLegacyMonthDate) {
      parentText += `• Текущий баланс: ${student.lessons_balance} ур.\n`;
    }
    if (pendingMakeups.length > 0) {
      parentText += `• Ожидают отработки в воскресенье: ${pendingMakeups.length}\n`;
    }
  }
  parentText += `\n`;

  if (completedLessons.length > 0) {
    parentText += `🗓 Проведенные занятия:\n`;
    completedLessons.forEach((l, idx) => {
      const d = formatRuDate(l.date);
      const day = formatRuDay(l.date);
      const time = (l.time_str || '').split(' - ')[0];
      parentText += `${idx + 1}. ${d} (${day} ${time})${l.is_makeup ? ' — отработка' : ''}\n`;
    });
    parentText += `\n`;
  }

  if (missedLessons.length > 0) {
    parentText += `⚠️ Пропуски и отмены:\n`;
    missedLessons.forEach((l, idx) => {
      const d = formatRuDate(l.date);
      const day = formatRuDay(l.date);
      const icon = l.status === 'missed_excused' ? '🛑' : l.status === 'missed_penalty' ? '🔥' : '❌';
      const statusLabel = l.status === 'missed_excused' ? 'Уважительная отмена' : l.status === 'missed_penalty' ? 'Сгорел' : 'Пропуск';
      const reason = l.miss_reason ? ` (${l.miss_reason})` : '';
      parentText += `${idx + 1}. ${icon} ${statusLabel}: ${d} (${day})${reason}\n`;
    });
    parentText += `\n`;
  }

  if (cycleSummary && student.billing_type === 'package') {
    if (cycleSummary.remainingLessons > 0) {
      parentText += `📅 Следующая оплата — после завершения оставшихся ${cycleSummary.remainingLessons} ${getLessonPlural(cycleSummary.remainingLessons)}.\n\n`;
    }
  } else if (student.billing_day && !isCustomRange) {
    const bp = getStudentBillingPeriod(student.billing_day, getTashkentNow());
    parentText += `📅 День оплаты следующего периода: ${bp.nextBillingFormatted}\n\n`;
  }

  parentText += `Спасибо за сотрудничество! 🙌`;

  html += `\n💬 <b>Сообщение для родителей (готово к пересылке):</b>\n`;
  html += `<i>${parentText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</i>`;

  return {
    student,
    monthName: periodLabel,
    targetLessons: reportTargetCount,
    completedLessons,
    missedLessons,
    plannedLessons,
    pendingMakeups,
    telegramHtml: html,
    parentForwardText: parentText,
  };
}

/**
 * Search students matching given name string (case-insensitive)
 */
export async function findStudentsByName(nameQuery: string): Promise<Student[]> {
  if (!supabase) return [];
  const clean = nameQuery.trim().toLowerCase();
  const { data: allStudents, error } = await supabase
    .from('tutor_students')
    .select('*')
    .order('name');

  if (error || !allStudents) return [];

  const matched = allStudents.filter(
    (s) => !String(s.name).startsWith('_BOT_') && s.name.toLowerCase().includes(clean)
  );

  return matched.map((s) => ({
    id: s.id,
    name: s.name,
    monthly_target_lessons: Number(s.monthly_target_lessons) || Number(s.package_total_lessons) || 12,
    recurring_schedule: Array.isArray(s.recurring_schedule) ? s.recurring_schedule : [],
    billing_day: s.billing_day || '10 число',
    billing_type: (s.billing_type === 'package' ? 'package' : 'date_to_date'),
    lesson_rate: typeof s.lesson_rate === 'number' ? s.lesson_rate : 300000,
    lessons_balance: typeof s.lessons_balance === 'number' ? s.lessons_balance : 0,
    phone: s.phone || '',
    telegram: s.telegram || '',
    schedule_notes: s.notes || '',
    color: s.color || '#3B82F6',
    created_at: s.created_at,
    makeup_debt: 0,
  }));
}

export interface MonthlyExportData {
  monthName: string;
  totalEarned: number;
  totalCompleted: number;
  studentsBreakdown: Array<{
    name: string;
    price: number;
    completedInMonth: number;
    earnedUzs: number;
    remaining: number;
    debtUzs: number;
  }>;
  csvContent: string;
  formattedText: string;
}

export async function generateMonthlyExportData(): Promise<MonthlyExportData> {
  const now = getTashkentNow();
  const startStr = format(startOfMonth(now), 'yyyy-MM-dd');
  const endStr = format(endOfMonth(now), 'yyyy-MM-dd');
  const rawMonthName = format(now, 'LLLL yyyy', { locale: ru });
  const monthName = rawMonthName.charAt(0).toUpperCase() + rawMonthName.slice(1);

  if (!supabase) {
    return {
      monthName,
      totalEarned: 0,
      totalCompleted: 0,
      studentsBreakdown: [],
      csvContent: '',
      formattedText: '',
    };
  }

  const { data: studentsData, error: sErr } = await supabase
    .from('tutor_students')
    .select('*')
    .not('name', 'like', '_BOT_%')
    .eq('is_active', true)
    .order('name');

  if (sErr || !studentsData) {
    return {
      monthName,
      totalEarned: 0,
      totalCompleted: 0,
      studentsBreakdown: [],
      csvContent: '',
      formattedText: '',
    };
  }

  const { data: lessonsData } = await supabase
    .from('tutor_lessons')
    .select('*')
    .gte('lesson_date', startStr)
    .lte('lesson_date', endStr);

  const lessons = lessonsData || [];

  const studentsBreakdown: Array<{
    name: string;
    price: number;
    completedInMonth: number;
    earnedUzs: number;
    remaining: number;
    debtUzs: number;
  }> = [];

  let totalCompleted = 0;
  let totalEarned = 0;

  for (const s of studentsData) {
    const price = typeof s.lesson_rate === 'number' ? s.lesson_rate : 300000;
    const studentLessons = lessons.filter((l) => l.student_id === s.id);
    const completedInMonth = studentLessons.filter((l) => l.status === 'completed').length;
    const penaltyInMonth = studentLessons.filter((l) => l.status === 'missed_penalty').length;
    // Billable: conducted + penalty (burned)
    const earnedUzs = (completedInMonth + penaltyInMonth) * price;
    const balance = typeof s.lessons_balance === 'number' ? s.lessons_balance : 0;
    const debtUzs = balance < 0 ? Math.abs(balance) * price : 0;

    totalCompleted += completedInMonth;
    totalEarned += earnedUzs;

    studentsBreakdown.push({
      name: s.name,
      price,
      completedInMonth,
      earnedUzs,
      remaining: balance,
      debtUzs,
    });
  }

  // Build CSV
  const csvRows: string[] = [
    'Ученик,Ставка (UZS),Проведено,Заработано (UZS),Баланс (ур.),Задолженность (UZS)',
  ];
  for (const item of studentsBreakdown) {
    csvRows.push(
      `"${item.name.replace(/"/g, '""')}",${item.price},${item.completedInMonth},${item.earnedUzs},${item.remaining},${item.debtUzs}`
    );
  }
  const csvContent = csvRows.join('\n');

  // Formatted Text
  let formattedText = `📊 <b>Финансовый отчет за ${monthName}</b>\n\n`;
  formattedText += `✅ Всего проведено уроков: <b>${totalCompleted}</b>\n`;
  formattedText += `💰 Фактический доход: <b>${totalEarned.toLocaleString('ru-RU')} сум</b>\n\n`;
  formattedText += `<b>Детализация по ученикам:</b>\n`;
  for (const item of studentsBreakdown) {
    formattedText += `• <b>${item.name}</b>: ${item.completedInMonth} ур. × ${item.price.toLocaleString('ru-RU')} = <b>${item.earnedUzs.toLocaleString('ru-RU')} сум</b> (баланс: ${item.remaining} ур.${item.debtUzs > 0 ? `, долг: ${item.debtUzs.toLocaleString('ru-RU')} сум` : ''})\n`;
  }

  return {
    monthName,
    totalEarned,
    totalCompleted,
    studentsBreakdown,
    csvContent,
    formattedText,
  };
}
