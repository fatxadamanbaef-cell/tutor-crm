import { NextRequest, NextResponse } from 'next/server';
import { getLessons, getStudents } from '@/lib/storage';
import { formatTashkentHeaderDate, isTashkentToday } from '@/lib/formatters';
import { generateStudentReport, findStudentsByName } from '@/lib/reports';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8520814142:AAF1jZQZ9WQX6Hv4QRGOizoEwv2GRChtiPw';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tutor-crm-kappa.vercel.app';

// Helper to safely send telegram message
export async function sendTelegramMessage(chatId: number | string, text: string, replyMarkup?: any) {
  if (!BOT_TOKEN) {
    console.warn('TELEGRAM_BOT_TOKEN is not configured');
    return;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });

    const data = await res.json();
    if (!data.ok) {
      console.warn('HTML sendMessage failed, trying plain text fallback:', data);
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text.replace(/<[^>]*>/g, ''),
          reply_markup: replyMarkup,
        }),
      });
    }
  } catch (error) {
    console.error('Failed to send telegram message', error);
  }
}

// Answer Telegram callback query (clears loading indicator in UI)
async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  if (!BOT_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        text: text || '',
      }),
    });
  } catch (e) {
    console.error('Failed to answer callback query', e);
  }
}

// Generate morning digest message for Tutor
export async function buildMorningDigestText(firstName: string = 'Фархад') {
  const todayFormatted = formatTashkentHeaderDate();

  const [lessons, students] = await Promise.all([
    getLessons(),
    getStudents(),
  ]);

  const todayLessons = lessons.filter((l) => isTashkentToday(l.date));

  let message = `☀️ <b>Здравствуйте, ${firstName}!</b>\n`;
  message += `📚 <b>Ваш план занятий на сегодня (${todayFormatted}):</b>\n\n`;

  if (todayLessons.length === 0) {
    message += `<i>На сегодня уроков не запланировано. Отличного отдыха!</i>\n\n`;
  } else {
    message += `Всего уроков: <b>${todayLessons.length}</b>\n\n`;
    todayLessons.forEach((l, i) => {
      const student = students.find((s) => s.id === l.student_id);
      const isCompleted = l.status === 'completed';
      const statusIcon = isCompleted ? '✅' : '⏳';

      message += `<b>${i + 1}. ${l.time_str || '18:00'}</b> | <b>${student?.name || l.student_name}</b> ${statusIcon}\n`;
      if (l.notes) {
        message += `   📝 <i>${l.notes}</i>\n`;
      }
      if (student) {
        message += `   🎟 <i>Остаток: ${student.prepaid_balance} ур.</i>\n`;
      }
      message += `\n`;
    });
  }

  // Pending makeups
  const studentsWithMakeups = students.filter((s) => s.makeup_debt > 0);
  if (studentsWithMakeups.length > 0) {
    message += `🔄 <b>Долги по отработкам (${studentsWithMakeups.length}):</b>\n`;
    studentsWithMakeups.forEach((s) => {
      message += `• <b>${s.name}</b>: ${s.makeup_debt} ур.\n`;
    });
    message += `\n`;
  }

  // Low balance reminder
  const lowBalanceStudents = students.filter((s) => s.prepaid_balance <= 0);
  if (lowBalanceStudents.length > 0) {
    message += `⚠️ <b>Требуется продление абонемента:</b>\n`;
    lowBalanceStudents.forEach((s) => {
      message += `• <b>${s.name}</b> (баланс: <b>${s.prepaid_balance}</b> ур.)\n`;
    });
    message += `\n`;
  }

  message += `Продуктивного учебного дня! 🚀`;
  return message;
}

