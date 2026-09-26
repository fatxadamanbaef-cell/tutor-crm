import { supabase } from './supabase';
import { Student, Lesson, Payment, LessonStatus } from '@/types';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { ru } from 'date-fns/locale';
import { formatUZS, getTashkentNow } from './formatters';
import { getTutorSettings, TutorSettings } from './settings';

export interface StudentFullReport {
  student: Student;
  lastPayment: Payment | null;
  completedLessons: Lesson[];
  missedLessons: Lesson[];
  plannedLessons: Lesson[];
  totalCompletedCount: number;
  remainingLessons: number;
  debtLessons: number;
  debtAmountUzs: number;
  telegramHtml: string;
  parentForwardText: string;
}

/**
 * Format ISO date string or YYYY-MM-DD into readable Russian, e.g. "23 августа"
 */
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

/**
 * Generate full comprehensive report for a student
 */
export async function generateStudentReport(
  studentId: string,
  customSettings?: Partial<TutorSettings>
): Promise<StudentFullReport | null> {
  if (!supabase) return null;

  const settings = { ...getTutorSettings(), ...customSettings };

  // 1. Fetch student
  const { data: studentData, error: stErr } = await supabase
    .from('tutor_students')
    .select('*')
    .eq('id', studentId)
    .single();

  if (stErr || !studentData) return null;

  const student: Student = {
    id: studentData.id,
    name: studentData.name,
    price_per_lesson: Number(studentData.price_per_lesson) || 150000,
    prepaid_balance: Number(studentData.package_remaining_lessons) ?? 0,
    makeup_debt: 0,
    phone: studentData.phone || '',
    telegram: studentData.telegram || '',
    created_at: studentData.created_at,
  };

  // 2. Fetch makeup count
  const { data: makeupsData } = await supabase
    .from('tutor_makeups')
    .select('id, reason, missed_date, status')
    .eq('student_id', studentId)
    .eq('status', 'pending');

  student.makeup_debt = makeupsData?.length || 0;

  // 3. Fetch all lessons for student
  const { data: lessonsData } = await supabase
    .from('tutor_lessons')
    .select('*')
    .eq('student_id', studentId)
    .order('lesson_date', { ascending: true })
    .order('start_time', { ascending: true });

  const allLessons: Lesson[] = (lessonsData || []).map((l) => {
    let status: LessonStatus = 'planned';
    if (l.status === 'completed') status = 'completed';
    else if (l.status === 'missed_burned' || l.status === 'missed_penalty' || l.status === 'burned') status = 'missed_penalty';
    else if (l.status === 'missed_makeup' || l.status === 'missed_excused' || l.status === 'need_makeup') status = 'missed_excused';
    else status = 'planned';

    const startTimeClean = (l.start_time || '18:00').substring(0, 5);
    const endTimeClean = (l.end_time || '19:30').substring(0, 5);

    return {
      id: l.id,
      student_id: l.student_id,
      student_name: student.name,
      price_per_lesson: Number(l.price) || student.price_per_lesson,
      date: `${l.lesson_date}T${startTimeClean}:00+05:00`,
      time_str: `${startTimeClean} - ${endTimeClean}`,
      status,
      notes: l.notes || '',
      created_at: l.created_at,
    };
  });

  const completedLessons = allLessons.filter((l) => l.status === 'completed');
  const burnedLessons = allLessons.filter((l) => l.status === 'missed_penalty');
  const missedLessons = allLessons.filter((l) => l.status === 'missed_excused');
  const plannedLessons = allLessons.filter((l) => l.status === 'planned');

  // 4. Fetch payments for student
  const { data: paymentsData } = await supabase
    .from('tutor_payments')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(1);

  let lastPayment: Payment | null = null;
  if (paymentsData && paymentsData.length > 0) {
    const p = paymentsData[0];
    lastPayment = {
      id: p.id,
      student_id: p.student_id,
      student_name: student.name,
      amount_uzs: Number(p.amount) || 0,
      lessons_added: Number(p.lessons_count) || 0,
      created_at: p.payment_date || p.created_at,
    };
  }

  // 5. Balance calculations
  const balance = student.prepaid_balance;
  const remainingLessons = balance > 0 ? balance : 0;
  const debtLessons = balance < 0 ? Math.abs(balance) : 0;
  const debtAmountUzs = debtLessons * student.price_per_lesson;

  // Helper for day of week in Russian
  const formatRuDay = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const raw = dateStr.includes('T') ? dateStr.substring(0, 10) : dateStr;
      const d = parseISO(raw);
      const dayName = format(d, 'EEE', { locale: ru });
      return dayName.charAt(0).toUpperCase() + dayName.slice(1);
    } catch {
      return '';
    }
  };

  // 6. Build Telegram HTML Message
  let html = `📊 <b>Отчет по занятиям: ${student.name}</b>\n\n`;
  html += `💰 <b>Стоимость урока:</b> ${formatUZS(student.price_per_lesson)}\n`;

  if (lastPayment) {
    html += `💳 <b>Последняя оплата:</b> ${formatRuDate(lastPayment.created_at)} (${formatUZS(lastPayment.amount_uzs)} за ${lastPayment.lessons_added} ур.)\n`;
  } else {
    html += `💳 <b>Последняя оплата:</b> <i>Ранее внесенный абонемент</i>\n`;
  }

  html += `\n━━━━━━━━━━━━━━━━━━━━\n`;

  // History of completed and burned lessons
  const historyLessons = allLessons.filter((l) => l.status !== 'planned');
  if (historyLessons.length > 0) {
    html += `📋 <b>История занятий (${historyLessons.length}):</b>\n`;
    historyLessons.forEach((l, idx) => {
      const dateFormatted = formatRuDate(l.date);
      const dayName = formatRuDay(l.date);
      const timeClean = (l.time_str || '18:00').split('-')[0].trim();
      const noteStr = l.notes ? ` — <i>${l.notes}</i>` : '';

      if (l.status === 'completed') {
        html += `${idx + 1}. <b>${dateFormatted}</b> (${dayName} ${timeClean}) — ✅ Проведен${noteStr}\n`;
      } else if (l.status === 'missed_penalty') {
        html += `${idx + 1}. <b>${dateFormatted}</b> (${dayName} ${timeClean}) — 🔥 Пропуск (не отработан в ВС — списан)${noteStr}\n`;
      } else if (l.status === 'missed_excused') {
        html += `${idx + 1}. <b>${dateFormatted}</b> (${dayName} ${timeClean}) — 🟡 Пропуск (Ожидает отработки в ВС)${noteStr}\n`;
      }
    });
  } else {
    html += `📋 <b>История занятий:</b> <i>Пока нет отмеченных уроков</i>\n`;
  }

  if (plannedLessons.length > 0) {
    html += `\n🗓 <b>Ближайшие запланированные (${plannedLessons.length}):</b>\n`;
    plannedLessons.slice(0, 4).forEach((l) => {
      const dateFormatted = formatRuDate(l.date);
      const dayName = formatRuDay(l.date);
      const timeClean = (l.time_str || '18:00').split('-')[0].trim();
      html += `• <b>${dateFormatted}</b> (${dayName} ${timeClean}) ⚪\n`;
    });
  }

  html += `\n━━━━━━━━━━━━━━━━━━━━\n`;

  // Status & Remaining / Debt
  if (balance > 0) {
    html += `🟢 <b>Остаток по абонементу:</b> <b>${balance} ${getLessonPlural(balance)}</b>\n`;
  } else if (balance === 0) {
    html += `⚠️ <b>Остаток по абонементу:</b> <b>0 уроков</b> (Абонемент окончен, требуется продление)\n`;
  } else {
    html += `🔴 <b>Занятия идут в долг:</b> <b>${debtLessons} ${getLessonPlural(debtLessons)}</b>\n`;
    html += `💵 <b>Сумма к оплате:</b> <b>${formatUZS(debtAmountUzs)}</b>\n`;
  }

  const cardDetails = `Реквизиты (${settings.bankName}): ${settings.cardNumber} (${settings.cardHolder})`;

  // Ready-to-forward text for parents
  let parentText = `Здравствуйте! 📚 Направляю отчет по занятиям для ученика ${student.name}:\n\n`;

  if (lastPayment) {
    parentText += `💳 Последняя оплата: ${formatRuDate(lastPayment.created_at)} (${formatUZS(lastPayment.amount_uzs)} за ${lastPayment.lessons_added} ур.)\n\n`;
  }

  if (historyLessons.length > 0) {
    parentText += `🗓 Проведенные занятия:\n`;
    historyLessons.forEach((l, idx) => {
      const dateFormatted = formatRuDate(l.date);
      const dayName = formatRuDay(l.date);
      const timeClean = (l.time_str || '18:00').split('-')[0].trim();

      if (l.status === 'completed') {
        parentText += `${idx + 1}. ${dateFormatted} (${dayName} ${timeClean}) — ✅ Проведен\n`;
      } else if (l.status === 'missed_penalty') {
        parentText += `${idx + 1}. ${dateFormatted} (${dayName} ${timeClean}) — 🔥 Пропуск (не отработан в ВС — списан)\n`;
      } else if (l.status === 'missed_excused') {
        parentText += `${idx + 1}. ${dateFormatted} (${dayName} ${timeClean}) — 🟡 Пропуск (Ожидает отработки в ВС)\n`;
      }
    });
    parentText += `\n`;
  }

  parentText += `📊 Итог:\n`;
  parentText += `• Проведено уроков: ${completedLessons.length}\n`;
  if (burnedLessons.length > 0) {
    parentText += `• Списано без отработки: ${burnedLessons.length}\n`;
  }

  if (balance > 0) {
    parentText += `• Остаток по текущему абонементу: ${balance} ${getLessonPlural(balance)}\n\n`;
  } else if (balance === 0) {
    parentText += `• Оплаченные уроки закончились. Стоимость нового абонемента (8 уроков): ${formatUZS(student.price_per_lesson * 8)}\n`;
    parentText += `• ${cardDetails}\n\n`;
  } else {
    parentText += `• Занятия проведены в долг: ${debtLessons} ${getLessonPlural(debtLessons)}\n`;
    parentText += `• Сумма к оплате: ${formatUZS(debtAmountUzs)}\n`;
    parentText += `• ${cardDetails}\n\n`;
  }

  parentText += `Спасибо! 🙌`;

  html += `\n💬 <b>Сообщение для родителей:</b>\n`;
  html += `<i>${parentText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</i>`;

  return {
    student,
    lastPayment,
    completedLessons,
    missedLessons,
    plannedLessons,
    totalCompletedCount: completedLessons.length,
    remainingLessons,
    debtLessons,
    debtAmountUzs,
    telegramHtml: html,
    parentForwardText: parentText,
  };
}

