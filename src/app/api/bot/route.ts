import { NextRequest, NextResponse } from 'next/server';
import { getLessons, getStudents, setLessonStatusDirect, saveStudent, addPayment } from '@/lib/storage';
import { formatTashkentHeaderDate, isTashkentToday } from '@/lib/formatters';
import { generateStudentReport, findStudentsByName } from '@/lib/reports';
import { supabase } from '@/lib/supabase';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8520814142:AAF1jZQZ9WQX6Hv4QRGOizoEwv2GRChtiPw';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tutor-crm-kappa.vercel.app';

// Helper to safely send telegram message
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
  const todayLessons = lessons.filter((l) => isTashkentToday(l.date)).sort((a,b) => (a.time_str||'').localeCompare(b.time_str||''));

  let message = `☀️ <b>Здравствуйте, ${firstName}!</b>\n`;
  message += `📚 <b>Ваш план занятий на сегодня (${todayFormatted}):</b>\n\n`;

  const keyboard: any[] = [];

  if (todayLessons.length === 0) {
    message += `<i>На сегодня уроков не запланировано. Отличного отдыха!</i>\n\n`;
  } else {
    message += `Всего уроков: <b>${todayLessons.length}</b>\n\n`;
    todayLessons.forEach((l, i) => {
      const student = students.find((s) => s.id === l.student_id);
      const isCompleted = l.status === 'completed';
      const statusIcon = isCompleted ? '✅' : (l.status === 'missed_penalty' ? '❌' : (l.status === 'missed_excused' ? '⚠️' : '⏳'));
      message += `<b>${i + 1}. ${l.time_str?.split(' - ')[0] || '18:00'}</b> | <b>${student?.name || l.student_name}</b> ${statusIcon}\n`;
      
      keyboard.push([{ text: `${statusIcon} ${l.time_str?.split(' - ')[0]} ${student?.name}`, callback_data: `lesson:${l.id}` }]);
    });
    message += `\n<i>Нажмите на урок ниже, чтобы отметить его статус:</i>\n\n`;
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

  keyboard.push([
    { text: '🚀 Открыть CRM', web_app: { url: APP_URL } },
    { text: '📋 Отчеты', callback_data: 'list_students' }
  ]);

  return { text: message, markup: { inline_keyboard: keyboard } };
}

async function buildStudentsKeyboard() {
  const students = await getStudents();
  if (students.length === 0) {
    return { inline_keyboard: [[{ text: '🚀 Открыть Tutor Tracker', web_app: { url: APP_URL } }]] };
  }
  const buttons: Array<Array<{ text: string; callback_data?: string; web_app?: { url: string } }>> = students.map((s) => {
    const balanceLabel = s.prepaid_balance > 0 ? `+${s.prepaid_balance} ур.` : `${s.prepaid_balance} ур.`;
    return [{ text: `👤 ${s.name} (${balanceLabel})`, callback_data: `report:${s.id}` }];
  });
  buttons.push([{ text: '🚀 Открыть Tutor Tracker', web_app: { url: APP_URL } }]);
  return { inline_keyboard: buttons };
}

