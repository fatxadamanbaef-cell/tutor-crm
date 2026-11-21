import {
  getLessons,
  getStudents,
  ensureRecurringLessonsForAllActiveStudents,
  calculateStudentBilling,
} from '@/lib/storage';
import { formatTashkentHeaderDate, isTashkentToday, getTashkentNow } from '@/lib/formatters';
import { getTutorSettings, type TutorSettings } from '@/lib/settings';
import type { Lesson, Student } from '@/types';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tutor-crm-kappa.vercel.app';

export const escapeHtml = (s: string) =>
  (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: unknown
): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    console.error('[telegram] TELEGRAM_BOT_TOKEN is not configured — cannot send message.');
    return false;
  }
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: replyMarkup }),
    });
    const data = await res.json();
    if (data.ok) return true;

    console.warn('[telegram] HTML sendMessage failed, retrying as plain text:', {
      chatId,
      error_code: data.error_code,
      description: data.description,
    });

    const fallbackRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.replace(/<[^>]*>/g, ''),
        reply_markup: replyMarkup,
      }),
    });
    const fallbackData = await fallbackRes.json();
    if (!fallbackData.ok) {
      console.error('[telegram] Plain-text fallback sendMessage failed:', {
        chatId,
        error_code: fallbackData.error_code,
        description: fallbackData.description,
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error('[telegram] Failed to send telegram message:', error);
    return false;
  }
}

export async function buildMorningDigest(
  firstName?: string,
  prefetched?: {
    lessons?: Lesson[];
    students?: Student[];
    tutorSettings?: TutorSettings;
    skipEnsureRecurring?: boolean;
  }
) {
  const todayFormatted = formatTashkentHeaderDate();
  if (!prefetched?.skipEnsureRecurring) {
    await ensureRecurringLessonsForAllActiveStudents(9).catch((e) => {
      console.error('Failed to ensure recurring lessons in buildMorningDigest:', e);
    });
  }
  const [lessons, students, tutorSettings] = await Promise.all([
    prefetched?.lessons ? Promise.resolve(prefetched.lessons) : getLessons(),
    prefetched?.students ? Promise.resolve(prefetched.students) : getStudents(),
    prefetched?.tutorSettings ? Promise.resolve(prefetched.tutorSettings) : getTutorSettings(),
  ]);
  const greetingName = (firstName || tutorSettings.tutorName || '').trim();
  const todayLessons = lessons
    .filter((l) => isTashkentToday(l.date))
    .sort((a, b) => (a.time_str || '').localeCompare(b.time_str || ''));

  let message = greetingName
    ? `☀️ <b>Доброе утро, ${escapeHtml(greetingName)}! Расписание на сегодня (${todayFormatted}):</b>\n`
    : `☀️ <b>Доброе утро! Расписание на сегодня (${todayFormatted}):</b>\n`;
  message += `Всего запланировано: <b>${todayLessons.length} уроков</b>\n\n`;

  const keyboard: Array<Array<{ text: string; callback_data?: string; web_app?: { url: string } }>> =
    [];

  if (todayLessons.length === 0) {
    message += `<i>На сегодня уроков не запланировано. Отличного дня!</i>\n\n`;
  } else {
    todayLessons.forEach((l, i) => {
      const student = students.find((s) => s.id === l.student_id);
      const studentName = student?.name || l.student_name || 'Ученик';
      const target = student?.monthly_target_lessons || 12;
      const conducted = student?.conducted_this_month || 0;
      const isCompleted = l.status === 'completed';
      const isMissed =
        l.status === 'missed' || l.status === 'missed_excused' || l.status === 'missed_penalty';
      const statusIcon = isCompleted ? '✅' : isMissed ? '❌' : '⏳';

      const timeSlot = l.time_str || '16:00 – 17:30';
      message += `${i + 1}️⃣ <b>${escapeHtml(timeSlot)}</b> — <b>${escapeHtml(studentName)}</b> (В этом месяце: ${conducted}/${target}) ${statusIcon}\n`;

      keyboard.push([
        {
          text: `${statusIcon} ${timeSlot.split(' - ')[0]} ${studentName}`,
          callback_data: `lesson:${l.id}`,
        },
      ]);
    });
    message += `\n`;
  }

  // 💰 БИЛЛИНГ И БАЛАНСЫ
  const now = getTashkentNow();
  const curYear = now.getFullYear();
  const curMonth = now.getMonth();
  const curDay = now.getDate();
  const daysInCurMonth = new Date(curYear, curMonth + 1, 0).getDate();
  const activeStudents = students.filter((s) => s.is_active !== false);

  // 1. Date-to-date students whose billing_day is today or in 1–2 days
  const billingAlertLines: string[] = [];
  const dateToDateStudents = activeStudents.filter((s) => s.billing_type !== 'package');
  for (const s of dateToDateStudents) {
    const match = String(s.billing_day || '').match(/\d+/);
    if (!match) continue;
    const bDay = Math.min(31, Math.max(1, Number(match[0])));
    const clampedThisMonth = Math.min(bDay, daysInCurMonth);

    let diff: number;
    let targetYear: number;
    let targetMonth: number;
    let targetDay: number;

    if (curDay <= clampedThisMonth) {
      diff = clampedThisMonth - curDay;
      targetYear = curYear;
      targetMonth = curMonth;
      targetDay = clampedThisMonth;
    } else {
      targetMonth = (curMonth + 1) % 12;
      targetYear = curMonth === 11 ? curYear + 1 : curYear;
      targetDay = Math.min(bDay, new Date(targetYear, targetMonth + 1, 0).getDate());
      diff = daysInCurMonth - curDay + targetDay;
    }

    if (diff >= 0 && diff <= 2) {
      try {
        let calc;
        if (diff === 0) {
          calc = await calculateStudentBilling(s.id);
        } else {
          const afterMonth = (targetMonth + 1) % 12;
          const afterYear = targetMonth === 11 ? targetYear + 1 : targetYear;
          const afterDay = Math.min(bDay, new Date(afterYear, afterMonth + 1, 0).getDate());
          const upcomingStart = new Date(Date.UTC(targetYear, targetMonth, targetDay))
            .toISOString()
            .substring(0, 10);
          const afterDate = new Date(Date.UTC(afterYear, afterMonth, afterDay));
          afterDate.setUTCDate(afterDate.getUTCDate() - 1);
          const upcomingEnd = afterDate.toISOString().substring(0, 10);
          calc = await calculateStudentBilling(s.id, upcomingStart, upcomingEnd);
        }
        if ((calc.netAmount || 0) > 0) {
          const isToday = diff === 0;
          const prefix = isToday ? '🔴 <b>СЕГОДНЯ ОПЛАТА:</b>' : `🟡 <b>Оплата через ${diff} дн.:</b>`;
          billingAlertLines.push(
            `${prefix} <b>${escapeHtml(s.name)}</b> (${s.billing_day || bDay + ' число'}) — <b>${(calc.netAmount || 0).toLocaleString('ru-RU')} сум</b> (${calc.scheduledLessonsCount || 0} ур., баланс: ${s.lessons_balance ?? 0} ур.)`
          );
        }
      } catch {}
    }
  }

  // 2. Low balance / debt students (package <= 2 or date_to_date <= 0)
  const lowBalanceStudents = activeStudents.filter((s) =>
    s.billing_type === 'package'
      ? (s.lessons_balance ?? 0) <= 2
      : (s.lessons_balance ?? 0) <= 0
  );
  const lowBalanceLines: string[] = [];
  for (const s of lowBalanceStudents) {
    const bal = s.lessons_balance ?? 0;
    const rate = s.lesson_rate || 300000;
    if (s.billing_type === 'package') {
      const targetSize = s.monthly_target_lessons || 8;
      const packageSum = targetSize * rate;
      lowBalanceLines.push(
        `⚠️ <b>${escapeHtml(s.name)}</b> (пакет): осталось <b>${bal} ур.</b> (новый пакет ${targetSize} ур. = <b>${packageSum.toLocaleString('ru-RU')} сум</b>)`
      );
    } else {
      const debtText =
        bal < 0 ? ` — долг <b>${(Math.abs(bal) * rate).toLocaleString('ru-RU')} сум</b>` : '';
      lowBalanceLines.push(
        `⚠️ <b>${escapeHtml(s.name)}</b> (по датам): баланс <b>${bal} ур.</b>${debtText}`
      );
    }
  }

  if (billingAlertLines.length > 0 || lowBalanceLines.length > 0) {
    message += `💰 <b>БИЛЛИНГ И БАЛАНСЫ:</b>\n`;
    if (billingAlertLines.length > 0) {
      message += billingAlertLines.join('\n') + '\n\n';
    }
    if (lowBalanceLines.length > 0) {
      message += `<b>Низкий баланс уроков:</b>\n` + lowBalanceLines.join('\n') + '\n\n';
    }
  }

  keyboard.push([
    { text: '🚀 Открыть CRM', web_app: { url: APP_URL } },
    { text: '📋 Ученики', callback_data: 'list_students' },
  ]);

  return { text: message, markup: { inline_keyboard: keyboard } };
}
