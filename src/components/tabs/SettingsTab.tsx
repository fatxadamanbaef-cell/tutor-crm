'use client';

import React, { useState, useEffect, useId } from 'react';
import { CreditCard, Check, CalendarClock, Send, Download, Info, ExternalLink, Loader2, CloudUpload, BellRing } from 'lucide-react';
import {
  loadTutorSettingsWithMeta,
  saveTutorSettings,
  TutorSettings,
  DEFAULT_SETTINGS,
} from '@/lib/settings';
import { ensureRecurringLessonsForAllActiveStudents } from '@/lib/storage';
import { generateMonthlyExportData } from '@/lib/reports';
import { hapticImpact, hapticNotification, getTelegramWebApp } from '@/lib/telegram';
import { useToast } from '@/components/ui/ToastProvider';

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

interface SettingsTabProps {
  onRefresh?: () => Promise<void> | void;
}

const REMINDER_PRESETS = [10, 15, 20, 30];

export const SettingsTab: React.FC<SettingsTabProps> = ({ onRefresh }) => {
  const { showToast } = useToast();
  const baseId = useId();
  const [settings, setSettings] = useState<TutorSettings>(DEFAULT_SETTINGS);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isExtending, setIsExtending] = useState(false);
  const [extendResult, setExtendResult] = useState<string | null>(null);

  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [digestResult, setDigestResult] = useState<string | null>(null);

  const [isCheckingBot, setIsCheckingBot] = useState(false);
  const [botStatusResult, setBotStatusResult] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    let active = true;

    // Fetch authoritative settings from Supabase (or detect localStorage migration)
    loadTutorSettingsWithMeta()
      .then((res) => {
        if (!active) return;
        setSettings(res.settings);
        setNeedsMigration(res.needsMigrationFromLocal);
      })
      .finally(() => {
        if (active) setIsLoadingSettings(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingSettings) return;

    setIsSavingSettings(true);
    setSaveError(null);
    hapticImpact('light');

    try {
      const updated = await saveTutorSettings(settings);
      setSettings(updated);
      setNeedsMigration(false);
      setSavedNotice(true);
      hapticNotification('success');
      showToast({ message: 'Реквизиты и настройки сохранены', tone: 'success' });
      setTimeout(() => setSavedNotice(false), 2200);
    } catch (err: unknown) {
      console.error('Failed to save tutor settings:', err);
      hapticNotification('error');
      setSaveError(getErrorMessage(err, 'Не удалось сохранить реквизиты в Supabase'));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleExtendSchedule = async () => {
    if (isExtending) return;
    hapticImpact('medium');
    setIsExtending(true);
    setExtendResult(null);
    try {
      const createdCount = await ensureRecurringLessonsForAllActiveStudents(9);
      await onRefresh?.();
      hapticNotification('success');
      setExtendResult(
        createdCount > 0
          ? `✅ Создано ${createdCount} новых уроков на 9 недель вперёд`
          : '✅ Все уроки на 9 недель вперёд уже запланированы'
      );
    } catch (e: unknown) {
      hapticNotification('error');
      setExtendResult(`❌ Ошибка: ${getErrorMessage(e, 'не удалось продлить расписание')}`);
    } finally {
      setIsExtending(false);
    }
  };

  const handleSendDigest = async () => {
    if (isSendingDigest) return;
    const initData = getTelegramWebApp()?.initData || '';
    if (!initData) {
      hapticNotification('warning');
      setDigestResult('⚠️ Откройте приложение внутри Telegram Mini App для отправки сводки');
      return;
    }

    hapticImpact('medium');
    setIsSendingDigest(true);
    setDigestResult(null);
    try {
      const res = await fetch('/api/bot/digest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        hapticNotification('success');
        setDigestResult('✅ Утренняя сводка отправлена в Telegram');
      } else if (res.status === 401 || res.status === 403) {
        hapticNotification('error');
        setDigestResult('⛔ Доступ запрещён или сессия Telegram устарела. Переоткройте Mini App');
      } else if (data.message || data.error) {
        setDigestResult(`ℹ️ ${data.message || data.error}`);
      } else {
        setDigestResult('⚠️ Не удалось отправить сводку (проверьте /start в боте)');
      }
    } catch (e: unknown) {
      hapticNotification('error');
      setDigestResult(`❌ Ошибка сети: ${getErrorMessage(e, 'не удалось отправить')}`);
    } finally {
      setIsSendingDigest(false);
    }
  };

  const handleCheckAndFixBot = async () => {
    if (isCheckingBot) return;
    hapticImpact('medium');
    setIsCheckingBot(true);
    setBotStatusResult(null);
    try {
      const initData = getTelegramWebApp()?.initData || '';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (initData) headers['x-telegram-init-data'] = initData;

      const res = await fetch('/api/bot/status', { method: 'POST', headers });
      const data = await res.json();
      if (res.ok && data.setWebhookOk) {
        hapticNotification('success');
        const parts: string[] = [
          data.webhookOk ? '✅ Вебхук активен' : '⚠️ Вебхук обновлён',
          data.registeredChatId ? `чат: ${data.registeredChatId}` : 'чат не привязан (нажмите /start в боте)',
        ];
        if (Array.isArray(data.notificationsSent) && data.notificationsSent.length > 0) {
          parts.push(`отправлено: ${data.notificationsSent.length}`);
        } else if (typeof data.remindersChecked === 'number') {
          parts.push(`проверено уроков сегодня: ${data.remindersChecked}`);
        }
        setBotStatusResult(parts.join(' · '));
      } else {
        hapticNotification('error');
        setBotStatusResult(`❌ ${data.lastErrorMessage || data.error || data.setWebhookDescription || 'Не удалось проверить бота'}`);
      }
    } catch (e: unknown) {
      hapticNotification('error');
      const message = e instanceof Error ? e.message : 'не удалось подключиться';
      setBotStatusResult(`❌ Ошибка сети: ${message}`);
    } finally {
      setIsCheckingBot(false);
    }
  };

  const handleExportMonthlyCsv = async () => {
    if (isExporting) return;
    hapticImpact('light');
    setIsExporting(true);
    try {
      const exportData = await generateMonthlyExportData();
      if (!exportData.csvContent) {
        showToast({ message: 'Нет данных активных учеников для экспорта', tone: 'warning' });
        return;
      }
      const blob = new Blob(['\uFEFF' + exportData.csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const monthTag = new Date().toISOString().substring(0, 7);
      const fileName = `tutor-crm-report-${monthTag}.csv`;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
      hapticNotification('success');
      showToast({ message: `Отчёт ${fileName} скачан`, tone: 'success' });
    } catch (e: unknown) {
      showToast({
        message: 'Ошибка экспорта: ' + (e instanceof Error ? e.message : String(e)),
        tone: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f4f5f8] pb-28 overflow-y-auto">
      <div className="px-4 pt-safe pb-3 bg-white border-b border-slate-200/80 sticky top-0 z-10">
        <h1 className="text-lg font-bold text-slate-900 tracking-tight leading-tight">Настройки</h1>
        <p className="text-xs text-slate-500 font-semibold mt-0.5">Реквизиты для счетов и управление ботом</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Payment Details Form */}
        <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200/80 space-y-3">
          <div className="flex items-center justify-between gap-2 pb-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Реквизиты для оплаты</h2>
                <p className="text-[11px] text-gray-500">Хранятся в базе и подставляются в счета и бота</p>
              </div>
            </div>
            {isLoadingSettings && <Loader2 className="w-4 h-4 text-gray-400 animate-spin shrink-0" />}
          </div>

          {needsMigration && (
            <div className="px-3 py-2 rounded-2xl bg-amber-50 border border-amber-200/80 text-amber-900 text-[11px] font-medium flex items-center gap-2">
              <CloudUpload className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Локальные реквизиты подставлены в форму — нажмите «Сохранить реквизиты» для переноса в базу.</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label
                htmlFor={`${baseId}-tutorName`}
                className="text-[10px] font-bold text-gray-400 uppercase block mb-1"
              >
                Имя репетитора
              </label>
              <input
                id={`${baseId}-tutorName`}
                name="tutor_name"
                type="text"
                value={settings.tutorName}
                onChange={(e) => setSettings((p) => ({ ...p, tutorName: e.target.value }))}
                className="w-full text-xs font-bold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label
                htmlFor={`${baseId}-bankName`}
                className="text-[10px] font-bold text-gray-400 uppercase block mb-1"
              >
                Банк / Сервис
              </label>
              <input
                id={`${baseId}-bankName`}
                name="bank_name"
                type="text"
                value={settings.bankName}
                onChange={(e) => setSettings((p) => ({ ...p, bankName: e.target.value }))}
                placeholder="Payme / Click / Uzcard"
                className="w-full text-xs font-bold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor={`${baseId}-cardNumber`}
              className="text-[10px] font-bold text-gray-400 uppercase block mb-1"
            >
              Номер карты
            </label>
            <input
              id={`${baseId}-cardNumber`}
              name="card_number"
              type="text"
              inputMode="numeric"
              value={settings.cardNumber}
              onChange={(e) => setSettings((p) => ({ ...p, cardNumber: e.target.value }))}
              placeholder="8600 0000 0000 0000"
              className="w-full text-xs font-semibold tabular-nums text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor={`${baseId}-cardHolder`}
              className="text-[10px] font-bold text-gray-400 uppercase block mb-1"
            >
              Получатель (ФИО на карте)
            </label>
            <input
              id={`${baseId}-cardHolder`}
              name="card_holder"
              type="text"
              value={settings.cardHolder}
              onChange={(e) => setSettings((p) => ({ ...p, cardHolder: e.target.value }))}
              placeholder="Имя Фамилия"
              className="w-full text-xs font-bold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div>
            <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1.5">
              Напоминание до урока (мин)
            </span>
            <div className="grid grid-cols-4 gap-1.5">
              {REMINDER_PRESETS.map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => {
                    hapticImpact('light');
                    setSettings((p) => ({ ...p, reminderMinutesBefore: min }));
                  }}
                  className={`py-1.5 rounded-xl text-xs font-semibold tabular-nums border transition-all active:scale-95 ${settings.reminderMinutesBefore === min
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                    }`}
                >
                  {min} мин
                </button>
              ))}
            </div>
          </div>

          {saveError && (
            <div
              role="alert"
              aria-live="polite"
              className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold"
            >
              {saveError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSavingSettings}
            className={`w-full py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-98 disabled:opacity-60 ${savedNotice
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20'
              }`}
          >
            {isSavingSettings ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Сохранение...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>{savedNotice ? 'Реквизиты сохранены!' : 'Сохранить реквизиты'}</span>
              </>
            )}
          </button>
        </form>

        {/* Automation & Bot Controls */}
        <div className="bg-white rounded-2xl p-4 shadow-2xs border border-slate-200/80 space-y-2.5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            Управление расписанием и ботом
          </h2>

          <button
            type="button"
            disabled={isExtending}
            onClick={handleExtendSchedule}
            className="w-full p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200/80 text-blue-800 text-xs font-bold flex items-center justify-between active:scale-98 transition-all disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-blue-600" />
              <span>Продлить регулярное расписание на 9 недель</span>
            </span>
            {isExtending && <Loader2 className="w-4 h-4 animate-spin" />}
          </button>
          {extendResult && (
            <p className="text-[11px] font-semibold text-gray-700 px-1">{extendResult}</p>
          )}

          <button
            type="button"
            disabled={isSendingDigest}
            onClick={handleSendDigest}
            className="w-full p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200/80 text-emerald-800 text-xs font-bold flex items-center justify-between active:scale-98 transition-all disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <Send className="w-4 h-4 text-emerald-600" />
              <span>Отправить утреннюю сводку в Telegram</span>
            </span>
            {isSendingDigest && <Loader2 className="w-4 h-4 animate-spin" />}
          </button>
          {digestResult && (
            <p className="text-[11px] font-semibold text-gray-700 px-1">{digestResult}</p>
          )}

          <button
            type="button"
            disabled={isCheckingBot}
            onClick={handleCheckAndFixBot}
            className="w-full p-3 rounded-2xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 text-indigo-900 text-xs font-bold flex items-center justify-between active:scale-98 transition-all disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-indigo-600" />
              <span>Проверить и починить уведомления бота</span>
            </span>
            {isCheckingBot && <Loader2 className="w-4 h-4 animate-spin" />}
          </button>
          {botStatusResult && (
            <p className="text-[11px] font-semibold text-gray-700 px-1">{botStatusResult}</p>
          )}

          <button
            type="button"
            disabled={isExporting}
            onClick={handleExportMonthlyCsv}
            className="w-full p-3 rounded-2xl bg-gray-50 hover:bg-gray-100 border border-gray-200 text-gray-800 text-xs font-bold flex items-center justify-between active:scale-98 transition-all disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <Download className="w-4 h-4 text-gray-600" />
              <span>Скачать финансовый отчёт за месяц (CSV)</span>
            </span>
            {isExporting && <Loader2 className="w-4 h-4 animate-spin" />}
          </button>
        </div>

        {/* About & Support */}
        <div className="bg-white rounded-2xl shadow-2xs border border-slate-200/80 divide-y divide-slate-100">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <Info className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <span className="text-xs font-bold text-gray-900 block">Версия CRM</span>
                <span className="text-[11px] text-gray-400">Tutor Tracker · Hybrid Billing</span>
              </div>
            </div>
            <span className="text-xs text-gray-500 font-bold tabular-nums">2.0</span>
          </div>
          <a href="https://t.me/farxad_dev" target="_blank" rel="noopener noreferrer" className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <ExternalLink className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-xs font-bold text-gray-900">Поддержка</span>
            </div>
            <span className="text-xs text-blue-600 font-bold">Telegram →</span>
          </a>
        </div>
      </div>
    </div>
  );
};
