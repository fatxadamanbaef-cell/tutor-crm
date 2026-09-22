'use client';

import React, { useState } from 'react';
import { Payment, Student, Lesson } from '@/types';
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Send,
  CheckCircle2,
  Copy,
  Calendar,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { formatCurrency } from '@/lib/formatters';

interface FinancesViewProps {
  payments: Payment[];
  students: Student[];
  lessons: Lesson[];
  onAddPayment: () => void;
}

export const FinancesView: React.FC<FinancesViewProps> = ({
  payments,
  students,
  lessons,
  onAddPayment,
}) => {
  const [copiedStudentId, setCopiedStudentId] = useState<string | null>(null);

  // Calculate monthly stats
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const monthlyPayments = payments.filter((p) => {
    const d = new Date(p.payment_date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  const totalMonthlyIncome = monthlyPayments.reduce((acc, p) => acc + (p.amount || 0), 0);

  const completedLessonsThisMonth = lessons.filter((l) => {
    const d = new Date(l.lesson_date);
    return (
      l.status === 'completed' &&
      d.getMonth() === currentMonth &&
      d.getFullYear() === currentYear
    );
  }).length;

  // Students requiring payment reminder
  const packageEndingStudents = students.filter(
    (s) => s.payment_type === 'package' && (s.package_remaining_lessons ?? 0) <= 1
  );

  const copyReminderText = (student: Student) => {
    const remaining = student.package_remaining_lessons ?? 0;
    const packageTotal = student.package_total_lessons || 8;
    const totalAmount = formatCurrency(student.price_per_lesson * packageTotal);

    const text =
      remaining === 0
        ? `Ассалому алейкум, ${student.name}! Напоминаю, что оплаченный пакет уроков завершился. Для продолжения занятий переведите пожалуйста оплату за следующий абонемент (${totalAmount}). Спасибо!`
        : `Ассалому алейкум, ${student.name}! У нас остался 1 заключительный урок по текущему абонементу. Чтобы мы закрепили расписание на следующий месяц, напомните пожалуйста об оплате пакета занятий (${totalAmount}). Спасибо!`;

    navigator.clipboard.writeText(text);
    setCopiedStudentId(student.id);
    hapticNotification('success');
    setTimeout(() => setCopiedStudentId(null), 2500);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Revenue Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-gradient-to-br from-blue-600/20 to-indigo-600/10 border border-blue-500/30 p-4 rounded-2xl">
          <div className="flex items-center gap-1.5 text-blue-400 text-xs font-semibold mb-1">
            <TrendingUp className="w-4 h-4" />
            <span>Доход в этом месяце</span>
          </div>
          <div className="text-xl font-black text-slate-100 mt-1 leading-tight">
            {formatCurrency(totalMonthlyIncome)}
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            Поступило оплат: {monthlyPayments.length}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl">
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold mb-1">
            <CheckCircle2 className="w-4 h-4" />
            <span>Проведено уроков</span>
          </div>
          <div className="text-2xl font-black text-slate-100 mt-1">
            {completedLessonsThisMonth}
          </div>
          <span className="text-[10px] text-slate-400 block mt-1">
            за текущий месяц
          </span>
        </div>
      </div>

      {/* Button to Record Payment */}
      <button
        onClick={() => {
          hapticImpact('medium');
          onAddPayment();
        }}
        className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold py-3.5 px-4 rounded-2xl shadow-lg shadow-emerald-600/20 transition-all active:scale-95"
      >
        <Plus className="w-4 h-4" />
        <span>+ Внести оплату / Продлить абонемент</span>
      </button>

      {/* Section: Need Payment Reminder */}
      {packageEndingStudents.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-800/40 p-4 rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
            <AlertTriangle className="w-4 h-4" />
            <span>Пора напомнить об оплате ({packageEndingStudents.length})</span>
          </div>

          <div className="space-y-2">
            {packageEndingStudents.map((student) => {
              const remaining = student.package_remaining_lessons ?? 0;
              const isCopied = copiedStudentId === student.id;

              return (
                <div
                  key={student.id}
                  className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-2"
                >
                  <div>
                    <h4 className="text-sm font-bold text-slate-100">
                      {student.name}
                    </h4>
                    <span
                      className={`text-[11px] font-medium ${
                        remaining === 0 ? 'text-rose-400' : 'text-amber-400'
                      }`}
                    >
                      {remaining === 0
                        ? 'Абонемент закончился (0 ур.)'
                        : 'Остался 1 урок'}
                    </span>
                  </div>

                  <button
                    onClick={() => copyReminderText(student)}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 text-xs font-medium py-1.5 px-3 rounded-xl border border-slate-700 transition-all active:scale-95"
                  >
                    {isCopied ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-semibold">
                          Скопировано!
                        </span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-blue-400" />
                        <span>Напоминание</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section: Payments History */}
      <div className="space-y-2">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-1">
          История оплат
        </h3>

        {payments.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500 bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
            Платежей пока не внесено
          </div>
        ) : (
          payments.map((payment) => (
            <div
              key={payment.id}
              className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-100">
                    {payment.student_name}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>{payment.payment_date}</span>
                    <span>•</span>
                    <span>{payment.lessons_count} ур.</span>
                    {payment.payment_method && (
                      <>
                        <span>•</span>
                        <span>{payment.payment_method}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="text-sm font-bold text-emerald-400">
                  +{formatCurrency(payment.amount)}
                </span>
                {payment.notes && (
                  <span className="text-[10px] text-slate-500 block truncate max-w-[120px]">
                    {payment.notes}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
