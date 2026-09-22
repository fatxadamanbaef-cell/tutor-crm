'use client';

import React, { useState } from 'react';
import { Student, Lesson } from '@/types';
import {
  X,
  FileText,
  Copy,
  Send,
  CheckCircle2,
  Calendar,
  Sparkles,
  CreditCard,
} from 'lucide-react';
import { hapticNotification, hapticImpact } from '@/lib/telegram';
import { formatCurrency } from '@/lib/formatters';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

interface ParentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: Student | null;
  lessons: Lesson[];
}

export const ParentReportModal: React.FC<ParentReportModalProps> = ({
  isOpen,
  onClose,
  student,
  lessons,
}) => {
  const [copied, setCopied] = useState(false);
  const [customPaymentDetails, setCustomPaymentDetails] = useState('Payme / Click: +998 90 000 00 00 (Карта: 8600 **** **** ****)');

  if (!isOpen || !student) return null;

  // Filter student completed lessons
  const studentLessons = lessons.filter(
    (l) => l.student_id === student.id && l.status === 'completed'
  );

  const isPackage = student.payment_type === 'package';
  const remaining = student.package_remaining_lessons ?? 0;
  const totalInPackage = student.package_total_lessons || 8;
  const nextPaymentAmount = formatCurrency(student.price_per_lesson * totalInPackage);

  // Generate friendly message text
  const generateReportText = () => {
    const datesList =
      studentLessons.length > 0
        ? studentLessons
            .slice(-8)
            .map((l, i) => `  ${i + 1}. ${l.lesson_date} (${l.start_time})${l.notes ? ` — ${l.notes}` : ''}`)
            .join('\n')
        : '  • Занятия по расписанию';

    return `Здравствуйте! Отчет по занятиям ученика: ${student.name}

📚 Проведено занятий: ${studentLessons.length}
${datesList}

${
  isPackage
    ? `📦 Статус абонемента: осталось ${remaining} из ${totalInPackage} уроков.${
        remaining <= 1
          ? `\n⚠️ Текущий абонемент подходит к концу. Сумма к оплате за следующий пакет (${totalInPackage} уроков): ${nextPaymentAmount}.`
          : ''
      }`
    : `💵 Формат оплаты: поурочно (${formatCurrency(student.price_per_lesson)} за урок).`
}

Реквизиты для оплаты:
${customPaymentDetails}

Спасибо за доверие и успехов в учебе! 🎓`;
  };

  const reportText = generateReportText();

  const handleCopy = () => {
    navigator.clipboard.writeText(reportText);
    setCopied(true);
    hapticNotification('success');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenTelegram = () => {
    if (student.telegram) {
      const username = student.telegram.replace('@', '');
      window.open(`https://t.me/${username}`, '_blank');
    } else {
      handleCopy();
      alert('Текст отчета скопирован! Теперь вставьте его в чат с родителем.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[92vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-400" />
            <span>Отчет для родителей: {student.name}</span>
          </h3>
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-1 rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preview of Report */}
        <div className="space-y-2">
          <label className="block text-slate-400 font-semibold">
            Готовый текст сообщения для Telegram:
          </label>
          <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 font-mono text-[11px] text-slate-200 whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
            {reportText}
          </div>
        </div>

        {/* Editable payment details */}
        <div>
          <label className="block text-slate-400 mb-1 font-medium">
            Ваши реквизиты для оплаты (Payme / Click):
          </label>
          <input
            type="text"
            value={customPaymentDetails}
            onChange={(e) => setCustomPaymentDetails(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-[11px] focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Action Buttons */}
        <div className="pt-2 space-y-2">
          <button
            onClick={handleCopy}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-600/20 transition-all active:scale-95 text-xs"
          >
            {copied ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>Отчет скопирован в буфер обмена!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Скопировать текст отчета</span>
              </>
            )}
          </button>

          {student.telegram && (
            <button
              onClick={handleOpenTelegram}
              className="w-full flex items-center justify-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 font-semibold py-2.5 px-4 rounded-xl transition-all active:scale-95 text-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Перейти в чат {student.telegram}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