/**
 * Helper to pluralize Russian word "урок" (1 урок, 2 урока, 5 уроков)
 */
export function getLessonPlural(n: number): string {
  const abs = Math.abs(n) % 100;
  const rem = abs % 10;
  if (abs > 10 && abs < 20) return 'уроков';
  if (rem > 1 && rem < 5) return 'урока';
  if (rem === 1) return 'урок';
  return 'уроков';
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

  const matched = allStudents.filter((s) => s.name.toLowerCase().includes(clean));

  return matched.map((s) => ({
    id: s.id,
    name: s.name,
    price_per_lesson: Number(s.price_per_lesson) || 150000,
    prepaid_balance: Number(s.package_remaining_lessons) ?? 0,
    makeup_debt: 0,
    phone: s.phone || '',
    telegram: s.telegram || '',
    created_at: s.created_at,
  }));
}

/**
 * Generate monthly summary report as CSV string and structured data
 */
export async function generateMonthlyExportData(): Promise<{
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
}> {
  const now = getTashkentNow();
  const monthName = format(now, 'LLLL yyyy', { locale: ru });
  const startStr = format(startOfMonth(now), 'yyyy-MM-dd');
  const endStr = format(endOfMonth(now), 'yyyy-MM-dd');

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

  const [studentsRes, lessonsRes] = await Promise.all([
    supabase.from('tutor_students').select('*').order('name'),
    supabase
      .from('tutor_lessons')
      .select('*')
      .eq('status', 'completed')
      .gte('lesson_date', startStr)
      .lte('lesson_date', endStr),
  ]);

  const students = studentsRes.data || [];
  const lessons = lessonsRes.data || [];

  let totalEarned = 0;
  let totalCompleted = lessons.length;

  const breakdown = students.map((s) => {
    const studentLessons = lessons.filter((l) => l.student_id === s.id);
    const completedCount = studentLessons.length;
    const price = Number(s.price_per_lesson) || 150000;
    const earned = completedCount * price;
    totalEarned += earned;

    const remaining = Number(s.package_remaining_lessons) || 0;
    const debtUzs = remaining < 0 ? Math.abs(remaining) * price : 0;

    return {
      name: s.name,
      price,
      completedInMonth: completedCount,
      earnedUzs: earned,
      remaining,
      debtUzs,
    };
  });

  // Build CSV
  let csv = `Ученик,Цена за урок (UZS),Проведено уроков в ${monthName},Заработано (UZS),Остаток абонемента (ур.),Долг к оплате (UZS)\n`;
  breakdown.forEach((b) => {
    csv += `"${b.name}",${b.price},${b.completedInMonth},${b.earnedUzs},${b.remaining},${b.debtUzs}\n`;
  });
  csv += `"ИТОГО",-,${totalCompleted},${totalEarned},-,-\n`;

  // Build Formatted Text
  let text = `📊 Финансовый отчет за ${monthName}\n`;
  text += `💰 Всего заработано: ${formatUZS(totalEarned)}\n`;
  text += `✅ Всего проведено уроков: ${totalCompleted}\n\n`;
  text += `Детализация по ученикам:\n`;
  breakdown.forEach((b, i) => {
    text += `${i + 1}. ${b.name}: ${b.completedInMonth} ур. → ${formatUZS(b.earnedUzs)} (Остаток: ${b.remaining > 0 ? `+${b.remaining}` : b.remaining} ур.)\n`;
  });

  return {
    monthName,
    totalEarned,
    totalCompleted,
    studentsBreakdown: breakdown,
    csvContent: csv,
    formattedText: text,
  };
}