// Generate inline keyboard with list of students for reports
async function buildStudentsKeyboard() {
  const students = await getStudents();
  if (students.length === 0) {
    return {
      inline_keyboard: [
        [{ text: '🚀 Открыть Tutor Tracker', web_app: { url: APP_URL } }],
      ],
    };
  }

  const buttons: Array<Array<{ text: string; callback_data?: string; web_app?: { url: string } }>> = students.map((s) => {
    const balanceLabel = s.prepaid_balance > 0 ? `+${s.prepaid_balance} ур.` : `${s.prepaid_balance} ур.`;
    return [
      {
        text: `👤 ${s.name} (${balanceLabel})`,
        callback_data: `report:${s.id}`,
      },
    ];
  });

  buttons.push([
    {
      text: '🚀 Открыть Tutor Tracker',
      web_app: { url: APP_URL },
    },
  ]);

  return { inline_keyboard: buttons };
}

import { supabase } from '@/lib/supabase';

// Helper to register active tutor chats for morning digest and 15m alerts
async function registerChatId(chatId: number | string, username?: string) {
  if (!supabase) return;
  try {
    await supabase.from('tutor_bot_chats').upsert(
      [{ chat_id: String(chatId), username: username || '', updated_at: new Date().toISOString() }],
      { onConflict: 'chat_id' }
    );
  } catch {
    // table might not exist, silently proceed
  }
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    // 1. Handle Callback Queries (when user taps a student button)
    if (update.callback_query) {
      const cq = update.callback_query;
      const data = cq.data || '';
      const chatId = cq.message?.chat?.id || cq.from?.id;
      if (chatId) registerChatId(chatId, cq.from?.username);

      if (data.startsWith('report:')) {
        const studentId = data.replace('report:', '');
        await answerCallbackQuery(cq.id, 'Формирую отчет...');

        const report = await generateStudentReport(studentId);
        if (report) {
          const reportMarkup = {
            inline_keyboard: [
              [
                {
                  text: '📋 Все ученики',
                  callback_data: 'list_students',
                },
                {
                  text: '🚀 Открыть в CRM',
                  web_app: { url: APP_URL },
                },
              ],
            ],
          };
          await sendTelegramMessage(chatId, report.telegramHtml, reportMarkup);
        } else {
          await sendTelegramMessage(chatId, '❌ Ученик не найден в базе данных.');
        }
        return NextResponse.json({ ok: true });
      } else if (data === 'list_students') {
        await answerCallbackQuery(cq.id);
        const keyboard = await buildStudentsKeyboard();
        await sendTelegramMessage(
          chatId,
          '📋 <b>Выберите ученика для получения подробного отчета:</b>',
          keyboard
        );
        return NextResponse.json({ ok: true });
      } else if (data === 'daily_schedule') {
        await answerCallbackQuery(cq.id, 'Загружаю расписание...');
        const firstName = cq.from?.first_name || 'Фархад';
        const digestText = await buildMorningDigestText(firstName);
        const defaultMarkup = {
          inline_keyboard: [
            [{ text: '🚀 Открыть CRM', web_app: { url: APP_URL } }, { text: '📋 Отчеты', callback_data: 'list_students' }],
          ],
        };
        await sendTelegramMessage(chatId, digestText, defaultMarkup);
        return NextResponse.json({ ok: true });
      }
    }

    // 2. Handle Text Messages and Commands
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      if (chatId) registerChatId(chatId, update.message.from?.username);
      const rawText = update.message.text.trim();
      const text = rawText.toLowerCase();
      const firstName = update.message.from?.first_name || 'Фархад';

      const defaultMarkup = {
        inline_keyboard: [
          [
            {
              text: '🚀 Открыть CRM',
              web_app: { url: APP_URL },
            },
            {
              text: '📅 Расписание',
              callback_data: 'daily_schedule',
            },
          ],
          [
            {
              text: '📋 Отчеты по ученикам',
              callback_data: 'list_students',
            },
          ]
        ],
      };

      if (text.startsWith('/start')) {
        const welcomeText = `👋 <b>Добро пожаловать в Tutor Tracker, ${firstName}!</b>\n\nМинималистичный дашборд для репетитора:\n\n⚡ <b>Отметка уроков в 1 клик</b>\n🟢 <b>Контроль предоплаченных уроков</b>\n🟠 <b>Учет долгов по отработкам</b>\n📊 <b>Отчеты для родителей по каждому ученику</b>\n\n💡 <i>Вы можете написать имя любого ученика (например: <b>Мадина</b> или <b>Сахиб</b>), чтобы сразу получить подробный отчет по урокам и оплатам!</i>`;
        await sendTelegramMessage(chatId, welcomeText, defaultMarkup);
      } else if (text.startsWith('/today') || text.startsWith('/digest') || text === 'сегодня' || text === 'расписание') {
        const digestText = await buildMorningDigestText(firstName);
        await sendTelegramMessage(chatId, digestText, defaultMarkup);
      } else if (
        text.startsWith('/students') ||
        text.startsWith('/ученики') ||
        text.startsWith('/отчет') ||
        text.startsWith('/инфо') ||
        text === 'ученики' ||
        text === 'отчет' ||
        text === 'список'
      ) {
        // If command includes a name argument (e.g. "/отчет Мадина" or "/info Сахиб")
        const parts = rawText.split(/\s+/);
        if (parts.length > 1) {
          const query = parts.slice(1).join(' ').trim();
          const matched = await findStudentsByName(query);
          if (matched.length === 1) {
            const report = await generateStudentReport(matched[0].id);
            if (report) {
              await sendTelegramMessage(chatId, report.telegramHtml, defaultMarkup);
              return NextResponse.json({ ok: true });
            }
          } else if (matched.length > 1) {
            const buttons = matched.map((s) => [
              {
                text: `👤 ${s.name} (${s.prepaid_balance} ур.)`,
                callback_data: `report:${s.id}`,
              },
            ]);
            await sendTelegramMessage(
              chatId,
              `🔍 Найдено несколько учеников по запросу «${query}». Выберите нужного:`,
              { inline_keyboard: buttons }
            );
            return NextResponse.json({ ok: true });
          }
        }

        // Show all students buttons
        const keyboard = await buildStudentsKeyboard();
        await sendTelegramMessage(
          chatId,
          '📋 <b>Выберите ученика для получения подробного отчета:</b>\n<i>(покажет даты проведенных уроков, баланс, долги и готовый текст для родителей)</i>',
          keyboard
        );
      } else if (text.startsWith('/help')) {
        const helpText = `ℹ️ <b>Команды бота Tutor Tracker:</b>\n\n/today — Расписание уроков на сегодня\n/students — Список учеников и подробные отчеты\n/отчет [имя] — Отчет по конкретному ученику\n\n💡 <i>Также можно просто отправить имя ученика в чат (например: <code>Мадина</code>), и бот сформирует полный отчет!</i>`;
        await sendTelegramMessage(chatId, helpText, defaultMarkup);
      } else {
        // Check if message text matches any student name directly (e.g. user typed "Мадина" or "Сахиб")
        const matchedStudents = await findStudentsByName(rawText);

        if (matchedStudents.length === 1) {
          const report = await generateStudentReport(matchedStudents[0].id);
          if (report) {
            await sendTelegramMessage(chatId, report.telegramHtml, defaultMarkup);
            return NextResponse.json({ ok: true });
          }
        } else if (matchedStudents.length > 1) {
          const buttons = matchedStudents.map((s) => [
            {
              text: `👤 ${s.name} (${s.prepaid_balance} ур.)`,
              callback_data: `report:${s.id}`,
            },
          ]);
          await sendTelegramMessage(
            chatId,
            `🔍 Найдено несколько учеников по запросу «${rawText}». Выберите:`,
            { inline_keyboard: buttons }
          );
          return NextResponse.json({ ok: true });
        } else {
          // Fallback: Show students menu & open webapp
          const keyboard = await buildStudentsKeyboard();
          const fallbackText = `👋 <b>Здравствуйте, ${firstName}!</b>\n\nВыберите ученика ниже для отчета или откройте дашборд:`;
          await sendTelegramMessage(chatId, fallbackText, keyboard);
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Webhook error', error);
    return NextResponse.json({ ok: false, error: 'Internal error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Tutor Tracker Bot Webhook is active' });
}
