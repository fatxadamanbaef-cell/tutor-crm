'use client';

import React, { useState } from 'react';
import { Student } from '@/types';
import {
  Search,
  UserPlus,
  Phone,
  Send,
  CreditCard,
  CalendarPlus,
  AlertTriangle,
  Edit2,
  Trash2,
  CheckCircle2,
  Sparkles,
  FileText,
} from 'lucide-react';
import { hapticImpact, hapticSelection, hapticNotification } from '@/lib/telegram';
import { formatCurrency } from '@/lib/formatters';

interface StudentsViewProps {
  students: Student[];
  onAddStudent: () => void;
  onEditStudent: (student: Student) => void;
  onDeleteStudent: (studentId: string) => void;
  onAddPaymentForStudent: (student: Student) => void;
  onScheduleLessonForStudent: (student: Student) => void;
  onConductLessonForStudent: (student: Student) => void;
  onAutoScheduleForStudent: (student: Student) => void;
  onOpenReportForStudent: (student: Student) => void;
}

export const StudentsView: React.FC<StudentsViewProps> = ({
  students,
  onAddStudent,
  onEditStudent,
  onDeleteStudent,
  onAddPaymentForStudent,
  onScheduleLessonForStudent,
  onConductLessonForStudent,
  onAutoScheduleForStudent,
  onOpenReportForStudent,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'package' | 'per_lesson' | 'ending'>('all');

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.telegram && s.telegram.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.phone && s.phone.includes(searchQuery));

    if (!matchesSearch) return false;

    if (activeFilter === 'package') return s.payment_type === 'package';
    if (activeFilter === 'per_lesson') return s.payment_type === 'per_lesson';
    if (activeFilter === 'ending') {
      return s.payment_type === 'package' && (s.package_remaining_lessons ?? 0) <= 1;
    }
    return true;
  });

  return (
    <div className="space-y-4 pb-24">
      {/* Header & Add student bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по имени, телефону..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        <button
          onClick={() => {
            hapticImpact('medium');
            onAddStudent();
          }}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-md transition-all active:scale-95 shrink-0"
        >
          <UserPlus className="w-4 h-4" />
          <span>+ Ученик</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
        {[
          { id: 'all', label: `Все (${students.length})` },
          {
            id: 'ending',
            label: '⚠️ Скоро оплата',
            highlight: students.filter(
              (s) => s.payment_type === 'package' && (s.package_remaining_lessons ?? 0) <= 1
            ).length > 0,
          },
          { id: 'package', label: 'Абонементы' },
          { id: 'per_lesson', label: 'Поурочно' },
        ].map((filter) => (
          <button
            key={filter.id}
            onClick={() => {
              hapticSelection();
              setActiveFilter(filter.id as any);
            }}
            className={`text-xs px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all ${
              activeFilter === filter.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Students List */}
      <div className="space-y-3">
        {filteredStudents.length === 0 ? (
          <div className="text-center py-12 px-4 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
            <p className="text-xs text-slate-400">Учеников не найдено.</p>
          </div>
        ) : (
          filteredStudents.map((student) => {
            const isPackage = student.payment_type === 'package';
            const remaining = student.package_remaining_lessons ?? 0;
            const total = student.package_total_lessons || 8;
            const percent = isPackage ? Math.min(100, Math.max(0, (remaining / total) * 100)) : 0;
            const isWarning = isPackage && remaining <= 1;

            return (
              <div
                key={student.id}
                className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-sm relative overflow-hidden"
              >
                {/* Top side student color indicator */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1.5"
                  style={{ backgroundColor: student.color || '#3B82F6' }}
                />

                <div className="pl-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-md"
                        style={{ backgroundColor: student.color || '#3B82F6' }}
                      >
                        {student.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>

                      <div>
                        <h3 className="text-base font-bold text-slate-100 leading-snug">
                          {student.name}
                        </h3>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                          {student.telegram && (
                            <a
                              href={`https://t.me/${student.telegram.replace('@', '')}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-blue-400 hover:underline flex items-center gap-0.5"
                            >
                              <Send className="w-3 h-3" />
                              <span>{student.telegram}</span>
                            </a>
                          )}
                          {student.phone && (
                            <span className="flex items-center gap-0.5 text-slate-400">
                              <Phone className="w-3 h-3 text-slate-500" />
                              <span>{student.phone}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-100">
                        {formatCurrency(student.price_per_lesson)}
                      </span>
                      <span className="text-[10px] text-slate-400 block">за урок</span>
                    </div>
                  </div>

                  {/* Package progress bar or Per-lesson badge */}
                  <div className="mt-3 bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/60">
                    {isPackage ? (
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-slate-400 font-medium flex items-center gap-1">
                            {isWarning && (
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                            )}
                            Остаток уроков:
                          </span>
                          <span
                            className={`font-bold ${
                              remaining === 0
                                ? 'text-rose-400'
                                : remaining === 1
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {remaining} из {total} ур.
                          </span>
                        </div>
                        <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              remaining === 0
                                ? 'bg-rose-500'
                                : remaining === 1
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Тип оплаты:</span>
                        <span className="font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                          Поурочно (после каждого урока)
                        </span>
                      </div>
                    )}

                    {student.notes && (
                      <p className="text-[11px] text-slate-400 mt-2 border-t border-slate-800/60 pt-1.5 italic">
                        {student.notes}
                      </p>
                    )}
                  </div>

                  {/* Actions footer */}
                  <div className="mt-3 flex items-center justify-between gap-1.5 pt-2 border-t border-slate-800/60 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-1 flex-wrap">
                      <button
                        onClick={() => {
                          hapticImpact('medium');
                          onConductLessonForStudent(student);
                        }}
                        className="flex items-center justify-center gap-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold py-1.5 px-2.5 rounded-xl transition-all active:scale-95"
                        title="Списать проведенный урок"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Проведен</span>
                      </button>

                      <button
                        onClick={() => {
                          hapticImpact('medium');
                          onAutoScheduleForStudent(student);
                        }}
                        className="flex items-center justify-center gap-1 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold py-1.5 px-2.5 rounded-xl transition-all active:scale-95"
                        title="Составить повторяющееся расписание"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Расписание</span>
                      </button>

                      <button
                        onClick={() => {
                          hapticImpact('medium');
                          onOpenReportForStudent(student);
                        }}
                        className="flex items-center justify-center gap-1 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-semibold py-1.5 px-2.5 rounded-xl transition-all active:scale-95"
                        title="Отчет для родителей"
                      >
                        <FileText className="w-3.5 h-3.5 text-amber-400" />
                        <span>Отчет</span>
                      </button>

                      <button
                        onClick={() => {
                          hapticImpact('medium');
                          onAddPaymentForStudent(student);
                        }}
                        className="flex items-center justify-center gap-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/30 text-xs font-semibold py-1.5 px-2.5 rounded-xl transition-all active:scale-95"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>+ Оплата</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          hapticImpact('light');
                          onEditStudent(student);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        title="Редактировать"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          hapticNotification('warning');
                          onDeleteStudent(student.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10"
                        title="Удалить"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
