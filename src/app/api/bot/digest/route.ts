import { NextRequest, NextResponse } from 'next/server';
import { buildMorningDigest, sendTelegramMessage } from '../route';

const TEACHER_TELEGRAM_CHAT_ID = process.env.TEACHER_TELEGRAM_CHAT_ID || '';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const chatId = url.searchParams.get('chat_id') || TEACHER_TELEGRAM_CHAT_ID;

    if (!chatId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'chat_id is required or set TEACHER_TELEGRAM_CHAT_ID env variable',
        },
        { status: 400 }
      );
    }

    const { text: digestText, markup } = await buildMorningDigest('Фархад');

    await sendTelegramMessage(chatId, digestText, markup);

    return NextResponse.json({ ok: true, sent_to: chatId });
  } catch (error) {
    console.error('Digest trigger error', error);
    return NextResponse.json({ ok: false, error: 'Failed to send digest' }, { status: 500 });
  }
}
