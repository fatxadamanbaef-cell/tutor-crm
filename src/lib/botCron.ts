import { getLessons, getStudents, ensureRecurringLessonsForAllActiveStudents } from '@/lib/storage';
import { getTashkentNow, getTashkentTodayStr, isRealNote } from '@/lib/formatters';
import { sendTelegramMessage, buildMorningDigest, escapeHtml } from '@/lib/botMessaging';
import { supabase } from '@/lib/supabase';
import {
  claimNotification,
  releaseNotification,
  hasNotification,
  getRegisteredChatId,
} from '@/lib/botState';
import { getAllowedTelegramIds } from '@/lib/telegramAuth';
import { getTutorSettings } from '@/lib/settings';
import { format, startOfWeek, endOfWeek } from 'date-fns';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tutor-crm-kappa.vercel.app';

// In-memory cache to prevent duplicates within the same warm serverless instance
const notifiedLessonsMap = new Set<string>();

/**
 * Parses lesson start time in minutes from midnight (Asia/Tashkent).
 * Handles "14:00 - 16:00", "14:00 – 16:00", "14:00", or ISO date fallback.
 */
function parseLessonStartMinutes(timeStr?: string, isoDate?: string): { minutes: number; tag: string } {
  const fromTimeStr = String(timeStr || '').match(/(\d{1,2}):(\d{2})/);
  if (fromTimeStr) {
    const h = Number(fromTimeStr[1]);
    const m = Number(fromTimeStr[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return {
        minutes: h * 60 + m,
        tag: `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`,
      };
    }
  }

  const fromIso = String(isoDate || '').match(/T(\d{2}):(\d{2})/);
  if (fromIso) {
    const h = Number(fromIso[1]);
    const m = Number(fromIso[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return {
        minutes: h * 60 + m,
        tag: `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}`,
      };
    }
  }

  return { minutes: 16 * 60, tag: '1600' };
}

export async function resolveRecipientChatIds(explicitChatId?: string | null): Promise<string[]> {
  const recipients = new Set<string>();

  const explicit = (explicitChatId || '').trim();
  if (explicit) recipients.add(explicit);

  const envChatId = (process.env.TEACHER_TELEGRAM_CHAT_ID || '').trim();
  if (envChatId) recipients.add(envChatId);

  const configPhone = await getRegisteredChatId();
  if (configPhone) recipients.add(configPhone);

  // Final fallback: first whitelisted Telegram ID if nothing else is registered
  if (recipients.size === 0) {
    const allowed = getAllowedTelegramIds();
    const firstAllowed = allowed.values().next().value;
    if (firstAllowed) recipients.add(firstAllowed);
  }

  return Array.from(recipients);
}

async function deliverToRecipients(
  chatIds: string[],
  text: string,
  markup?: unknown
): Promise<number> {
  let delivered = 0;
  for (const chatId of chatIds) {
    const ok = await sendTelegramMessage(chatId, text, markup);
    if (ok) delivered += 1;
  }
  return delivered;
}

export interface RunCronResult {
  ok: boolean;
  mode: string;
  timestamp: string;
  tashkent_time: string;
  recipients_count: number;
  reminder_minutes_before: number;
  checked_lessons_today: number;
  notifications_sent: string[];
  errors: string[];
  message?: string;
}

export async function executeBotCron(options: {
  mode?: string;
  force?: boolean;
  explicitChatId?: string | null;
}): Promise<RunCronResult> {
  const mode = options.mode || 'reminders';
  const force = Boolean(options.force);
  const recipientChatIds = await resolveRecipientChatIds(options.explicitChatId);

  const now = getTashkentNow();
  const todayStr = getTashkentTodayStr();
  const currentHours = now.getHours();
  const currentMinutes = now.getMinutes();
  const currentTotalMinutes = currentHours * 60 + currentMinutes;
  const currentDayOfWeek = now.getDay(); // 0 = Sunday

  if (recipientChatIds.length === 0) {
    return {
      ok: true,
      mode,
      timestamp: now.toISOString(),
      tashkent_time: `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`,
      recipients_count: 0,
      reminder_minutes_before: 15,
      checked_lessons_today: 0,
      notifications_sent: [],
      errors: [],
      message: 'No recipient chat_id configured yet. Use /start in the bot to register.',
    };
  }

  // Generous windows for mode=all so cron jitter (5–30 min) never drops daily/weekly summaries.
  // Strict deduplication via _BOT_STATE guarantees each summary is delivered at most once per day.
  const isMorningWindow =
    currentTotalMinutes >= 8 * 60 + 15 && currentTotalMinutes <= 10 * 60 + 30;
  const isSundayEvening =
    currentDayOfWeek === 0 &&
    currentTotalMinutes >= 20 * 60 + 55 &&
    currentTotalMinutes <= 22 * 60 + 30;

  const shouldRunDigest = mode === 'digest' || (mode === 'all' && isMorningWindow);
  const shouldRunReminders = mode === 'reminders' || mode === 'all';
  const shouldRunWeekly = mode === 'weekly' || (mode === 'all' && isSundayEvening);

  const digestKey = `digest_v2_${todayStr}`;
  const weeklyKey = `weekly_v2_${todayStr}`;

  // Only extend recurring lessons when digest or weekly actually still needs to run (not on every 3-min tick)
  const needsDigestEnsure =
    shouldRunDigest && (force || (!notifiedLessonsMap.has(digestKey) && !(await hasNotification(digestKey))));
  const needsWeeklyEnsure =
    shouldRunWeekly && (force || (!notifiedLessonsMap.has(weeklyKey) && !(await hasNotification(weeklyKey))));

  if (needsDigestEnsure || needsWeeklyEnsure) {
    await ensureRecurringLessonsForAllActiveStudents(9).catch((e) => {
      console.error('[cron] Failed to auto-ensure recurring lessons:', e);
    });
  }

  const [lessons, students, tutorSettings] = await Promise.all([
    getLessons(),
    getStudents(),
    getTutorSettings(),
  ]);

  const notificationsSent: string[] = [];
  const deliveryErrors: string[] = [];

  // =========================================================================
  // 1. MORNING DIGEST (08:30 Asia/Tashkent; 08:15–10:30 window in mode=all)
  // =========================================================================
  if (shouldRunDigest) {
    const claimed =
      force || (!notifiedLessonsMap.has(digestKey) && (await claimNotification(digestKey)));

    if (claimed) {
      notifiedLessonsMap.add(digestKey);
      try {
        const { text: digestText, markup } = await buildMorningDigest(tutorSettings.tutorName, {
          lessons,
          students,
          tutorSettings,
          skipEnsureRecurring: true,
        });
        const delivered = await deliverToRecipients(recipientChatIds, digestText, markup);
        if (delivered > 0) {
          notificationsSent.push(
            `Morning digest sent to ${delivered}/${recipientChatIds.length} chats`
          );
        } else {
          notifiedLessonsMap.delete(digestKey);
          if (!force) await releaseNotification(digestKey);
          deliveryErrors.push('Morning digest failed to deliver via Telegram API');
        }
      } catch (err) {
        notifiedLessonsMap.delete(digestKey);
        if (!force) await releaseNotification(digestKey);
        console.error('[cron] Morning digest error:', err);
        deliveryErrors.push('Morning digest threw an error');
      }
    }
  }

  // =========================================================================
  // 2. PRE-LESSON REMINDERS (Uses tutor_settings.reminder_minutes_before)
  //    Window: [1 .. reminderBefore + 5] minutes before lesson start.
  // =========================================================================
  const reminderBefore = Math.max(5, Number(tutorSettings.reminderMinutesBefore) || 15);
  const reminderWindowMin = 1;
  const reminderWindowMax = reminderBefore + 5;
  let todayPlannedCount = 0;

  if (shouldRunReminders) {
    const todayPlannedLessons = lessons.filter(
      (l) =>
        l.date.startsWith(todayStr) &&
        (l.status === 'planned' || l.status === 'scheduled') &&
        (force || !l.reminder_sent)
    );
    todayPlannedCount = todayPlannedLessons.length;

    for (const lesson of todayPlannedLessons) {
      const { minutes: lessonStartMinutes, tag: startTag } = parseLessonStartMinutes(
        lesson.time_str,
        lesson.date
      );
      const minutesUntilStart = lessonStartMinutes - currentTotalMinutes;
      const reminderKey = `reminder_v2_${lesson.id}_${todayStr}_${startTag}`;

      if (minutesUntilStart >= reminderWindowMin && minutesUntilStart <= reminderWindowMax) {
        const claimed =
          force || (!notifiedLessonsMap.has(reminderKey) && (await claimNotification(reminderKey)));
        if (!claimed) continue;

        notifiedLessonsMap.add(reminderKey);

        try {
          const student = students.find((s) => s.id === lesson.student_id);
          const studentName = student?.name || lesson.student_name || 'Ученик';
          const target = student?.monthly_target_lessons || 12;
          const conducted = student?.conducted_this_month || 0;

          const studentPastMisses = lessons
            .filter(
              (l) =>
                l.student_id === lesson.student_id &&
                (l.status === 'missed' ||
                  l.status === 'missed_excused' ||
                  l.status === 'missed_penalty')
            )
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 2);

          const lastCompletedLesson = lessons
            .filter(
              (l) =>
                l.student_id === lesson.student_id &&
                l.status === 'completed' &&
                l.date < lesson.date &&
                isRealNote(l.notes)
            )
            .sort((a, b) => b.date.localeCompare(a.date))[0];

          let alertText = `🔔 <b>Через ${minutesUntilStart} мин урок: ${escapeHtml(studentName)} (${escapeHtml(lesson.time_str || '16:00')})</b>\n\n`;
          alertText += `⚖️ <b>Баланс уроков:</b> <b>${student?.lessons_balance ?? 0} ур.</b> | проведено в мес.: <b>${conducted}/${target}</b>\n`;

          if (studentPastMisses.length > 0) {
            studentPastMisses.forEach((m) => {
              const d = m.date.substring(0, 10).split('-').reverse().slice(0, 2).join('.');
              alertText += `• ${d} — ${escapeHtml(m.miss_reason || 'Пропуск')}\n`;
            });
          }
          alertText += `\n`;

          if (lastCompletedLesson && lastCompletedLesson.notes) {
            alertText += `📝 <b>Заметка с прошлого урока:</b> <i>${escapeHtml(lastCompletedLesson.notes)}</i>\n\n`;
          }

          const alertMarkup = {
            inline_keyboard: [
              [
                { text: '✅ Был', callback_data: `status:${lesson.id}:completed` },
                { text: '🔥 Сгорел', callback_data: `status:${lesson.id}:penalty` },
                { text: '🛑 Отмена', callback_data: `status:${lesson.id}:excused` },
              ],
            ],
          };

          const delivered = await deliverToRecipients(recipientChatIds, alertText, alertMarkup);

          if (delivered > 0) {
            if (supabase) {
              await supabase
                .from('tutor_lessons')
                .update({ reminder_sent: true })
                .eq('id', lesson.id);
            }
            notificationsSent.push(
              `Reminder (${minutesUntilStart}m) for ${studentName} sent to ${delivered}/${recipientChatIds.length} chats`
            );
          } else {
            notifiedLessonsMap.delete(reminderKey);
            if (!force) await releaseNotification(reminderKey);
            deliveryErrors.push(`Reminder for ${studentName} failed to deliver via Telegram API`);
          }
        } catch (err) {
          notifiedLessonsMap.delete(reminderKey);
          if (!force) await releaseNotification(reminderKey);
          console.error('[cron] Reminder error for lesson', lesson.id, err);
          deliveryErrors.push(`Reminder for lesson ${lesson.id} threw an error`);
        }
      }
    }
  }

  // =========================================================================
  // 3. WEEKLY SUMMARY & AUTO-SCHEDULE EXTENSION (Sunday 21:00 Tashkent)
  // =========================================================================
  if (shouldRunWeekly) {
    const claimed =
      force || (!notifiedLessonsMap.has(weeklyKey) && (await claimNotification(weeklyKey)));

    if (claimed) {
      notifiedLessonsMap.add(weeklyKey);
      try {
        const weekStart = format(startOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');
        const weekEnd = format(endOfWeek(now, { weekStartsOn: 1 }), 'yyyy-MM-dd');

        const weekLessons = lessons.filter((l) => {
          const d = l.date.substring(0, 10);
          return d >= weekStart && d <= weekEnd;
        });

        const completedWeek = weekLessons.filter((l) => l.status === 'completed');
        const penaltyWeek = weekLessons.filter(
          (l) => l.status === 'missed_penalty' || l.status === 'missed'
        );
        const excusedWeek = weekLessons.filter((l) => l.status === 'missed_excused');

        let weeklyText = `📈 <b>Итоги недели (${weekStart.split('-').slice(1).join('.')} – ${weekEnd.split('-').slice(1).join('.')}):</b>\n\n`;
        weeklyText += `✅ Проведено уроков: <b>${completedWeek.length}</b>\n`;
        weeklyText += `🔥 Сгорело (платные пропуски): <b>${penaltyWeek.length}</b>\n`;
        weeklyText += `🛑 Уважительных отмен: <b>${excusedWeek.length}</b>\n\n`;

        if (penaltyWeek.length > 0 || excusedWeek.length > 0) {
          weeklyText += `<b>Пропуски и отмены:</b>\n`;
          [...penaltyWeek, ...excusedWeek].forEach((m) => {
            const d = m.date.substring(0, 10).split('-').reverse().slice(0, 2).join('.');
            const icon = m.status === 'missed_excused' ? '🛑' : '🔥';
            weeklyText += `• ${icon} <b>${escapeHtml(m.student_name || 'Ученик')}</b> (${d}) — <i>${escapeHtml(m.miss_reason || 'Пропуск')}</i>\n`;
          });
          weeklyText += `\n`;
        }

        const weeklyMarkup = {
          inline_keyboard: [[{ text: '🚀 Открыть CRM', web_app: { url: APP_URL } }]],
        };

        const delivered = await deliverToRecipients(recipientChatIds, weeklyText, weeklyMarkup);
        if (delivered > 0) {
          const generatedCount = await ensureRecurringLessonsForAllActiveStudents(9);
          notificationsSent.push(
            `Weekly summary sent to ${delivered}/${recipientChatIds.length} chats, auto-extended ${generatedCount} lessons`
          );
        } else {
          notifiedLessonsMap.delete(weeklyKey);
          if (!force) await releaseNotification(weeklyKey);
          deliveryErrors.push('Weekly summary failed to deliver via Telegram API');
        }
      } catch (err) {
        notifiedLessonsMap.delete(weeklyKey);
        if (!force) await releaseNotification(weeklyKey);
        console.error('[cron] Weekly summary error:', err);
        deliveryErrors.push('Weekly summary threw an error');
      }
    }
  }

  return {
    ok: deliveryErrors.length === 0,
    mode,
    timestamp: now.toISOString(),
    tashkent_time: `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`,
    recipients_count: recipientChatIds.length,
    reminder_minutes_before: reminderBefore,
    checked_lessons_today: todayPlannedCount,
    notifications_sent: notificationsSent,
    errors: deliveryErrors,
  };
}