async function registerChatId(chatId: number | string, username?: string) {
  if (!supabase) return;
  try {
    const { data } = await supabase.from('tutor_students').select('id').eq('name', '_BOT_CONFIG').single();
    if (data) {
        await supabase.from('tutor_students').update({ phone: String(chatId) }).eq('id', data.id);
    } else {
        await supabase.from('tutor_students').insert([{ name: '_BOT_CONFIG', phone: String(chatId), price_per_lesson: 0, package_remaining_lessons: 0, package_total_lessons: 0 }]);
    }
  } catch(e) { console.error('Register chat id failed', e) }
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

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
              [{ text: '💰 Внести оплату', callback_data: `pay_prompt:${studentId}` }],
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
      } else if (data === 'list_students') {
        await answerCallbackQuery(cq.id);
        const keyboard = await buildStudentsKeyboard();
        if (messageId) {
            await editTelegramMessage(chatId, messageId, '📋 <b>Выберите ученика:</b>', keyboard);
        } else {
            await sendTelegramMessage(chatId, '📋 <b>Выберите ученика:</b>', keyboard);
        }
        return NextResponse.json({ ok: true });
      } else if (data === 'daily_schedule') {
        await answerCallbackQuery(cq.id, 'Загружаю...');
        const firstName = cq.from?.first_name || 'Фархад';
        const { text, markup } = await buildMorningDigest(firstName);
        if (messageId) {
            await editTelegramMessage(chatId, messageId, text, markup);
        } else {
            await sendTelegramMessage(chatId, text, markup);
        }
        return NextResponse.json({ ok: true });
      } else if (data.startsWith('lesson:')) {
        const lessonId = data.replace('lesson:', '');
        const lessons = await getLessons();
        const lesson = lessons.find(l => l.id === lessonId);
        if (!lesson) {
          await answerCallbackQuery(cq.id, 'Урок не найден!');
          return NextResponse.json({ ok: true });
        }
        await answerCallbackQuery(cq.id);
        const text = `Управление уроком:\n👤 <b>${lesson.student_name}</b>\n🕒 ${lesson.time_str}\nТекущий статус: <b>${lesson.status === 'completed' ? 'Проведен ✅' : (lesson.status === 'missed_penalty' ? 'Отмена ❌' : (lesson.status === 'missed_excused' ? 'Долг ⚠️' : 'Запланирован ⏳'))}</b>`;
        const markup = {
          inline_keyboard: [
            [{ text: lesson.status === 'planned'  ? '🔹 Запланирован' : 'Запланирован', callback_data: `status:${lesson.id}:planned` }],
            [{ text: lesson.status === 'completed' ? '✅ Проведен' : 'Проведен', callback_data: `status:${lesson.id}:completed` }],
            [{ text: lesson.status === 'missed_excused' ? '⚠️ Пропуск (долг)' : 'Пропуск (долг)', callback_data: `status:${lesson.id}:missed_excused` }],
            [{ text: lesson.status === 'missed_penalty' ? '❌ Отмена (списание)' : 'Отмена (списание)', callback_data: `status:${lesson.id}:missed_penalty` }],
            [{ text: '⬅️ Назад в расписание', callback_data: 'daily_schedule' }]
          ]
        };
        if (messageId) {
            await editTelegramMessage(chatId, messageId, text, markup);
        } else {
            await sendTelegramMessage(chatId, text, markup);
        }
        return NextResponse.json({ ok: true });
      } else if (data.startsWith('status:')) {
        const parts = data.split(':');
        const lessonId = parts[1];
        const newStatus = parts[2] as any;
        await answerCallbackQuery(cq.id, 'Обновляю...');
        await setLessonStatusDirect(lessonId, newStatus);
        
        // Refresh the lesson view
        const lessons = await getLessons();
        const lesson = lessons.find(l => l.id === lessonId);
        if (lesson) {
            const text = `Управление уроком:\n👤 <b>${lesson.student_name}</b>\n🕒 ${lesson.time_str}\nТекущий статус: <b>${lesson.status === 'completed' ? 'Проведен ✅' : (lesson.status === 'missed_penalty' ? 'Отмена ❌' : (lesson.status === 'missed_excused' ? 'Долг ⚠️' : 'Запланирован ⏳'))}</b>`;
            const markup = {
            inline_keyboard: [
                [{ text: lesson.status === 'planned'  ? '🔹 Запланирован' : 'Запланирован', callback_data: `status:${lesson.id}:planned` }],
                [{ text: lesson.status === 'completed' ? '✅ Проведен' : 'Проведен', callback_data: `status:${lesson.id}:completed` }],
                [{ text: lesson.status === 'missed_excused' ? '⚠️ Пропуск (долг)' : 'Пропуск (долг)', callback_data: `status:${lesson.id}:missed_excused` }],
                [{ text: lesson.status === 'missed_penalty' ? '❌ Отмена (списание)' : 'Отмена (списание)', callback_data: `status:${lesson.id}:missed_penalty` }],
                [{ text: '⬅️ Назад в расписание', callback_data: 'daily_schedule' }]
            ]
            };
            if (messageId) {
                await editTelegramMessage(chatId, messageId, text, markup);
            }
        }
        return NextResponse.json({ ok: true });
      } else if (data.startsWith('pay_prompt:')) {
        const studentId = data.replace('pay_prompt:', '');
        const students = await getStudents();
        const student = students.find(s => s.id === studentId);
        await answerCallbackQuery(cq.id);
        if (student) {
            await sendTelegramMessage(chatId, `💰 Чтобы внести оплату за <b>${student.name}</b>, отправьте сообщение:\n\n<code>/pay ${student.name} 8</code>\n\nГде 8 - это количество оплаченных уроков (можно указать любую цифру).`);
        }
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
          [{ text: '🚀 Открыть CRM', web_app: { url: APP_URL } }, { text: '📅 Расписание', callback_data: 'daily_schedule' }],
          [{ text: '📋 Ученики', callback_data: 'list_students' }]
        ],
      };

      if (text.startsWith('/start') || text.startsWith('/help')) {
        const welcomeText = `🚀 <b>Tutor Tracker Bot</b>\n\n<b>Команды бота:</b>\n/today - Расписание на сегодня (с кнопками)\n/students - Список учеников\n/add ИМЯ 150000 - Быстро добавить ученика\n/pay ИМЯ 8 - Внести оплату (на 8 уроков)\n\nЛибо просто напишите имя ученика, чтобы найти его!`;
        await sendTelegramMessage(chatId, welcomeText, defaultMarkup);
      } else if (text.startsWith('/add ')) {
        const parts = rawText.split(' ');
        if (parts.length >= 3) {
            const price = parseInt(parts.pop() || '150000');
            const name = parts.slice(1).join(' ');
            try {
                await saveStudent({ name, price_per_lesson: price, prepaid_balance: 8, billing_day: '10' });
                await sendTelegramMessage(chatId, `✅ Ученик <b>${name}</b> (${price} UZS) успешно добавлен!\nЗайдите в CRM чтобы настроить ему расписание.`, defaultMarkup);
            } catch(e) {
                await sendTelegramMessage(chatId, '❌ Ошибка при добавлении ученика.');
            }
        } else {
            await sendTelegramMessage(chatId, '❌ Формат команды: /add Имя Цена\nПример: <code>/add Алина 150000</code>');
        }
      } else if (text.startsWith('/pay ')) {
        const parts = rawText.split(' ');
        if (parts.length >= 3) {
            const lessonsCount = parseInt(parts.pop() || '8');
            const name = parts.slice(1).join(' ');
            const matched = await findStudentsByName(name);
            if (matched.length === 1) {
                try {
                    const student = matched[0];
                    const amount = (student.price_per_lesson || 150000) * lessonsCount;
                    await addPayment(student.id, amount, lessonsCount);
                    await sendTelegramMessage(chatId, `💰 Оплата успешно добавлена!\n👤 <b>${student.name}</b>\nКол-во уроков: +${lessonsCount}\nСумма: ${amount} UZS`);
                } catch(e) {
                    await sendTelegramMessage(chatId, '❌ Ошибка при добавлении оплаты.');
                }
            } else {
                await sendTelegramMessage(chatId, `❌ Ученик с именем "${name}" не найден или найдено несколько.`);
            }
        } else {
            await sendTelegramMessage(chatId, '❌ Формат команды: /pay Имя Кол-во_уроков\nПример: <code>/pay Алина 8</code>');
        }
      } else if (text.startsWith('/today') || text.startsWith('/digest')) {
        const { text: msgText, markup } = await buildMorningDigest(firstName);
        await sendTelegramMessage(chatId, msgText, markup);
      } else if (text.startsWith('/students')) {
        const keyboard = await buildStudentsKeyboard();
        await sendTelegramMessage(chatId, '📋 <b>Список учеников:</b>', keyboard);
      } else {
        const matchedStudents = await findStudentsByName(rawText);
        if (matchedStudents.length === 1) {
          const report = await generateStudentReport(matchedStudents[0].id);
          if (report) {
            const reportMarkup = {
                inline_keyboard: [
                  [{ text: '💰 Внести оплату', callback_data: `pay_prompt:${matchedStudents[0].id}` }],
                  [{ text: '📋 Все ученики', callback_data: 'list_students' }, { text: '🚀 Открыть CRM', web_app: { url: APP_URL } }],
                ],
              };
            await sendTelegramMessage(chatId, report.telegramHtml, reportMarkup);
          }
        } else if (matchedStudents.length > 1) {
          const buttons = matchedStudents.map((s) => [{ text: `👤 ${s.name} (${s.prepaid_balance} ур.)`, callback_data: `report:${s.id}` }]);
          await sendTelegramMessage(chatId, `Найдено несколько учеников по запросу "${rawText}":`, { inline_keyboard: buttons });
        } else {
          const { text: msgText, markup } = await buildMorningDigest(firstName);
          await sendTelegramMessage(chatId, `Я не понял команду 😔\n\nВот ваше расписание:\n\n` + msgText, markup);
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
