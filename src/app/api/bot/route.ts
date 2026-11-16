import { NextRequest, NextResponse } from 'next/server';
import { getLessons, getStudents, setLessonStatusDirect, updateLessonDetails, ensureRecurringLessonsForAllActiveStudents, calculateStudentBilling } from '@/lib/storage';
import { formatTashkentHeaderDate, isTashkentToday, getTashkentNow, formatRuDateWithDay } from '@/lib/formatters';
import { generateStudentReport, findStudentsByName } from '@/lib/reports';
import { supabase } from '@/lib/supabase';
import { claimUpdate, clearHistory, setPendingReason, popPendingReason } from '@/lib/botState';
import { normName } from '@/lib/nameMatch';

export const maxDuration = 60;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tutor-crm-kappa.vercel.app';

const escapeHtml = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function sendTelegramMessage(chatId: number | string, text: string, replyMarkup?: any) {
  if (!BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', reply_markup: replyMarkup }),
    });
    const data = await res.json();
    if (!data.ok) {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: text.replace(/<[^>]*>/g, ''), reply_markup: replyMarkup }),
      });
    }
  } catch (error) {
    console.error('Failed to send telegram message', error);
  }
}

async function editTelegramMessage(chatId: number | string, messageId: number, text: string, replyMarkup?: any) {
  if (!BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup: replyMarkup }),
    });
  } catch (error) {}
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || '' }),
    });
  } catch (e) {}
}

