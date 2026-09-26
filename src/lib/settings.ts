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
  cardNumber: '8600 **** **** 1234',
  cardHolder: 'Фархад',
  bankName: 'Payme / Click',
  telegramUsername: '',
  telegramChatId: '',
  reminderMinutesBefore: 15,
};

const SETTINGS_KEY = 'tutor_crm_settings_v1';

export function getTutorSettings(): TutorSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (!saved) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveTutorSettings(settings: Partial<TutorSettings>): TutorSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const current = getTutorSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return DEFAULT_SETTINGS;
  }
}
