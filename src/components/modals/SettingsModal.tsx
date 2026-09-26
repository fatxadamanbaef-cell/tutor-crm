'use client';

import React, { useState, useEffect } from 'react';
import { X, Settings, CreditCard, User, Bell, Check } from 'lucide-react';
import { getTutorSettings, saveTutorSettings, TutorSettings } from '@/lib/settings';
import { hapticImpact, hapticNotification } from '@/lib/telegram';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (settings: TutorSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [tutorName, setTutorName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [bankName, setBankName] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const s = getTutorSettings();
      setTutorName(s.tutorName);
      setCardNumber(s.cardNumber);
      setCardHolder(s.cardHolder);
      setBankName(s.bankName);
      setSavedSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const updated = saveTutorSettings({
      tutorName: tutorName.trim(),
      cardNumber: cardNumber.trim(),
      cardHolder: cardHolder.trim(),
      bankName: bankName.trim(),
    });

    hapticNotification('success');
    setSavedSuccess(true);
    if (onSaved) onSaved(updated);
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs text-zinc-200 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <h3 className="text-base font-extrabold text-zinc-100 flex items-center gap-2">
            <Settings className="w-4 h-4 text-teal-400" />
            <span>Настройки реквизитов</span>
          </h3>
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-200 bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-zinc-400 font-medium mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-teal-400" />
              <span>Ваше имя (преподаватель):</span>
            </label>
            <input
              type="text"
              required
              value={tutorName}
              onChange={(e) => setTutorName(e.target.value)}
              placeholder="Фархад"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 font-bold focus:outline-none focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-zinc-400 font-medium mb-1 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
              <span>Номер карты для оплат (Payme / Click / Uzum):</span>
            </label>
            <input
              type="text"
              required
              value={cardNumber}
              onChange={(e) => setCardNumber(e.target.value)}
              placeholder="8600 0000 0000 0000"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-emerald-300 font-mono font-bold text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-zinc-400 font-medium mb-1">Имя на карте:</label>
              <input
                type="text"
                value={cardHolder}
                onChange={(e) => setCardHolder(e.target.value)}
                placeholder="ФАРХАД Р."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 font-medium focus:outline-none focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-zinc-400 font-medium mb-1">Платежная система:</label>
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Payme / Click"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-zinc-100 font-medium focus:outline-none focus:border-teal-500"
              />
            </div>
          </div>

          {/* Info banner */}
          <div className="p-3 bg-teal-950/40 border border-teal-800/40 rounded-xl text-[11px] text-teal-200/90 leading-relaxed">
            💡 Эти реквизиты будут автоматически подставляться во все формируемые напоминания об оплатах и отчеты для родителей в 1 клик.
          </div>

          <button
            type="submit"
            className="w-full bg-teal-600 hover:bg-teal-500 text-zinc-100 font-bold py-3 px-4 rounded-xl shadow-lg active:scale-95 transition-all text-xs flex items-center justify-center gap-1.5"
          >
            {savedSuccess ? (
              <>
                <Check className="w-4 h-4 text-emerald-300" />
                <span>Сохранено!</span>
              </>
            ) : (
              <span>✓ Сохранить реквизиты</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};


