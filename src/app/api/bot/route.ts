import { NextRequest, NextResponse } from 'next/server';
import { getLessons, getStudents, setLessonStatusDirect, updateLessonDetails } from '@/lib/storage';
import { formatTashkentHeaderDate, isTashkentToday, getTashkentNow } from '@/lib/formatters';
import { generateStudentReport, findStudentsByName } from '@/lib/reports';
import { supabase } from '@/lib/supabase';
import { claimUpdate, clearHistory, setPendingReason, popPendingReason } from '@/lib/botState';
import { normName } from '@/lib/nameMatch';

export const maxDuration = 60;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tutor-crm-kappa.vercel.app';

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

  // Pending Sunday makeups
  const studentsWithMakeups = students.filter((s) => (s.makeup_debt || 0) > 0);
  if (studentsWithMakeups.length > 0) {
    const names = studentsWithMakeups.map((s) => s.name).join(', ');
    message += `🔄 <b>Ждут назначения отработки на ВС:</b> ${studentsWithMakeups.length} ученика (${names})\n`;
  }

  // Reminder for billing day today
  const todayDayNumber = getTashkentNow().getDate(); // e.g. 28
  const billingDayStudents = students.filter((s) => {
    if (!s.billing_day) return false;
    const match = String(s.billing_day).match(/\d+/);
    return match && Number(match[0]) === todayDayNumber;
  });

  if (billingDayStudents.length > 0) {
    const names = billingDayStudents.map((s) => s.name).join(', ');
    message += `📅 <b>Напоминание о дате оплаты сегодня (${todayDayNumber} число):</b> ${names}\n`;
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

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
          await setLessonStatusDirect(lessonId, 'completed');
          await answerCallbackQuery(cq.id, '✅ Урок отмечен как проведенный!');
          if (messageId) {
            await editTelegramMessage(
              chatId,
              messageId,
              `✅ <b>Урок проведен!</b>\n👤 <b>${escapeHtml(studentName)}</b> (${lesson?.time_str || ''})\nОтмечено в архиве.`
            );
          }
        } else if (action === 'miss_prompt') {
          await setLessonStatusDirect(lessonId, 'missed', 'Пропуск', false);
          await setPendingReason(lessonId, studentName, false);
          await answerCallbackQuery(cq.id, '❌ Отмечен пропуск');
          await sendTelegramMessage(
            chatId,
            `❌ Урок ученика <b>${escapeHtml(studentName)}</b> отмечен как пропущенный.\n\nНапишите или надиктуйте голосом <b>причину пропуска</b> для архива:`
          );
        } else if (action === 'makeup_prompt') {
          await setLessonStatusDirect(lessonId, 'missed', 'Ожидает отработки', true);
          await setPendingReason(lessonId, studentName, true);
          await answerCallbackQuery(cq.id, '🔄 Назначен на отработку в ВС');
          await sendTelegramMessage(
            chatId,
            `🔄 Урок ученика <b>${escapeHtml(studentName)}</b> отправлен на отработку в воскресенье.\n\nНапишите или надиктуйте голосом <b>причину пропуска</b> для архива:`
          );
        }
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
