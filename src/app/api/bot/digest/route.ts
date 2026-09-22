import { NextRequest, NextResponse } from 'next/server';
import { buildMorningDigestText, sendTelegramMessage } from '../route';

const TEACHER_TELEGRAM_CHAT_ID = process.env.TEACHER_TELEGRAM_CHAT_ID || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://tutor-tracker.vercel.app';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const chatId = url.searchParams.get('chat_id') || TEACHER_TELEGRAM_CHAT_ID;

    if (!chatId) {
      return NextResponse.json({
        ok: false,
        error: 'chat_id is required or set TEACHER_TELEGRAM_CHAT_ID env variable',
      }, { status: 400 });
    }

    const digestText = await buildMorningDigestText('Преподаватель');

    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '🚀 Открыть расписание',
            web_app: { url: APP_URL },
          },
        ],
      ],
    };

    await sendTelegramMessage(chatId, digestText, replyMarkup);

    return NextResponse.json({ ok: true, sent_to: chatId });
  } catch (error) {
    console.error('Digest trigger error', error);
    return NextResponse.json({ ok: false, error: 'Failed to send digest' }, { status: 500 });
  }
}
