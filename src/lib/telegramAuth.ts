import crypto from 'crypto';
import type { NextRequest } from 'next/server';

const DEFAULT_INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60; // 24 hours

/**
 * Constant-time UTF-8 string comparison to prevent timing attacks on secrets.
 */
export function safeCompareStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Parses comma-separated ALLOWED_TELEGRAM_IDS env var into a Set of string IDs.
 */
export function getAllowedTelegramIds(): Set<string> {
  const raw = process.env.ALLOWED_TELEGRAM_IDS || '';
  return new Set(
    raw
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

/**
 * Checks whether fromId or chatId is in ALLOWED_TELEGRAM_IDS.
 * Fails closed (returns false) if ALLOWED_TELEGRAM_IDS is empty or unset.
 */
export function isAllowedTelegramUser(
  fromId?: number | string | null,
  chatId?: number | string | null
): boolean {
  const allowed = getAllowedTelegramIds();
  if (allowed.size === 0) {
    console.warn('[security] ALLOWED_TELEGRAM_IDS is empty or not configured — denying Telegram access.');
    return false;
  }
  if (fromId !== undefined && fromId !== null && allowed.has(String(fromId))) {
    return true;
  }
  if (chatId !== undefined && chatId !== null && allowed.has(String(chatId))) {
    return true;
  }
  return false;
}

/**
 * Checks `x-telegram-bot-api-secret-token` against `process.env.TELEGRAM_WEBHOOK_SECRET`.
 * When TELEGRAM_WEBHOOK_SECRET is configured, the header must match exactly.
 */
export function verifyTelegramWebhookSecret(req: NextRequest): boolean {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expectedSecret) {
    return true;
  }
  const providedSecret = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!providedSecret) {
    return false;
  }
  return safeCompareStrings(providedSecret, expectedSecret);
}

/**
 * Checks `Authorization: Bearer <CRON_SECRET>` header for Vercel Cron & internal jobs.
 * Fails closed (returns false) if CRON_SECRET is not configured.
 */
export function verifyCronSecret(req: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) {
    console.warn('[security] CRON_SECRET is not configured — denying cron/digest request.');
    return false;
  }
  const authHeader = req.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    return false;
  }
  return safeCompareStrings(token, expectedSecret);
}

export interface VerifiedTelegramWebAppUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

export type InitDataVerificationResult =
  | { ok: true; user: VerifiedTelegramWebAppUser; authDate: number }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Validates Telegram Mini App `initData` using HMAC-SHA256 with `TELEGRAM_BOT_TOKEN`,
 * verifies `auth_date` freshness, and enforces `ALLOWED_TELEGRAM_IDS`.
 */
export function verifyTelegramInitData(
  initData: string,
  maxAgeSeconds: number = DEFAULT_INIT_DATA_MAX_AGE_SEC
): InitDataVerificationResult {
  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!botToken) {
    return { ok: false, status: 401, error: 'TELEGRAM_BOT_TOKEN is not configured' };
  }
  if (!initData || !initData.trim()) {
    return { ok: false, status: 401, error: 'Missing Telegram initData' };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) {
    return { ok: false, status: 401, error: 'Invalid Telegram initData hash' };
  }

  const entries: Array<[string, string]> = [];
  params.forEach((value, key) => {
    if (key !== 'hash') {
      entries.push([key, value]);
    }
  });
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join('\n');

  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const expectedHashHex = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedHashHex, 'hex');
  const providedBuf = Buffer.from(hash, 'hex');
  if (expectedBuf.length !== providedBuf.length || !crypto.timingSafeEqual(expectedBuf, providedBuf)) {
    return { ok: false, status: 401, error: 'Invalid Telegram initData signature' };
  }

  const authDate = Number(params.get('auth_date'));
  const nowSec = Math.floor(Date.now() / 1000);
  if (
    !Number.isFinite(authDate) ||
    authDate <= 0 ||
    nowSec - authDate > maxAgeSeconds ||
    authDate - nowSec > 60
  ) {
    return { ok: false, status: 401, error: 'Expired Telegram initData' };
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    return { ok: false, status: 401, error: 'Missing Telegram user payload' };
  }

  let parsedUser: VerifiedTelegramWebAppUser;
  try {
    parsedUser = JSON.parse(userRaw) as VerifiedTelegramWebAppUser;
  } catch {
    return { ok: false, status: 401, error: 'Malformed Telegram user payload' };
  }

  if (parsedUser?.id === undefined || parsedUser?.id === null) {
    return { ok: false, status: 401, error: 'Missing Telegram user ID' };
  }

  if (!isAllowedTelegramUser(parsedUser.id, parsedUser.id)) {
    return { ok: false, status: 403, error: 'Forbidden: Telegram user is not allowed' };
  }

  return { ok: true, user: parsedUser, authDate };
}
