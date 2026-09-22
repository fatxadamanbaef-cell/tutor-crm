import { NextRequest, NextResponse } from 'next/server';
import { getLessons, getStudents, getMakeups } from '@/lib/storage';
import { formatCurrency } from '@/lib/formatters';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://tutor-tracker.vercel.app';

// Helper to send telegram message
export async function sendTelegramMessage(chatId: number | string, text: string, replyMarkup?: any) {
  if (!BOT_TOKEN) {
    console.warn('TELEGRAM_BOT_TOKEN is not configured');
    return;
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: replyMarkup,
      }),
    });
  } catch (error) {
    console.error('Failed to send telegram message', error);
  }
}

// Generate morning digest message
export async function buildMorningDigestText(firstName: string = 'Преподаватель') {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayFormatted = format(new Date(), 'EEEE, d MMMM', { locale: ru });

  const [lessons, students, makeups] = await Promise.all([
    getLessons(),
    getStudents(),
    getMakeups(),
  ]);

  const todayLessons = lessons
    .filter((l) => l.lesson_date === todayStr)
    .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));

  let message = `☀️ <b>Доброе утро, ${firstName}!</b>\n`;
  message += `📅 <b>Сегодня (${todayFormatted}):</b>\n\n`;

  if (todayLessons.length === 0) {
    message += `<i>На сегодня запланированных уроков нет. Отличного дня для отдыха или подготовки! ☕</i>\n\n`;
  } else {
    message += `Всего уроков: <b>${todayLessons.length}</b>\n\n`;
    todayLessons.forEach((l, i) => {
      const student = students.find((s) => s.id === l.student_id);
      const isPackage = student?.payment_type === 'package';
      const remaining = student?.package_remaining_lessons ?? 0;

      let extra = '';
      if (isPackage && remaining <= 1) {
        extra = ' ⚠️ <i>(пора напомнить об оплате)</i>';
      }

      message += `<b>${i + 1}. ⏰ ${l.start_time} - ${l.end_time}</b>\n`;
      message += `   👤 <b>${l.student_name}</b> (${formatCurrency(l.price)})${extra}\n`;
      if (l.notes) message += `   📝 <i>${l.notes}</i>\n`;
      message += `\n`;
    });
  }

  // Pending makeups
  const pendingMakeups = makeups.filter((m) => m.status === 'pending');
  if (pendingMakeups.length > 0) {
    message += `🔄 <b>Ожидают отработки: ${pendingMakeups.length}</b>\n`;
    pendingMakeups.slice(0, 3).forEach((m) => {
      message += `• ${m.student_name}: пропуск от ${m.missed_date || 'ранее'} (${m.reason})\n`;
    });
    message += `\n`;
  }

  // Payment reminders
  const needPayment = students.filter(
    (s) => s.payment_type === 'package' && (s.package_remaining_lessons ?? 0) <= 1
  );
  if (needPayment.length > 0) {
    message += `💳 <b>Заканчивается абонемент:</b>\n`;
    needPayment.forEach((s) => {
      message += `• ${s.name}: осталось ${s.package_remaining_lessons ?? 0} из ${s.package_total_lessons} ур.\n`;
    });
    message += `\n`;
  }

  message += `Удачных занятий! 🎓`;
  return message;
}

export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      const firstName = update.message.from?.first_name || 'Преподаватель';

      const replyMarkup = {
        inline_keyboard: [
          [
            {
              text: '🚀 Открыть расписание (Mini App)',
              web_app: { url: APP_URL },
            },
          ],
        ],
      };

      if (text.startsWith('/start')) {
        const welcomeText = `👋 <b>Ассалому алейкум, ${firstName}!</b>\n\nДобро пожаловать в персональный помощник репетитора.\n\n📅 <b>Расписание и Уроки</b>\n📦 <b>Учет абонементов и оплат</b>\n🔄 <b>Журнал отработок и пропусков</b>\n📋 <b>Отчеты для родителей в 1 клик</b>\n\nНажмите кнопку ниже, чтобы открыть расписание:`;
        await sendTelegramMessage(chatId, welcomeText, replyMarkup);
      } else if (text.startsWith('/today') || text.startsWith('/digest')) {
        const digestText = await buildMorningDigestText(firstName);
        await sendTelegramMessage(chatId, digestText, replyMarkup);
      } else if (text.startsWith('/help')) {
        const helpText = `ℹ️ <b>Команды бота:</b>\n\n/start — Главное меню и запуск приложения\n/today — Расписание и напоминания на сегодня\n/help — Справка`;
        await sendTelegramMessage(chatId, helpText, replyMarkup);
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