export async function buildMorningDigest(firstName: string = 'Фархад') {
  const todayFormatted = formatTashkentHeaderDate();
  await ensureRecurringLessonsForAllActiveStudents(9).catch((e) => {
    console.error('Failed to ensure recurring lessons in buildMorningDigest:', e);
  });
  const [lessons, students] = await Promise.all([getLessons(), getStudents()]);
  const todayLessons = lessons
    .filter((l) => isTashkentToday(l.date))
    .sort((a, b) => (a.time_str || '').localeCompare(b.time_str || ''));

  let message = `☀️ <b>Доброе утро! Расписание на сегодня (${todayFormatted}):</b>\n`;
  message += `Всего запланировано: <b>${todayLessons.length} уроков</b>\n\n`;

  const keyboard: any[] = [];

  if (todayLessons.length === 0) {
    message += `<i>На сегодня уроков не запланировано. Отличного дня!</i>\n\n`;
  } else {
    todayLessons.forEach((l, i) => {
      const student = students.find((s) => s.id === l.student_id);
      const studentName = student?.name || l.student_name || 'Ученик';
      const target = student?.monthly_target_lessons || 12;
      const conducted = student?.conducted_this_month || 0;
      const isCompleted = l.status === 'completed';
      const isMissed = l.status === 'missed' || l.status === 'missed_excused' || l.status === 'missed_penalty';
      const statusIcon = isCompleted ? '✅' : isMissed ? '❌' : '⏳';

      const timeSlot = l.time_str || '16:00 – 17:30';
      message += `${i + 1}️⃣ <b>${timeSlot}</b> — <b>${studentName}</b> (В этом месяце: ${conducted}/${target}) ${statusIcon}\n`;

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
  const todayDayNumber = now.getDate();

  // 1. Date-to-date students whose billing_day is today or in 1–2 days
  const billingAlertLines: string[] = [];
  const dateToDateStudents = students.filter((s) => s.billing_type !== 'package');
  for (const s of dateToDateStudents) {
    const match = String(s.billing_day || '').match(/\d+/);
    if (!match) continue;
    const bDay = Number(match[0]);
    // check if bDay is today or in 1-2 days
    const diff = (bDay - todayDayNumber + 31) % 31;
    if (diff >= 0 && diff <= 2) {
      try {
        const calc = await calculateStudentBilling(s.id);
        const isToday = diff === 0;
        const prefix = isToday ? '🔴 <b>СЕГОДНЯ ОПЛАТА:</b>' : `🟡 <b>Оплата через ${diff} дн.:</b>`;
        billingAlertLines.push(
          `${prefix} <b>${escapeHtml(s.name)}</b> (${s.billing_day || bDay + ' число'}) — <b>${(calc.netAmount || 0).toLocaleString('ru-RU')} сум</b> (${calc.scheduledLessonsCount || 0} ур., баланс: ${s.lessons_balance ?? 0} ур.)`
        );
      } catch {}
    }
  }

  // 2. Package / low balance students (lessons_balance <= 2 or negative)
  const lowBalanceStudents = students.filter((s) => s.billing_type === 'package' && (s.lessons_balance ?? 0) <= 2);
  const lowBalanceLines: string[] = [];
  for (const s of lowBalanceStudents) {
    const targetSize = s.monthly_target_lessons || 8;
    const rate = s.lesson_rate || 300000;
    const packageSum = targetSize * rate;
    lowBalanceLines.push(
      `⚠️ <b>${escapeHtml(s.name)}</b>: осталось <b>${s.lessons_balance ?? 0} ур.</b> (к оплате пакет ${targetSize} ур. = <b>${packageSum.toLocaleString('ru-RU')} сум</b>)`
    );
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

async function buildStudentsKeyboard() {
  const students = await getStudents();
  if (students.length === 0) {
    return { inline_keyboard: [[{ text: '🚀 Открыть CRM', web_app: { url: APP_URL } }]] };
  }
  const buttons: Array<Array<{ text: string; callback_data?: string; web_app?: { url: string } }>> = students.map((s) => {
    const target = s.monthly_target_lessons || 12;
    const conducted = s.conducted_this_month || 0;
    return [{ text: `👤 ${s.name} (${conducted}/${target} ур.)`, callback_data: `report:${s.id}` }];
  });
  buttons.push([{ text: '🚀 Открыть CRM', web_app: { url: APP_URL } }]);
  return { inline_keyboard: buttons };
}

async function registerChatId(chatId: number | string, username?: string) {
  if (!supabase) return;
  try {
    const { data } = await supabase.from('tutor_students').select('id').eq('name', '_BOT_CONFIG').single();
    if (data) {
      await supabase.from('tutor_students').update({ phone: String(chatId) }).eq('id', data.id);
    } else {
      await supabase.from('tutor_students').insert([
        { name: '_BOT_CONFIG', phone: String(chatId), monthly_target_lessons: 0 },
      ]);
    }
  } catch (e) {
    console.error('Register chat id failed', e);
  }
}

async function sendChatAction(chatId: number | string, action: string = 'typing') {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch (e) {}
}

async function sendLongMessage(chatId: number | string, text: string, replyMarkup?: any) {
  const LIMIT = 3800;
  if (text.length <= LIMIT) return sendTelegramMessage(chatId, text, replyMarkup);
  const chunks: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    if ((current + '\n' + line).length > LIMIT && current) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n' + line : line;
    }
  }
  if (current) chunks.push(current);
  for (let i = 0; i < chunks.length; i++) {
    await sendTelegramMessage(chatId, chunks[i], i === chunks.length - 1 ? replyMarkup : undefined);
  }
}

async function handleMessage(message: any) {
  const chatId = message.chat.id;
  if (chatId) await registerChatId(chatId, message.from?.username);

  let rawText = '';
  if (message.text) {
    rawText = message.text.trim();
  } else if (message.voice) {
    const { transcribeVoice } = await import('@/lib/openai');
    await sendTelegramMessage(chatId, '🎤 <i>Слушаю...</i>');
    rawText = await transcribeVoice(message.voice.file_id);
    if (!rawText) {
      await sendTelegramMessage(chatId, '❌ Не удалось распознать голосовое сообщение.');
      return;
    }
    await sendTelegramMessage(chatId, `💬 <i>"${escapeHtml(rawText)}"</i>`);
  }

  const text = rawText.toLowerCase();
  const firstName = message.from?.first_name || 'Фархад';

  const defaultMarkup = {
    inline_keyboard: [
      [{ text: '🚀 Открыть CRM', web_app: { url: APP_URL } }, { text: '📅 Расписание', callback_data: 'daily_schedule' }],
      [{ text: '📋 Ученики', callback_data: 'list_students' }],
    ],
  };

  // Check if we are waiting for a miss reason from a previous quick button tap
  const pendingReason = await popPendingReason();
  if (pendingReason) {
    try {
      await updateLessonDetails(pendingReason.lessonId, { miss_reason: rawText });
      await sendTelegramMessage(
        chatId,
        `✅ Причина пропуска для ученика <b>${escapeHtml(pendingReason.studentName)}</b> записана в архив:\n<i>«${escapeHtml(rawText)}»</i>${pendingReason.needsMakeup ? '\n🔄 Урок добавлен в отработки на воскресенье.' : ''}`,
        defaultMarkup
      );
      return;
    } catch (e) {
      console.error('Failed to save miss reason from bot:', e);
    }
  }

  if (text.startsWith('/start') || text.startsWith('/help')) {
    const welcomeText = `🚀 <b>Tutor Tracker Bot 2.0</b>\n\n<b>Команды:</b>\n/today — Расписание на сегодня\n/students — Список учеников\n/reset — Очистить контекст диалога с ИИ\n\nИли напишите / надиктуйте голосом: «Сахиб сегодня был», «Алина пропустила, заболела, поставь на отработку в ВС», «Перенеси Тимура на пятницу в 16:00», «Дай сводку за неделю».`;
    await sendTelegramMessage(chatId, welcomeText, defaultMarkup);
  } else if (text.startsWith('/reset') || text.startsWith('/new')) {
    await clearHistory();
    await sendTelegramMessage(chatId, '🧹 Контекст разговора очищен.');
  } else if (text.startsWith('/today') || text.startsWith('/digest')) {
    const { text: msgText, markup } = await buildMorningDigest(firstName);
    await sendTelegramMessage(chatId, msgText, markup);
  } else if (text.startsWith('/students')) {
    const keyboard = await buildStudentsKeyboard();
    await sendTelegramMessage(chatId, '📋 <b>Список учеников:</b>', keyboard);
  } else {
    // Check if query is just a student name
    const q = normName(rawText);
    const found = q.length >= 2 ? await findStudentsByName(rawText) : [];
    const exact = found.filter((s) => normName(s.name) === q);
    const candidates = exact.length > 0 ? exact : q.length >= 4 ? found.filter((s) => normName(s.name).startsWith(q)) : [];

    if (candidates.length === 1) {
      const report = await generateStudentReport(candidates[0].id);
      if (report) {
        const reportMarkup = {
          inline_keyboard: [
            [{ text: '📋 Все ученики', callback_data: 'list_students' }, { text: '🚀 Открыть CRM', web_app: { url: APP_URL } }],
          ],
        };
        await sendLongMessage(chatId, report.telegramHtml, reportMarkup);
      }
    } else if (candidates.length > 1) {
      const buttons = candidates.map((s) => [{ text: `👤 ${s.name}`, callback_data: `report:${s.id}` }]);
      await sendTelegramMessage(chatId, `Найдено несколько учеников по запросу "${escapeHtml(rawText)}":`, { inline_keyboard: buttons });
    } else {
      await sendChatAction(chatId, 'typing');
      const { processWithAI } = await import('@/lib/openai');
      const aiReply = await processWithAI(rawText);
      await sendLongMessage(chatId, aiReply, defaultMarkup);
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    if (typeof update.update_id === 'number' && !(await claimUpdate(update.update_id))) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    if (update.callback_query) {
      const cq = update.callback_query;
      const data = cq.data || '';
      const chatId = cq.message?.chat?.id || cq.from?.id;
      const messageId = cq.message?.message_id;
      if (chatId) registerChatId(chatId, cq.from?.username);

      if (data.startsWith('report:')) {
        const studentId = data.replace('report:', '');
        await answerCallbackQuery(cq.id, 'Формирую отчет...');
        const report = await generateStudentReport(studentId);
        if (report) {
          const reportMarkup = {
            inline_keyboard: [
              [{ text: '📋 Все ученики', callback_data: 'list_students' }, { text: '🚀 Открыть CRM', web_app: { url: APP_URL } }],
            ],
          };
          if (messageId) {
            await editTelegramMessage(chatId, messageId, report.telegramHtml, reportMarkup);
          } else {
            await sendTelegramMessage(chatId, report.telegramHtml, reportMarkup);
          }
        }
        return NextResponse.json({ ok: true });
      } else if (data.startsWith('status:')) {
        // format: status:lessonId:action
        const parts = data.split(':');
        const lessonId = parts[1];
        const action = parts[2];

        const lessons = await getLessons();
        const lesson = lessons.find((l) => l.id === lessonId);
        const studentName = lesson?.student_name || 'Ученик';

        if (action === 'completed') {
          const res = await setLessonStatusDirect(lessonId, 'completed');
          await answerCallbackQuery(cq.id, `✅ Был! Баланс: ${res.newBalance} ур.`);
          if (messageId) {
            await editTelegramMessage(
              chatId,
              messageId,
              `✅ <b>Урок проведен: ${escapeHtml(studentName)}</b> (${lesson?.time_str || ''})\n⚖️ Остаток на балансе: <b>${res.newBalance} ур.</b>`
            );
          }
        } else if (action === 'penalty' || action === 'miss_prompt') {
          const res = await setLessonStatusDirect(lessonId, 'missed_penalty', 'Пропуск без предупреждения');
          await answerCallbackQuery(cq.id, `🔥 Сгорел! Баланс: ${res.newBalance} ур.`);
          if (messageId) {
            await editTelegramMessage(
              chatId,
              messageId,
              `🔥 <b>Урок сгорел (списан): ${escapeHtml(studentName)}</b>\n⚖️ Остаток на балансе: <b>${res.newBalance} ур.</b>`
            );
          }
        } else if (action === 'excused' || action === 'makeup_prompt') {
          const res = await setLessonStatusDirect(lessonId, 'missed_excused', 'Уважительная отмена');
          await answerCallbackQuery(cq.id, `🛑 Отмена! Баланс: ${res.newBalance} ур.`);
          if (messageId) {
            await editTelegramMessage(
              chatId,
              messageId,
              `🛑 <b>Уважительная отмена: ${escapeHtml(studentName)}</b>\n⚖️ Урок сохранен. Баланс: <b>${res.newBalance} ур.</b>`
            );
          }
        }
        return NextResponse.json({ ok: true });
      } else if (data.startsWith('lesson:')) {
        const lessonId = data.replace('lesson:', '');
        const lessons = await getLessons();
        const lesson = lessons.find((l) => l.id === lessonId);
        if (!lesson) {
          await answerCallbackQuery(cq.id, 'Урок не найден');
          return NextResponse.json({ ok: true });
        }
        await answerCallbackQuery(cq.id);

        const students = await getStudents();
        const student = students.find((s) => s.id === lesson.student_id);
        const studentName = student?.name || lesson.student_name || 'Ученик';
        const dateFormatted = formatRuDateWithDay(lesson.date);

        const statusRu = lesson.status === 'completed'
          ? '✅ Проведён'
          : lesson.status === 'missed_penalty'
          ? '🔥 Сгорел (списан)'
          : lesson.status === 'missed_excused'
          ? '🛑 Уважительная отмена'
          : '⏳ Запланирован';

        let lessonInfo = `📖 <b>Урок: ${escapeHtml(studentName)}</b>\n`;
        lessonInfo += `📅 <b>Дата:</b> ${dateFormatted} (${lesson.time_str || '18:00'})\n`;
        lessonInfo += `📊 <b>Статус:</b> ${statusRu}\n`;
        lessonInfo += `⚖️ <b>Баланс ученика:</b> ${student?.lessons_balance ?? 0} ур.\n`;
        if (lesson.notes) {
          lessonInfo += `📝 <b>Заметка:</b> <i>${escapeHtml(lesson.notes)}</i>\n`;
        }
        if (lesson.miss_reason) {
          lessonInfo += `⚠️ <b>Причина:</b> <i>${escapeHtml(lesson.miss_reason)}</i>\n`;
        }
        lessonInfo += `\nВыберите действие:`;

        const actionMarkup = {
          inline_keyboard: [
            [
              { text: '✅ Был', callback_data: `status:${lesson.id}:completed` },
              { text: '🔥 Сгорел', callback_data: `status:${lesson.id}:penalty` },
              { text: '🛑 Отмена', callback_data: `status:${lesson.id}:excused` },
            ],
            [
              { text: '👤 Отчет ученика', callback_data: `report:${lesson.student_id}` },
              { text: '📅 Расписание', callback_data: 'daily_schedule' },
            ],
          ],
        };

        await sendTelegramMessage(chatId, lessonInfo, actionMarkup);
        return NextResponse.json({ ok: true });
      } else if (data === 'list_students') {
        await answerCallbackQuery(cq.id);
        const keyboard = await buildStudentsKeyboard();
        await sendTelegramMessage(chatId, '📋 <b>Список учеников:</b>', keyboard);
        return NextResponse.json({ ok: true });
      } else if (data === 'daily_schedule') {
        await answerCallbackQuery(cq.id);
        const { text, markup } = await buildMorningDigest('Фархад');
        await sendTelegramMessage(chatId, text, markup);
        return NextResponse.json({ ok: true });
      }
    }

    if (update.message) {
      await handleMessage(update.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Bot webhook error:', error);
    return NextResponse.json({ ok: false, error: 'Internal Error' }, { status: 500 });
  }
}
