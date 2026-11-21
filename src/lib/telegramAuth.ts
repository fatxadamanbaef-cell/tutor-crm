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
 * Parses comma-separated ALLOWED_TELEGRAM_IDS env var plus TEACHER_TELEGRAM_CHAT_ID
 * and any dynamically supplied IDs (such as `_BOT_CONFIG.phone`) into a Set of string IDs.
 */
export function getAllowedTelegramIds(
  additionalAllowedIds?: Array<string | number | null | undefined>
): Set<string> {
  const ids = new Set<string>();
  const raw = process.env.ALLOWED_TELEGRAM_IDS || '';
  raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .forEach((id) => ids.add(id));

  const envTeacherId = (process.env.TEACHER_TELEGRAM_CHAT_ID || '').trim();
  if (envTeacherId) {
    ids.add(envTeacherId);
  }

  if (Array.isArray(additionalAllowedIds)) {
    for (const id of additionalAllowedIds) {
      const clean = id !== undefined && id !== null ? String(id).trim() : '';
      if (clean) ids.add(clean);
    }
  }

  return ids;
}

/**
 * Checks whether fromId or chatId is in the allowed Telegram IDs list
 * (env `ALLOWED_TELEGRAM_IDS`, `TEACHER_TELEGRAM_CHAT_ID`, or `additionalAllowedIds`).
 * Fails closed (returns false) if no allowed IDs are configured anywhere.
 */
export function isAllowedTelegramUser(
  fromId?: number | string | null,
  chatId?: number | string | null,
  additionalAllowedIds?: Array<string | number | null | undefined>
): boolean {
  const allowed = getAllowedTelegramIds(additionalAllowedIds);
  if (allowed.size === 0) {
    console.warn('[security] No allowed Telegram IDs configured — denying Telegram access.');
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
 * Returns true if `x-telegram-bot-api-secret-token` is present and matches `TELEGRAM_WEBHOOK_SECRET`
 * (or if `TELEGRAM_WEBHOOK_SECRET` is not configured).
 */
export function hasMatchingTelegramWebhookSecret(req: NextRequest): boolean {
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
 * Checks `x-telegram-bot-api-secret-token` against `process.env.TELEGRAM_WEBHOOK_SECRET`.
 * If the header is present, it must match strictly.
 * If the header is missing (e.g. `setWebhook` was previously registered without `secret_token`),
 * logs a warning and permits the request to reach the strict Telegram user/chat whitelist check
 * so legitimate bot updates are never dropped with 401.
 */
export function verifyTelegramWebhookSecret(req: NextRequest): boolean {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expectedSecret) {
    return true;
  }
  const providedSecret = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!providedSecret) {
    console.warn(
      '[security] Missing x-telegram-bot-api-secret-token header — relying on Telegram user whitelist.'
    );
    return true;
  }
  return safeCompareStrings(providedSecret, expectedSecret);
}

/**
 * Extracts cron secret token from any supported transport:
 *  1. `Authorization: Bearer <CRON_SECRET>` (Vercel Cron & standard HTTP clients)
 *  2. `x-cron-secret: <CRON_SECRET>` header
 *  3. `?secret=<CRON_SECRET>` query parameter (external schedulers such as cron-job.org)
 */
export function extractCronSecret(req: NextRequest): string {
  const authHeader = req.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice('Bearer '.length).trim();
    if (bearer) return bearer;
  }

  const headerSecret = req.headers.get('x-cron-secret')?.trim();
  if (headerSecret) return headerSecret;

  try {
    const url = new URL(req.url);
    const querySecret = url.searchParams.get('secret')?.trim();
    if (querySecret) return querySecret;
  } catch {
    // Ignore malformed URL
  }

  return '';
}

/**
 * Returns true if the request carries any cron-secret credential (Bearer header, x-cron-secret, or ?secret=).
 */
export function hasCronSecretCredentials(req: NextRequest): boolean {
  return Boolean(extractCronSecret(req));
}

/**
 * Checks cron credentials against `process.env.CRON_SECRET`, Telegram Mini App `x-telegram-init-data`,
 * or an explicit `?chat_id=` matching a registered tutor Telegram ID.
 */
export function verifyCronSecret(
  req: NextRequest,
  additionalAllowedIds?: Array<string | number | null | undefined>
): boolean {
  const token = extractCronSecret(req);
  const expectedSecret = process.env.CRON_SECRET?.trim();

  if (token) {
    if (!expectedSecret) {
      console.warn('[security] CRON_SECRET is not configured — denying secret-based cron request.');
      return false;
    }
    const valid = safeCompareStrings(token, expectedSecret);
    if (!valid) {
      console.warn('[security] Cron/digest request provided invalid CRON_SECRET.');
    }
    return valid;
  }

  const initData = req.headers.get('x-telegram-init-data') || '';
  if (initData.trim()) {
    const verification = verifyTelegramInitData(
      initData,
      DEFAULT_INIT_DATA_MAX_AGE_SEC,
      additionalAllowedIds
    );
    return verification.ok;
  }

  try {
    const url = new URL(req.url);
    const queryChatId = url.searchParams.get('chat_id')?.trim();
    if (queryChatId && getAllowedTelegramIds(additionalAllowedIds).has(queryChatId)) {
      return true;
    }
  } catch {
    // Ignore malformed URL
  }

  if (!expectedSecret) {
    return true;
  }

  console.warn('[security] Cron/digest request missing credentials (Bearer / x-cron-secret / ?secret=).');
  return false;
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
 * verifies `auth_date` freshness, and enforces Telegram user whitelist.
 */
export function verifyTelegramInitData(
  initData: string,
  maxAgeSeconds: number = DEFAULT_INIT_DATA_MAX_AGE_SEC,
  additionalAllowedIds?: Array<string | number | null | undefined>
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

  if (!isAllowedTelegramUser(parsedUser.id, parsedUser.id, additionalAllowedIds)) {
    return { ok: false, status: 403, error: 'Forbidden: Telegram user is not allowed' };
  }

  return { ok: true, user: parsedUser, authDate };
}
