'use client';

import React, { useState, useEffect } from 'react';
import { Student } from '@/types';
import { X, CreditCard, CheckCircle2 } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { formatCurrency } from '@/lib/formatters';
import { format } from 'date-fns';
import confetti from 'canvas-confetti';

interface AddPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: Student[];
  initialStudentId?: string;
  onSave: (payment: {
    student_id: string;
    amount: number;
    lessons_count: number;
    payment_date: string;
    payment_method: string;
    notes?: string;
  }) => void;
}

export const AddPaymentModal: React.FC<AddPaymentModalProps> = ({
  isOpen,
  onClose,
  students,
  initialStudentId,
  onSave,
}) => {
  const [studentId, setStudentId] = useState(initialStudentId || (students[0]?.id || ''));
  const [lessonsCount, setLessonsCount] = useState(12);
  const [amount, setAmount] = useState(1800000);
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [paymentMethod, setPaymentMethod] = useState('Payme / Click');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (initialStudentId) setStudentId(initialStudentId);
  }, [initialStudentId]);

  useEffect(() => {
    const student = students.find((s) => s.id === studentId);
    if (student) {
      setAmount((student.price_per_lesson || 150000) * lessonsCount);
    }
  }, [studentId, lessonsCount, students]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      alert('Пожалуйста, выберите ученика');
      return;
    }

    onSave({
      student_id: studentId,
      amount: Number(amount),
      lessons_count: Number(lessonsCount),
      payment_date: paymentDate,
      payment_method: paymentMethod,
      notes,
    });

    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.6 },
    });

    hapticNotification('success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-400" />
            <span>Внесение оплаты / Абонемент</span>
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

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          {/* Student selection */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">
              Ученик
            </label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-blue-500"
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({formatCurrency(s.price_per_lesson)}/ур.)
                </option>
              ))}
            </select>
          </div>

          {/* Quick Lessons Count Chips */}
          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">
              Количество оплачиваемых уроков
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {[1, 6, 8, 10, 12].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setLessonsCount(cnt)}
                  className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                    lessonsCount === cnt
                      ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  +{cnt} ур.
                </button>
              ))}
            </div>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                Сумма к зачислению (сум)
              </label>
              <input
                type="number"
                step="10000"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">
                Дата платежа
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">
              Способ оплаты
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {['Payme / Click', 'Uzum Bank', 'Наличные'].map((method) => (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`py-1.5 rounded-xl border text-[11px] font-medium transition-all truncate px-1 ${
                    paymentMethod === method
                      ? 'bg-blue-600/30 text-blue-300 border-blue-500'
                      : 'bg-slate-950 text-slate-400 border-slate-800'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-400 mb-1 font-medium">
              Комментарий (опционально)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Оплата абонемента за октябрь..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-emerald-600/30 transition-all active:scale-95 text-xs flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Зачислить оплату и продлить абонемент</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
