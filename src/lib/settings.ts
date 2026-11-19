import type { Student, BillingCalculation } from '@/types';
import { supabase } from './supabase';

export interface TutorSettings {
  tutorName: string;
  cardNumber: string;
  cardHolder: string;
  bankName: string;
  telegramUsername?: string;
  telegramChatId?: string;
  reminderMinutesBefore: number;
}

export const DEFAULT_SETTINGS: TutorSettings = {
  tutorName: 'Фархад',
  cardNumber: '',
  cardHolder: '',
  bankName: 'Payme / Click',
  telegramUsername: '',
  telegramChatId: '',
  reminderMinutesBefore: 15,
};

const SETTINGS_KEY = 'tutor_crm_settings_v1';
const SETTINGS_ROW_ID = 'default';

interface TutorSettingsRow {
  id: string;
  tutor_name: string | null;
  bank_name: string | null;
  card_number: string | null;
  card_holder: string | null;
  reminder_minutes_before: number | null;
  updated_at?: string | null;
}

function readLocalCacheRaw(): Partial<TutorSettings> | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = window.localStorage.getItem(SETTINGS_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Partial<TutorSettings>;
  } catch {
    return null;
  }
}

function writeLocalCache(settings: TutorSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

function mapRowToSettings(row: TutorSettingsRow, fallbackCache?: Partial<TutorSettings> | null): TutorSettings {
  const reminderVal = Number(row.reminder_minutes_before);
  return {
    tutorName: (row.tutor_name ?? DEFAULT_SETTINGS.tutorName).trim() || DEFAULT_SETTINGS.tutorName,
    bankName: row.bank_name ?? DEFAULT_SETTINGS.bankName,
    cardNumber: row.card_number ?? '',
    cardHolder: row.card_holder ?? '',
    telegramUsername: fallbackCache?.telegramUsername || '',
    telegramChatId: fallbackCache?.telegramChatId || '',
    reminderMinutesBefore: Number.isFinite(reminderVal) && reminderVal > 0 ? reminderVal : DEFAULT_SETTINGS.reminderMinutesBefore,
  };
}

/**
 * Synchronous client-only cache read for instant initial render.
 */
export function getCachedTutorSettings(): TutorSettings {
  const cached = readLocalCacheRaw();
  if (!cached) return DEFAULT_SETTINGS;
  return { ...DEFAULT_SETTINGS, ...cached };
}

export interface LoadedTutorSettingsResult {
  settings: TutorSettings;
  existsInDb: boolean;
  needsMigrationFromLocal: boolean;
}

/**
 * Loads tutor settings from Supabase `tutor_settings` (`id = 'default'`).
 * - If a row exists in Supabase, updates the client localStorage cache and returns it.
 * - If no row exists yet in Supabase, checks localStorage (`tutor_crm_settings_v1`):
 *   if local settings exist, returns them with `needsMigrationFromLocal = true` so
 *   SettingsTab can prefill the form and persist to Supabase when the user saves.
 */
export async function loadTutorSettingsWithMeta(): Promise<LoadedTutorSettingsResult> {
  const localRaw = readLocalCacheRaw();
  const localMerged: TutorSettings = localRaw ? { ...DEFAULT_SETTINGS, ...localRaw } : DEFAULT_SETTINGS;

  try {
    const { data, error } = await supabase
      .from('tutor_settings')
      .select('id, tutor_name, bank_name, card_number, card_holder, reminder_minutes_before, updated_at')
      .eq('id', SETTINGS_ROW_ID)
      .maybeSingle();

    if (error) {
      console.warn('[settings] Failed to read tutor_settings from Supabase, using fallback:', error.message);
      return {
        settings: localMerged,
        existsInDb: false,
        needsMigrationFromLocal: Boolean(localRaw),
      };
    }

    if (data) {
      const mapped = mapRowToSettings(data as TutorSettingsRow, localRaw);
      writeLocalCache(mapped);
      return {
        settings: mapped,
        existsInDb: true,
        needsMigrationFromLocal: false,
      };
    }

    // No row in Supabase yet — prefill from localStorage if available
    return {
      settings: localMerged,
      existsInDb: false,
      needsMigrationFromLocal: Boolean(localRaw),
    };
  } catch (e) {
    console.warn('[settings] Unexpected error reading tutor_settings:', e);
    return {
      settings: localMerged,
      existsInDb: false,
      needsMigrationFromLocal: Boolean(localRaw),
    };
  }
}

/**
 * Reads unified tutor settings from Supabase (works on both server & client).
 * Falls back to localStorage cache (client) or DEFAULT_SETTINGS (server).
 */
export async function getTutorSettings(): Promise<TutorSettings> {
  const { settings } = await loadTutorSettingsWithMeta();
  return settings;
}

/**
 * Saves tutor settings to Supabase `tutor_settings` (`id = 'default'`) and updates client cache.
 */
export async function saveTutorSettings(settings: Partial<TutorSettings>): Promise<TutorSettings> {
  const base = typeof window !== 'undefined' ? getCachedTutorSettings() : DEFAULT_SETTINGS;
  const merged: TutorSettings = {
    ...base,
    ...settings,
    tutorName: (settings.tutorName ?? base.tutorName).trim() || DEFAULT_SETTINGS.tutorName,
    bankName: (settings.bankName ?? base.bankName).trim(),
    cardNumber: (settings.cardNumber ?? base.cardNumber).trim(),
    cardHolder: (settings.cardHolder ?? base.cardHolder).trim(),
    reminderMinutesBefore:
      Number.isFinite(Number(settings.reminderMinutesBefore)) && Number(settings.reminderMinutesBefore) > 0
        ? Math.round(Number(settings.reminderMinutesBefore))
        : base.reminderMinutesBefore || DEFAULT_SETTINGS.reminderMinutesBefore,
  };

  const dbPayload = {
    id: SETTINGS_ROW_ID,
    tutor_name: merged.tutorName,
    bank_name: merged.bankName,
    card_number: merged.cardNumber,
    card_holder: merged.cardHolder,
    reminder_minutes_before: merged.reminderMinutesBefore,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('tutor_settings')
    .upsert([dbPayload], { onConflict: 'id' })
    .select('id, tutor_name, bank_name, card_number, card_holder, reminder_minutes_before, updated_at')
    .single();

  if (error) {
    console.error('[settings] Failed to save tutor_settings to Supabase:', error);
    throw error;
  }

  const saved = data ? mapRowToSettings(data as TutorSettingsRow, merged) : merged;
  writeLocalCache(saved);
  return saved;
}

/**
 * Builds a parent-ready payment invoice message with live tutor payment requisites.
 */
export function buildParentInvoiceMessage(
  student: Pick<Student, 'name' | 'lesson_rate' | 'lessons_balance' | 'monthly_target_lessons'>,
  calc: BillingCalculation,
  settings: TutorSettings
): string {
  const lessonRate = calc.lessonRate || student.lesson_rate || 300000;
  const lessonsBalance = typeof calc.lessonsBalance === 'number' ? calc.lessonsBalance : (student.lessons_balance ?? 0);

  let msg = `Здравствуйте! 📚 Направляю информацию по оплате занятий (${student.name}):\n\n`;
  if (calc.billingType === 'package') {
    const size = calc.packageSize || student.monthly_target_lessons || 12;
    const sum = calc.packageAmount || size * lessonRate;
    msg += `📦 Абонемент: ${size} уроков\n`;
    msg += `💳 Стоимость пакета: ${sum.toLocaleString('ru-RU')} сум (${lessonRate.toLocaleString('ru-RU')} сум/урок)\n`;
    msg += `⚖️ Текущий баланс: ${lessonsBalance} ур.\n`;
    if (lessonsBalance < 0) {
      const debt = Math.abs(lessonsBalance) * lessonRate;
      msg += `⚠️ Задолженность за ${Math.abs(lessonsBalance)} ур.: ${debt.toLocaleString('ru-RU')} сум\n`;
    }
  } else {
    const sD = calc.startDate?.split('-').reverse().join('.') || '';
    const eD = calc.endDate?.split('-').reverse().join('.') || '';
    msg += `📅 Расчётный период: ${sD} – ${eD}\n`;
    msg += `🗓 Занятий по графику: ${calc.scheduledLessonsCount || 0} ур.\n`;
    msg += `⚖️ Текущий баланс: ${lessonsBalance} ур.\n`;
    msg += `💳 К оплате: ${calc.lessonsToPay ?? 0} ур. = ${(calc.netAmount ?? 0).toLocaleString('ru-RU')} сум\n`;
  }

  const cardNumber = (settings.cardNumber || '').trim();
  const bankName = (settings.bankName || 'Карта').trim();
  const holder = (settings.cardHolder || settings.tutorName || '').trim();

  if (cardNumber) {
    msg += `\n💳 Реквизиты для оплаты:\n${bankName}: ${cardNumber}\n`;
    if (holder) {
      msg += `Получатель: ${holder}\n`;
    }
  }

  msg += `\nБуду рад(а) подтверждению после перевода! 🙏`;
  return msg;
}
