import { NextRequest, NextResponse } from 'next/server';
import { executeBotCron, resolveRecipientChatIds } from '@/lib/botCron';
import { getRegisteredChatId } from '@/lib/botState';
import {
  verifyCronSecret,
  hasCronSecretCredentials,
  verifyTelegramInitData,
} from '@/lib/telegramAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  try {
    // Fail fast BEFORE claiming any notification keys if Telegram bot token is missing
    if (!process.env.TELEGRAM_BOT_TOKEN?.trim()) {
      console.error('[cron] TELEGRAM_BOT_TOKEN is not configured — aborting without claiming keys.');
      return NextResponse.json(
        { ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' },
        { status: 500 }
      );
    }

    const url = new URL(req.url);
    const mode = url.searchParams.get('mode') || 'reminders'; // 'digest', 'reminders', 'weekly', 'all'
    const force = url.searchParams.get('force') === 'true';
    const explicitChatId = url.searchParams.get('chat_id')?.trim() || '';

    const registeredChatId = await getRegisteredChatId();
    const registeredRecipients = await resolveRecipientChatIds();

    if (hasCronSecretCredentials(req)) {
      if (!verifyCronSecret(req, [registeredChatId])) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }
    } else if (req.headers.get('x-telegram-init-data')?.trim()) {
      const initData = req.headers.get('x-telegram-init-data') || '';
      const verification = verifyTelegramInitData(initData, undefined, [registeredChatId]);
      if (!verification.ok) {
        return NextResponse.json(
          { ok: false, error: verification.error },
          { status: verification.status }
        );
      }
    } else {
      // Allow passwordless cron triggers (e.g. legacy cron-job.org URLs or open app heartbeat)
      // ONLY for non-forced runs targeting the registered tutor chat IDs.
      const isForeignChatId =
        Boolean(explicitChatId) && !registeredRecipients.includes(explicitChatId);
      if (force || isForeignChatId || registeredRecipients.length === 0) {
        return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      }
    }

    const result = await executeBotCron({
      mode,
      force,
      explicitChatId: explicitChatId || null,
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (error) {
    console.error('[cron] Cron execution error:', error);
    return NextResponse.json({ ok: false, error: 'Cron execution failed' }, { status: 500 });
  }
}
