import { supabase } from './supabase';
import { Student, Lesson } from '@/types';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { getTashkentNow } from './formatters';

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

/**
 * Generate attendance and archive report for a student for the selected month (default: current month)
 */
export async function generateStudentReport(
  studentId: string,
  targetMonthDate: Date = getTashkentNow()
): Promise<StudentAttendanceReport | null> {
  if (!supabase) return null;

  const monthName = format(targetMonthDate, 'LLLL yyyy', { locale: ru });
  const startStr = format(startOfMonth(targetMonthDate), 'yyyy-MM-dd');
  const endStr = format(endOfMonth(targetMonthDate), 'yyyy-MM-dd');

  // 1. Fetch student
  const { data: studentData, error: stErr } = await supabase
    .from('tutor_students')
    .select('*')
    .eq('id', studentId)
    .single();

  if (stErr || !studentData) return null;

  const target = Number(studentData.monthly_target_lessons) || Number(studentData.package_total_lessons) || 12;

  const student: Student = {
    id: studentData.id,
    name: studentData.name,
    monthly_target_lessons: target,
    billing_day: studentData.billing_day || '10 число',
    phone: studentData.phone || '',
    telegram: studentData.telegram || '',
    created_at: studentData.created_at,
    schedule_notes: studentData.notes || '',
    color: studentData.color || '#3B82F6',
    makeup_debt: 0,
    price_per_lesson: 0,
    prepaid_balance: 0,
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

  // 3. Fetch lessons for month
  const { data: lessonsData } = await supabase
    .from('tutor_lessons')
    .select('*')
    .eq('student_id', studentId)
    .gte('lesson_date', startStr)
    .lte('lesson_date', endStr)
    .order('lesson_date', { ascending: true })
    .order('start_time', { ascending: true });

  const completedLessons: Lesson[] = [];
  const missedLessons: Lesson[] = [];
  const plannedLessons: Lesson[] = [];

  (lessonsData || []).forEach((l) => {
    const startTimeClean = (l.start_time || '18:00').substring(0, 5);
    const endTimeClean = (l.end_time || '19:30').substring(0, 5);
    const timeStr = `${startTimeClean} - ${endTimeClean}`;
    const isoDate = `${l.lesson_date}T${startTimeClean}:00+05:00`;

    const lessonItem: Lesson = {
      id: l.id,
      student_id: l.student_id,
      student_name: student.name,
      date: isoDate,
      time_str: timeStr,
      status: l.status === 'completed' ? 'completed' : l.status === 'planned' || l.status === 'scheduled' ? 'planned' : 'missed',
      miss_reason: l.miss_reason || l.notes || undefined,
      needs_makeup: Boolean(l.needs_makeup),
      is_makeup: Boolean(l.is_makeup),
      notes: l.notes || '',
      created_at: l.created_at,
    };

    if (lessonItem.status === 'completed') completedLessons.push(lessonItem);
    else if (lessonItem.status === 'missed') missedLessons.push(lessonItem);
    else plannedLessons.push(lessonItem);
  });

  // 4. Build Telegram HTML
  let html = `📋 <b>Отчет по ученику: ${student.name}</b>\n`;
  html += `🗓 <b>Период:</b> ${monthName}\n`;
  html += `🎯 <b>Норма на месяц:</b> ${target} ${getLessonPlural(target)}\n`;
  html += `📅 <b>День оплаты:</b> ${student.billing_day || 'не указан'}\n\n`;

  html += `📊 <b>Посещаемость:</b>\n`;
  html += `• Проведено: <b>${completedLessons.length} из ${target}</b> ✅\n`;
  html += `• Пропущено: <b>${missedLessons.length}</b> ❌\n`;
  html += `• Запланировано: <b>${plannedLessons.length}</b> ⏳\n`;
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
    html += `❌ <b>Пропуски:</b>\n`;
    missedLessons.forEach((l, i) => {
      const d = formatRuDate(l.date);
      const day = formatRuDay(l.date);
      const reason = l.miss_reason ? ` — <i>${l.miss_reason}</i>` : '';
      const mk = l.needs_makeup ? ' [на отработке]' : '';
      html += `${i + 1}. ${d} (${day})${reason}${mk}\n`;
    });
    html += `\n`;
  }

  // 5. Ready-to-forward text for parents (Zero-Finance)
  let parentText = `Здравствуйте! 📚 Направляю отчет по занятиям для ученика ${student.name} за ${monthName}:\n\n`;
  parentText += `📊 Итоги месяца:\n`;
  parentText += `• Норма уроков: ${target} ${getLessonPlural(target)}\n`;
  parentText += `• Проведено занятий: ${completedLessons.length}\n`;
  parentText += `• Пропущено: ${missedLessons.length}\n`;
  if (pendingMakeups.length > 0) {
    parentText += `• Ожидают отработки в воскресенье: ${pendingMakeups.length}\n`;
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
    parentText += `❌ Пропущенные занятия:\n`;
    missedLessons.forEach((l, idx) => {
      const d = formatRuDate(l.date);
      const day = formatRuDay(l.date);
      const reason = l.miss_reason ? ` (${l.miss_reason})` : '';
      parentText += `${idx + 1}. ${d} (${day})${reason}\n`;
    });
    parentText += `\n`;
  }

  if (student.billing_day) {
    parentText += `📅 День оплаты следующего периода: ${student.billing_day}\n\n`;
  }

  parentText += `Спасибо за сотрудничество! 🙌`;

  html += `\n💬 <b>Сообщение для родителей (готово к пересылке):</b>\n`;
  html += `<i>${parentText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</i>`;

  return {
    student,
    monthName,
    targetLessons: target,
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
    phone: s.phone || '',
    telegram: s.telegram || '',
    schedule_notes: s.notes || '',
    color: s.color || '#3B82F6',
    created_at: s.created_at,
    makeup_debt: 0,
    price_per_lesson: 0,
    prepaid_balance: 0,
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
  return {
    monthName: 'Текущий месяц',
    totalEarned: 0,
    totalCompleted: 0,
    studentsBreakdown: [],
    csvContent: '',
    formattedText: '',
  };
}
