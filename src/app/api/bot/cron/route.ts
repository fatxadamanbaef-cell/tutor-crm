import { NextRequest, NextResponse } from 'next/server';
import { getLessons, getStudents, getPendingMakeups, ensureRecurringLessonsForAllActiveStudents } from '@/lib/storage';
import { getTashkentNow, getTashkentTodayStr } from '@/lib/formatters';
import { sendTelegramMessage, buildMorningDigest } from '../route';
import { supabase } from '@/lib/supabase';
import { format, parseISO, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { ru } from 'date-fns/locale';

const TEACHER_TELEGRAM_CHAT_ID = process.env.TEACHER_TELEGRAM_CHAT_ID || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tutor-crm-kappa.vercel.app';

// In-memory cache to prevent duplicates within the same process
const notifiedLessonsMap = new Set<string>();

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'all'; // 'digest', 'reminders', 'weekly', 'all'
    const targetChatId = url.searchParams.get('chat_id') || TEACHER_TELEGRAM_CHAT_ID;

    // Fetch registered chats
    let recipientChatIds: (string | number)[] = [];
    if (targetChatId) {
      recipientChatIds.push(targetChatId);
    }

    if (supabase) {
      const { data: botConfig } = await supabase
        .from('tutor_students')
        .select('phone')
        .eq('name', '_BOT_CONFIG')
        .single();
      if (botConfig && botConfig.phone && !recipientChatIds.includes(botConfig.phone)) {
        recipientChatIds.push(botConfig.phone);
      }
    }

    if (recipientChatIds.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No recipient chat_id configured yet. Use /start in the bot to register.',
      });
    }

    const now = getTashkentNow();
    const todayStr = getTashkentTodayStr();
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentTotalMinutes = currentHours * 60 + currentMinutes;
    const currentDayOfWeek = now.getDay(); // 0 = Sunday

    await ensureRecurringLessonsForAllActiveStudents(4).catch((e) => {
      console.error('Failed to auto-ensure recurring lessons in cron:', e);
    });

    const [lessons, students, pendingMakeups] = await Promise.all([
      getLessons(),
      getStudents(),
      getPendingMakeups(),
    ]);

    const notificationsSent: string[] = [];

    // =========================================================================
    // 1. MORNING DIGEST (08:30 Asia/Tashkent)
    // =========================================================================
    if (mode === 'digest' || mode === 'all') {
      const digestKey = `digest_${todayStr}`;
      const isMorningWindow = currentHours === 8 && currentMinutes >= 20 && currentMinutes <= 40;

      if (mode === 'digest' || (isMorningWindow && !notifiedLessonsMap.has(digestKey))) {
        notifiedLessonsMap.add(digestKey);
        const { text: digestText, markup } = await buildMorningDigest('Фархад');

        for (const chatId of recipientChatIds) {
          await sendTelegramMessage(chatId, digestText, markup);
        }
        notificationsSent.push(`Morning digest sent to ${recipientChatIds.length} chats`);
      }
    }

    // =========================================================================
    // 2. 15-MINUTE LESSON REMINDERS (Checks lessons starting in 13-17 mins)
    // =========================================================================
    if (mode === 'reminders' || mode === 'all') {
      const todayPlannedLessons = lessons.filter(
        (l) => l.date.startsWith(todayStr) && l.status === 'planned' && !l.reminder_sent
      );

      for (const lesson of todayPlannedLessons) {
        let lessonStartMinutes = 0;
        if (lesson.time_str && lesson.time_str.includes('-')) {
          const startTimeStr = lesson.time_str.split('-')[0].trim();
          const [sh, sm] = startTimeStr.split(':').map(Number);
          lessonStartMinutes = sh * 60 + sm;
        } else {
          lessonStartMinutes = 16 * 60; // default 16:00
        }

        const minutesUntilStart = lessonStartMinutes - currentTotalMinutes;
        const reminderKey = `reminder_15m_${lesson.id}_${todayStr}`;

        // 13 to 17 minutes before start
        if (minutesUntilStart >= 12 && minutesUntilStart <= 18 && !notifiedLessonsMap.has(reminderKey)) {
          notifiedLessonsMap.add(reminderKey);

          const student = students.find((s) => s.id === lesson.student_id);
          const studentName = student?.name || lesson.student_name || 'Ученик';
          const target = student?.monthly_target_lessons || 12;
          const conducted = student?.conducted_this_month || 0;
          const missed = student?.missed_this_month || 0;

          // Find recent past misses for context
          const studentPastMisses = lessons
            .filter((l) => l.student_id === lesson.student_id && (l.status === 'missed' || l.status === 'missed_excused' || l.status === 'missed_penalty'))
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 2);

          // Find note from past completed lesson
          const lastCompletedLesson = lessons
            .filter((l) => l.student_id === lesson.student_id && l.status === 'completed' && l.date < lesson.date && Boolean(l.notes))
            .sort((a, b) => b.date.localeCompare(a.date))[0];

          let alertText = `🔔 <b>Через 15 минут урок: ${studentName} (${lesson.time_str || '16:00'})</b>\n\n`;
          alertText += `📊 <b>Архив за месяц:</b> проведено <b>${conducted} из ${target}</b> | пропущено: <b>${missed}</b>\n`;

          if (studentPastMisses.length > 0) {
            studentPastMisses.forEach((m) => {
              const d = m.date.substring(0, 10).split('-').reverse().slice(0, 2).join('.');
              alertText += `• ${d} — ${m.miss_reason || 'Пропуск'}\n`;
            });
          }
          alertText += `\n`;

          if (lastCompletedLesson && lastCompletedLesson.notes) {
            alertText += `📝 <b>Заметка с прошлого урока:</b> <i>${lastCompletedLesson.notes}</i>\n\n`;
          }

          const alertMarkup = {
            inline_keyboard: [
              [{ text: '✅ Проведен', callback_data: `status:${lesson.id}:completed` }],
              [{ text: '❌ Пропуск (указать причину)', callback_data: `status:${lesson.id}:miss_prompt` }],
              [{ text: '🔄 На отработку в ВС', callback_data: `status:${lesson.id}:makeup_prompt` }],
            ],
          };

          for (const chatId of recipientChatIds) {
            await sendTelegramMessage(chatId, alertText, alertMarkup);
          }

          // Mark reminder_sent in DB
          if (supabase) {
            await supabase.from('tutor_lessons').update({ reminder_sent: true }).eq('id', lesson.id);
          }

          notificationsSent.push(`15m alert for ${studentName} sent`);
        }
      }
    }

    // =========================================================================
    // 3. WEEKLY SUMMARY & AUTO-SCHEDULE EXTENSION (Sunday 21:00)
    // =========================================================================
    if (mode === 'weekly' || mode === 'all') {
      const weeklyKey = `weekly_${todayStr}`;
      const isSundayEvening = currentDayOfWeek === 0 && currentHours === 21 && currentMinutes >= 0 && currentMinutes <= 30;

      if (mode === 'weekly' || (isSundayEvening && !notifiedLessonsMap.has(weeklyKey))) {
        notifiedLessonsMap.add(weeklyKey);

        const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');

        const weekLessons = lessons.filter((l) => {
          const d = l.date.substring(0, 10);
          return d >= weekStart && d <= weekEnd;
        });

        const completedWeek = weekLessons.filter((l) => l.status === 'completed');
        const missedWeek = weekLessons.filter((l) => l.status === 'missed' || l.status === 'missed_excused' || l.status === 'missed_penalty');
        const makeupsDoneToday = weekLessons.filter((l) => l.is_makeup && l.status === 'completed' && l.date.startsWith(todayStr));

        let weeklyText = `📈 <b>Итоги недели (${weekStart.split('-').slice(1).join('.')} – ${weekEnd.split('-').slice(1).join('.')}):</b>\n\n`;
        weeklyText += `✅ Всего проведено: <b>${completedWeek.length} уроков</b>\n`;
        weeklyText += `❌ Пропущено: <b>${missedWeek.length} уроков</b>\n`;

        if (missedWeek.length > 0) {
          missedWeek.forEach((m) => {
            const d = m.date.substring(0, 10).split('-').reverse().slice(0, 2).join('.');
            weeklyText += `• <b>${m.student_name}</b> (${d}) — <i>${m.miss_reason || 'Пропуск'}</i>\n`;
          });
        }
        weeklyText += `\n`;

        weeklyText += `🔄 <b>Отработки и переносы на воскресенье:</b>\n`;
        weeklyText += `• Проведено отработок сегодня: <b>${makeupsDoneToday.length}</b>\n`;
        weeklyText += `• Остались не отработаны: <b>${pendingMakeups.length}</b>\n`;

        const weeklyMarkup = {
          inline_keyboard: [[{ text: '🚀 Открыть CRM', web_app: { url: APP_URL } }]],
        };

        for (const chatId of recipientChatIds) {
          await sendTelegramMessage(chatId, weeklyText, weeklyMarkup);
        }

        // Auto-extend recurring schedule +1 week ahead
        const generatedCount = await ensureRecurringLessonsForAllActiveStudents(4);
        notificationsSent.push(`Weekly summary sent, auto-extended ${generatedCount} lessons`);
      }
    }

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      tashkent_time: `${currentHours}:${currentMinutes.toString().padStart(2, '0')}`,
      notifications_sent: notificationsSent,
    });
  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json({ ok: false, error: 'Cron execution failed' }, { status: 500 });
  }
}
