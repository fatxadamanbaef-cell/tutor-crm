import { NextRequest, NextResponse } from 'next/server';
import { getLessons, getStudents } from '@/lib/storage';
import { getTashkentNow, getTashkentTodayStr, formatUZS } from '@/lib/formatters';
import { sendTelegramMessage, buildMorningDigest } from '../route';
import { supabase } from '@/lib/supabase';

const TEACHER_TELEGRAM_CHAT_ID = process.env.TEACHER_TELEGRAM_CHAT_ID || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tutor-crm-kappa.vercel.app';

// In-memory notified cache to avoid sending duplicate 15-min notifications for the same lesson
const notifiedLessonsMap = new Set<string>();

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'all'; // 'digest', 'reminders', 'all'
    const targetChatId = url.searchParams.get('chat_id') || TEACHER_TELEGRAM_CHAT_ID;

    // Fetch registered chats from database if any
    let recipientChatIds: (string | number)[] = [];
    if (targetChatId) {
      recipientChatIds.push(targetChatId);
    }

    if (supabase) {
      const { data: chats } = await supabase.from('tutor_bot_chats').select('chat_id');
      if (chats && chats.length > 0) {
        chats.forEach((c) => {
          if (c.chat_id && !recipientChatIds.includes(c.chat_id)) {
            recipientChatIds.push(c.chat_id);
          }
        });
      }
    }

    if (recipientChatIds.length === 0) {
      // Fallback default: if no chat registered yet, return ok with warning
      return NextResponse.json({
        ok: true,
        message: 'No recipient chat_id configured yet. Interact with the bot using /start to register.',
      });
    }

    const now = getTashkentNow();
    const todayStr = getTashkentTodayStr();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTotalMinutes = currentHours * 60 + currentMinutes;

    const [lessons, students] = await Promise.all([
      getLessons(),
      getStudents(),
    ]);

    const notificationsSent: string[] = [];

    // 1. MORNING DIGEST CHECK (if mode === 'digest' or if current time is ~08:30)
    if (mode === 'digest' || mode === 'all') {
      const digestKey = `digest_${todayStr}`;
      const isMorningWindow = currentHours === 8 && currentMinutes >= 20 && currentMinutes <= 40;

      if (mode === 'digest' || (isMorningWindow && !notifiedLessonsMap.has(digestKey))) {
        notifiedLessonsMap.add(digestKey);
        const { text: digestText } = await buildMorningDigest('Фархад');
        const replyMarkup = {
          inline_keyboard: [
            [{ text: '🚀 Открыть Tutor Tracker', web_app: { url: APP_URL } }],
          ],
        };

        for (const chatId of recipientChatIds) {
          await sendTelegramMessage(chatId, digestText, replyMarkup);
        }
        notificationsSent.push(`Morning digest sent to ${recipientChatIds.length} chats`);
      }
    }

    // 2. 15-MINUTE LESSON REMINDERS CHECK
    if (mode === 'reminders' || mode === 'all') {
      const todayPlannedLessons = lessons.filter(
        (l) => l.date.startsWith(todayStr) && l.status === 'planned'
      );

      for (const lesson of todayPlannedLessons) {
        let lessonStartMinutes = 0;
        if (lesson.time_str && lesson.time_str.includes('-')) {
          const startTimeStr = lesson.time_str.split('-')[0].trim();
          const [sh, sm] = startTimeStr.split(':').map(Number);
          lessonStartMinutes = sh * 60 + sm;
        } else {
          lessonStartMinutes = 18 * 60; // default 18:00
        }

        const minutesUntilStart = lessonStartMinutes - currentTotalMinutes;
        const reminderKey = `reminder_15m_${lesson.id}_${todayStr}`;

        // If lesson starts in 5 to 20 minutes (approx. 15 minutes before)
        if (minutesUntilStart >= 5 && minutesUntilStart < 15 && !notifiedLessonsMap.has(reminderKey)) {
          notifiedLessonsMap.add(reminderKey);

          const student = students.find((s) => s.id === lesson.student_id);
          const studentName = student?.name || lesson.student_name || 'Ученик';
          const balanceStr = student
            ? student.prepaid_balance > 0
              ? `+${student.prepaid_balance} ур.`
              : `${student.prepaid_balance} ур.`
            : '0 ур.';

          let alertText = `🔔 <b>Напоминание: Урок через ${minutesUntilStart} минут!</b>\n\n`;
          alertText += `⏰ <b>Время:</b> ${lesson.time_str || '18:00'}\n`;
          alertText += `👤 <b>Ученик:</b> <b>${studentName}</b>\n`;
          if (lesson.notes) {
            alertText += `📝 <b>Тема / ДЗ:</b> <i>${lesson.notes}</i>\n`;
          }
          alertText += `🎟 <b>Остаток абонемента:</b> <i>${balanceStr}</i>\n`;
          if (student && student.prepaid_balance <= 1) {
            alertText += `⚠️ <i>Внимание: требуется оплата абонемента!</i>\n`;
          }

          const alertMarkup = {
            inline_keyboard: [
              [
                {
                  text: '⚡ Отметить урок',
                  web_app: { url: APP_URL },
                },
                {
                  text: '📋 Отчет по ученику',
                  callback_data: `report:${lesson.student_id}`,
                },
              ],
            ],
          };

          for (const chatId of recipientChatIds) {
            await sendTelegramMessage(chatId, alertText, alertMarkup);
          }
          notificationsSent.push(`15m alert for lesson ${lesson.id} (${studentName}) sent`);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      tashkent_time: `${currentHours}:${currentMinutes.toString().padStart(2, '0')}`,
      notifications_sent: notificationsSent,
    });
  } catch (error) {
    console.error('Cron reminder error', error);
    return NextResponse.json({ ok: false, error: 'Cron execution failed' }, { status: 500 });
  }
}
