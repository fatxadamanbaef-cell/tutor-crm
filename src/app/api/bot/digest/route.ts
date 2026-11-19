import { NextRequest, NextResponse } from 'next/server';
import { buildMorningDigest, sendTelegramMessage } from '../route';
import { supabase } from '@/lib/supabase';
import { verifyCronSecret, verifyTelegramInitData } from '@/lib/telegramAuth';

async function resolveFallbackChatId(): Promise<string> {
  const envChatId = process.env.TEACHER_TELEGRAM_CHAT_ID?.trim();
  if (envChatId) return envChatId;

  const { data: botConfig } = await supabase
    .from('tutor_students')
    .select('phone')
    .eq('name', '_BOT_CONFIG')
    .single();

  return botConfig?.phone ? String(botConfig.phone).trim() : '';
}

export async function GET(req: NextRequest) {
  try {
    if (!verifyCronSecret(req)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(req.url);
    const chatId = url.searchParams.get('chat_id')?.trim() || (await resolveFallbackChatId());

    if (!chatId) {
      return NextResponse.json(
        {
          ok: false,
          error: 'chat_id is required or set TEACHER_TELEGRAM_CHAT_ID / run /start in the bot',
        },
        { status: 400 }
      );
    }

    const { text: digestText, markup } = await buildMorningDigest();
    const sent = await sendTelegramMessage(chatId, digestText, markup);

    if (!sent) {
      return NextResponse.json(
        { ok: false, error: 'Failed to deliver message via Telegram API' },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, sent_to: chatId });
  } catch (error) {
    console.error('Digest trigger error', error);
    return NextResponse.json({ ok: false, error: 'Failed to send digest' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    let targetChatId: string | number = '';
    let firstName: string | undefined;

    const authHeader = req.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      if (!verifyCronSecret(req)) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }
      targetChatId = await resolveFallbackChatId();
    } else {
      const initData = req.headers.get('x-telegram-init-data') || '';
      const verification = verifyTelegramInitData(initData);
      if (!verification.ok) {
        return NextResponse.json(
          { ok: false, error: verification.error },
          { status: verification.status }
        );
      }
      targetChatId = verification.user.id;
      if (verification.user.first_name) {
        firstName = verification.user.first_name;
      }
    }

    if (!targetChatId) {
      return NextResponse.json(
        { ok: false, message: 'Не настроен chat_id. Нажмите /start в боте.' },
        { status: 400 }
      );
    }

    const { text: digestText, markup } = await buildMorningDigest(firstName);
    const sent = await sendTelegramMessage(targetChatId, digestText, markup);

    if (!sent) {
      return NextResponse.json(
        { ok: false, message: 'Не удалось отправить сводку (проверьте /start в боте)' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      sent_to: targetChatId,
      notifications_sent: ['Morning digest sent'],
    });
  } catch (error) {
    console.error('Manual digest trigger error', error);
    return NextResponse.json({ ok: false, error: 'Failed to send digest' }, { status: 500 });
  }
}
