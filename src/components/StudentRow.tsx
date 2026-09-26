'use client';

import React, { useState } from 'react';
import { Student } from '@/types';
import { ChevronRight, BellRing, Check, Send } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { formatUZS } from '@/lib/formatters';

interface StudentRowProps {
  student: Student;
  onClick: (student: Student) => void;
}

export const StudentRow: React.FC<StudentRowProps> = ({ student, onClick }) => {
  const [copied, setCopied] = useState(false);
  const isHealthy = student.prepaid_balance > 1;
  const hasMakeupDebt = student.makeup_debt > 0;

  const handleRowClick = () => {
    hapticImpact('light');
    onClick(student);
  };

  const handleQuickReminderClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent opening bottom sheet
    hapticNotification('warning');

    const price = student.price_per_lesson || 150000;
    const rem = student.prepaid_balance <= 0 ? 0 : student.prepaid_balance;
    const text = `Здравствуйте! 📚 Напоминаю, что у ${student.name} остался ${rem} оплаченный урок.\nПожалуйста, пополните абонемент (${formatUZS(price * 8)} за 8 уроков).\nРеквизиты карты Payme / Click: 8600 **** **** 1234.\nСпасибо! 🙌`;

    navigator.clipboard.writeText(text);
    setCopied(true);

    if (student.telegram) {
      const cleanUsername = student.telegram.replace('@', '');
      window.open(`https://t.me/${cleanUsername}`, '_blank');
    }

    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={handleRowClick}
      className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 active:bg-slate-800 border border-slate-800/90 transition-all active:scale-[0.98] cursor-pointer shadow-sm select-none"
    >
      {/* Student Name & Telegram */}
      <div className="flex items-center gap-2.5 min-w-0 pr-2">
        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
        <div className="truncate">
          <div className="font-bold text-sm text-slate-100 truncate">
            {student.name}
          </div>
          {student.telegram && (
            <div className="text-[10px] text-slate-400 truncate">
              {student.telegram}
            </div>
          )}
        </div>
      </div>

      {/* Badges / Smart Reminder Button */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Makeup Debt Badge (Orange) - only shown if > 0 */}
        {hasMakeupDebt && (
          <span className="inline-flex items-center text-[10px] font-extrabold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-lg whitespace-nowrap">
            Отработки: {student.makeup_debt}
          </span>
        )}

        {/* If balance > 1 -> Green Badge */}
        {isHealthy ? (
          <span className="inline-flex items-center text-[11px] font-extrabold text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-lg whitespace-nowrap">
            Оплачено: {student.prepaid_balance} ур.
          </span>
        ) : (
          /* If balance <= 1 -> Bright Red/Amber Action Button */
          <button
            type="button"
            onClick={handleQuickReminderClick}
            className="inline-flex items-center gap-1 text-[11px] font-extrabold text-white bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 active:from-rose-700 active:to-rose-600 border border-rose-400/40 px-2.5 py-1 rounded-xl shadow-md shadow-rose-600/30 transition-all active:scale-95 whitespace-nowrap"
            title="Нажмите, чтобы скопировать напоминание и открыть Telegram"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-white" />
                <span>Скопировано!</span>
              </>
            ) : (
              <>
                <BellRing className="w-3 h-3 text-rose-100 animate-bounce" />
                <span>
                  {student.prepaid_balance <= 0
                    ? '🔔 Напомнить (долг)'
                    : '🔔 Напомнить (ост. 1)'}
                </span>
              </>
            )}
          </button>
        )}

        <ChevronRight className="w-4 h-4 text-slate-500 shrink-0 ml-0.5" />
      </div>
    </div>
  );
};
