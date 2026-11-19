'use client';

import React, { useState, useEffect } from 'react';
import { CreditCard, Check, CalendarClock, Send, Download, Info, ExternalLink, Loader2 } from 'lucide-react';
import { getTutorSettings, saveTutorSettings, TutorSettings, DEFAULT_SETTINGS } from '@/lib/settings';
import { ensureRecurringLessonsForAllActiveStudents } from '@/lib/storage';
import { generateMonthlyExportData } from '@/lib/reports';
import { hapticImpact, hapticNotification, getTelegramWebApp } from '@/lib/telegram';

interface SettingsTabProps {
  onRefresh?: () => Promise<void> | void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ onRefresh }) => {
  const [settings, setSettings] = useState<TutorSettings>(DEFAULT_SETTINGS);
  const [savedNotice, setSavedNotice] = useState(false);

  const [isExtending, setIsExtending] = useState(false);
  const [extendResult, setExtendResult] = useState<string | null>(null);

  const [isSendingDigest, setIsSendingDigest] = useState(false);
  const [digestResult, setDigestResult] = useState<string | null>(null);

  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setSettings(getTutorSettings());
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    hapticNotification('success');
    const updated = saveTutorSettings(settings);
    setSettings(updated);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
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
    } catch (e: any) {
      hapticNotification('error');
      setExtendResult(`❌ Ошибка: ${e?.message || 'не удалось продлить расписание'}`);
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
    } catch (e: any) {
      hapticNotification('error');
      setDigestResult(`❌ Ошибка сети: ${e?.message || 'не удалось отправить'}`);
    } finally {
      setIsSendingDigest(false);
    }
  };

  const handleExportMonthlyCsv = async () => {
    if (isExporting) return;
    hapticImpact('light');
    setIsExporting(true);
    try {
      const exportData = await generateMonthlyExportData();
      if (!exportData.csvContent) {
        alert('Нет данных активных учеников для экспорта');
        return;
      }
      const blob = new Blob(['\uFEFF' + exportData.csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const monthTag = new Date().toISOString().substring(0, 7);
      a.download = `tutor-crm-report-${monthTag}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      hapticNotification('success');
    } catch (e: any) {
      alert('Ошибка экспорта: ' + (e?.message || String(e)));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f2f2f7] pb-28 overflow-y-auto">
      <div className="px-4 pt-6 pb-4 bg-white border-b border-gray-200 sticky top-0 z-10">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Настройки</h1>
        <p className="text-xs text-gray-500 font-semibold mt-0.5">Реквизиты для счетов и управление ботом</p>
      </div>

      <div className="p-4 space-y-4">
        {/* Payment Details Form */}
        <form onSubmit={handleSaveSettings} className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80 space-y-3">
          <div className="flex items-center gap-2 pb-1">
            <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Реквизиты для оплаты</h2>
              <p className="text-[11px] text-gray-500">Подставляются в счёт для родителей</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                Имя репетитора
              </label>
              <input
                type="text"
                value={settings.tutorName}
                onChange={(e) => setSettings((p) => ({ ...p, tutorName: e.target.value }))}
                className="w-full text-xs font-bold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
                Банк / Сервис
              </label>
              <input
                type="text"
                value={settings.bankName}
                onChange={(e) => setSettings((p) => ({ ...p, bankName: e.target.value }))}
                placeholder="Payme / Click / Uzcard"
                className="w-full text-xs font-bold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
              Номер карты
            </label>
            <input
              type="text"
              value={settings.cardNumber}
              onChange={(e) => setSettings((p) => ({ ...p, cardNumber: e.target.value }))}
              placeholder="8600 0000 0000 0000"
              className="w-full text-xs font-semibold tabular-nums text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-[10px] font-bold text-gray-400 uppercase block mb-1">
              Получатель (ФИО на карте)
            </label>
            <input
              type="text"
              value={settings.cardHolder}
              onChange={(e) => setSettings((p) => ({ ...p, cardHolder: e.target.value }))}
              placeholder="Имя Фамилия"
              className="w-full text-xs font-bold text-gray-900 bg-gray-50 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:border-blue-500"
            />
          </div>

          <button
            type="submit"
            className={`w-full py-2.5 rounded-2xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all active:scale-98 ${
              savedNotice
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>{savedNotice ? 'Реквизиты сохранены!' : 'Сохранить реквизиты'}</span>
          </button>
        </form>

        {/* Automation & Bot Controls */}
        <div className="bg-white rounded-3xl p-4 shadow-xs border border-gray-200/80 space-y-2.5">
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
        <div className="bg-white rounded-3xl shadow-xs border border-gray-200/80 divide-y divide-gray-100">
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
            <span className="text-xs text-gray-500 font-bold">2.0</span>
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
