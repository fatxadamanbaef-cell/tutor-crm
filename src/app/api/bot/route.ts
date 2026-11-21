import { NextRequest, NextResponse } from 'next/server';
import { getLessons, getStudents, setLessonStatusDirect, updateLessonDetails } from '@/lib/storage';
import { formatRuDateWithDay } from '@/lib/formatters';
import { generateStudentReport, findStudentsByName } from '@/lib/reports';
import { supabase } from '@/lib/supabase';
import { claimUpdate, clearHistory, popPendingReason, getRegisteredChatId, setCachedRegisteredChatId } from '@/lib/botState';
import { normName } from '@/lib/nameMatch';
import { verifyTelegramWebhookSecret, hasMatchingTelegramWebhookSecret, isAllowedTelegramUser } from '@/lib/telegramAuth';
import { sendTelegramMessage, buildMorningDigest, escapeHtml } from '@/lib/botMessaging';

export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tutor-crm-kappa.vercel.app';

async function editTelegramMessage(chatId: number | string, messageId: number, text: string, replyMarkup?: any) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;
  const url = `https://api.telegram.org/bot${botToken}/editMessageText`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup: replyMarkup }),
    });
  } catch (error) {}
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || '' }),
    });
  } catch (e) {}
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

let webhookSyncedThisInstance = false;

async function syncWebhookIfMissingSecret(): Promise<void> {
  if (webhookSyncedThisInstance) return;
  webhookSyncedThisInstance = true;
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!botToken || !secretToken) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: `${APP_URL}/api/bot`,
        secret_token: secretToken,
        allowed_updates: ['message', 'callback_query'],
      }),
    });
  } catch (e) {
    console.warn('[telegram] Auto-sync webhook warning:', e);
  }
}

async function registerChatId(chatId: number | string, username?: string) {
  if (!supabase) return;
  const chatIdStr = String(chatId).trim();
  if (!chatIdStr) return;

  try {
    const cached = await getRegisteredChatId();
    if (cached === chatIdStr) return;

    const { data } = await supabase.from('tutor_students').select('id').eq('name', '_BOT_CONFIG').maybeSingle();
    if (data) {
      await supabase.from('tutor_students').update({ phone: chatIdStr }).eq('id', data.id);
    } else {
      await supabase.from('tutor_students').insert([
        { name: '_BOT_CONFIG', phone: chatIdStr, monthly_target_lessons: 0 },
      ]);
    }
    setCachedRegisteredChatId(chatIdStr);
  } catch (e) {
    console.error('Register chat id failed', e);
  }
}

async function sendChatAction(chatId: number | string, action: string = 'typing') {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
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
  const firstName = message.from?.first_name;

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
    // 1. Verify Telegram webhook secret token before parsing or touching DB/AI
    if (!verifyTelegramWebhookSecret(req)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const update = await req.json();

    // 2. Enforce Telegram ID whitelist BEFORE claimUpdate / DB / OpenAI / _BOT_CONFIG
    const hasCallback = Boolean(update.callback_query);
    const hasMessage = Boolean(update.message);

    if (!hasCallback && !hasMessage) {
      return NextResponse.json({ ok: true });
    }

    const actorFromId = hasCallback ? update.callback_query.from?.id : update.message.from?.id;
    const actorChatId = hasCallback ? update.callback_query.message?.chat?.id : update.message.chat?.id;
    const replyChatId = actorChatId ?? actorFromId;
    const registeredChatId = await getRegisteredChatId();

    if (!isAllowedTelegramUser(actorFromId, actorChatId, [registeredChatId])) {
      if (hasCallback && update.callback_query.id) {
        await answerCallbackQuery(update.callback_query.id, '⛔ Доступ закрыт');
      } else if (replyChatId) {
        await sendTelegramMessage(replyChatId, '⛔ Доступ закрыт.');
      }
      // Return 200 OK so Telegram does not retry webhook deliveries
      return NextResponse.json({ ok: true });
    }

    if (!hasMatchingTelegramWebhookSecret(req)) {
      void syncWebhookIfMissingSecret();
    }

    // 3. Deduplicate updates only for authorized users
    if (typeof update.update_id === 'number' && !(await claimUpdate(update.update_id))) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    if (update.callback_query) {
      const cq = update.callback_query;
      const data = cq.data || '';
      const chatId = cq.message?.chat?.id || cq.from?.id;
      const messageId = cq.message?.message_id;
      if (chatId) await registerChatId(chatId, cq.from?.username);

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
        const { text, markup } = await buildMorningDigest(cq.from?.first_name);
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
