// Safe Telegram WebApp wrapper

declare global {
  interface Window {
    Telegram?: {
      WebApp?: any;
    };
  }
}

export function getTelegramWebApp() {
  if (typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
}

export function initTelegramApp() {
  const webApp = getTelegramWebApp();
  if (webApp) {
    try {
      webApp.ready();
      webApp.expand();
      webApp.enableClosingConfirmation?.();
    } catch (e) {
      console.warn('Telegram WebApp init warning', e);
    }
  }
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') {
  const webApp = getTelegramWebApp();
  if (webApp?.HapticFeedback) {
    try {
      webApp.HapticFeedback.impactOccurred(style);
    } catch {}
  }
}

export function hapticNotification(type: 'error' | 'success' | 'warning') {
  const webApp = getTelegramWebApp();
  if (webApp?.HapticFeedback) {
    try {
      webApp.HapticFeedback.notificationOccurred(type);
    } catch {}
  }
}

export function hapticSelection() {
  const webApp = getTelegramWebApp();
  if (webApp?.HapticFeedback) {
    try {
      webApp.HapticFeedback.selectionChanged();
    } catch {}
  }
}
