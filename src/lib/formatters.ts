import { Currency } from '@/types';

const CURRENCY_KEY = 'tutor_currency_v1';

export function getAppCurrency(): Currency {
  if (typeof window === 'undefined') return 'сум';
  try {
    const saved = localStorage.getItem(CURRENCY_KEY);
    return (saved as Currency) || 'сум';
  } catch {
    return 'сум';
  }
}

export function setAppCurrency(curr: Currency): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CURRENCY_KEY, curr);
  } catch {}
}

export function formatCurrency(amount: number, currency: Currency = 'сум'): string {
  if (isNaN(amount) || amount === undefined || amount === null) return `0 ${currency}`;
  return `${amount.toLocaleString('ru-RU')} ${currency}`;
}
