import { NextRequest, NextResponse } from 'next/server';
import { buildMorningDigest, sendTelegramMessage } from '@/lib/botMessaging';
import { getRegisteredChatId } from '@/lib/botState';
import {
  verifyCronSecret,
  verifyTelegramInitData,
  hasCronSecretCredentials,
  getAllowedTelegramIds,
} from '@/lib/telegramAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

async function resolveFallbackChatId(): Promise<string> {
  const envChatId = process.env.TEACHER_TELEGRAM_CHAT_ID?.trim();
  if (envChatId) return envChatId;

  const registered = await getRegisteredChatId();
  if (registered) return registered;

  const allowed = getAllowedTelegramIds();
  return allowed.values().next().value || '';
}

export async function GET(req: NextRequest) {
  try {
    const registeredChatId = await getRegisteredChatId();
    if (!verifyCronSecret(req, [registeredChatId])) {
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
    const registeredChatId = await getRegisteredChatId();
    let targetChatId: string | number = '';
    let firstName: string | undefined;

    if (hasCronSecretCredentials(req)) {
      if (!verifyCronSecret(req, [registeredChatId])) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }
      targetChatId = await resolveFallbackChatId();
    } else {
      const initData = req.headers.get('x-telegram-init-data') || '';
      const verification = verifyTelegramInitData(initData, undefined, [registeredChatId]);
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
