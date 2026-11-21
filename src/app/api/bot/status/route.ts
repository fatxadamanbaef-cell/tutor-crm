import { NextResponse } from 'next/server';
import { getRegisteredChatId } from '@/lib/botState';
import { executeBotCron, resolveRecipientChatIds } from '@/lib/botCron';
import { getAllowedTelegramIds } from '@/lib/telegramAuth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://tutor-crm-kappa.vercel.app';

interface WebhookDiagnostic {
  ok: boolean;
  botTokenConfigured: boolean;
  webhookOk: boolean;
  webhookUrl: string;
  expectedWebhookUrl: string;
  hasCustomCertificate: boolean;
  pendingUpdateCount: number;
  lastErrorDate: number | null;
  lastErrorMessage: string | null;
  registeredChatId: string;
  recipientsCount: number;
  allowedIdsCount: number;
  cronSecretConfigured: boolean;
  webhookSecretConfigured: boolean;
}

async function fetchWebhookDiagnostic(): Promise<WebhookDiagnostic> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
  const registeredChatId = await getRegisteredChatId();
  const recipients = await resolveRecipientChatIds();
  const allowedIds = getAllowedTelegramIds([registeredChatId]);
  const expectedWebhookUrl = `${APP_URL.replace(/\/$/, '')}/api/bot`;

  if (!botToken) {
    return {
      ok: false,
      botTokenConfigured: false,
      webhookOk: false,
      webhookUrl: '',
      expectedWebhookUrl,
      hasCustomCertificate: false,
      pendingUpdateCount: 0,
      lastErrorDate: null,
      lastErrorMessage: 'TELEGRAM_BOT_TOKEN is not configured',
      registeredChatId,
      recipientsCount: recipients.length,
      allowedIdsCount: allowedIds.size,
      cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
      webhookSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim()),
    };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`, {
      cache: 'no-store',
    });
    const data = await res.json();
    const info = data?.result || {};
    const webhookUrl = String(info.url || '');
    const webhookOk = Boolean(data?.ok && webhookUrl === expectedWebhookUrl && !info.last_error_message);

    return {
      ok: Boolean(data?.ok),
      botTokenConfigured: true,
      webhookOk,
      webhookUrl,
      expectedWebhookUrl,
      hasCustomCertificate: Boolean(info.has_custom_certificate),
      pendingUpdateCount: Number(info.pending_update_count || 0),
      lastErrorDate: info.last_error_date ? Number(info.last_error_date) : null,
      lastErrorMessage: info.last_error_message ? String(info.last_error_message) : null,
      registeredChatId,
      recipientsCount: recipients.length,
      allowedIdsCount: allowedIds.size,
      cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
      webhookSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim()),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to query Telegram getWebhookInfo';
    return {
      ok: false,
      botTokenConfigured: true,
      webhookOk: false,
      webhookUrl: '',
      expectedWebhookUrl,
      hasCustomCertificate: false,
      pendingUpdateCount: 0,
      lastErrorDate: null,
      lastErrorMessage: message,
      registeredChatId,
      recipientsCount: recipients.length,
      allowedIdsCount: allowedIds.size,
      cronSecretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
      webhookSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET?.trim()),
    };
  }
}

export async function GET() {
  const diagnostic = await fetchWebhookDiagnostic();
  return NextResponse.json(diagnostic, { status: diagnostic.botTokenConfigured ? 200 : 500 });
}

export async function POST() {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    if (!botToken) {
      return NextResponse.json(
        { ok: false, error: 'TELEGRAM_BOT_TOKEN is not configured' },
        { status: 500 }
      );
    }

    const expectedWebhookUrl = `${APP_URL.replace(/\/$/, '')}/api/bot`;
    const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

    const setWebhookPayload: Record<string, unknown> = {
      url: expectedWebhookUrl,
      allowed_updates: ['message', 'callback_query'],
    };
    if (secretToken) {
      setWebhookPayload.secret_token = secretToken;
    }

    const setRes = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(setWebhookPayload),
    });
    const setJson = await setRes.json();

    const [diagnostic, reminderRun] = await Promise.all([
      fetchWebhookDiagnostic(),
      executeBotCron({ mode: 'reminders', force: false }),
    ]);

    return NextResponse.json({
      ...diagnostic,
      setWebhookOk: Boolean(setJson?.ok),
      setWebhookDescription: setJson?.description || null,
      remindersChecked: reminderRun.checked_lessons_today,
      notificationsSent: reminderRun.notifications_sent,
      cronErrors: reminderRun.errors,
    });
  } catch (err: unknown) {
    console.error('[bot/status] Repair error:', err);
    const message = err instanceof Error ? err.message : 'Failed to check/repair bot webhook';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
