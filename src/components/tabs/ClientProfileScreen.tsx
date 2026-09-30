'use client';

import React, { useState, useEffect } from 'react';
import { Student, Lesson, Payment } from '@/types';
import { X, Check, ChevronRight, ChevronDown, Plus, Minus, Clock, CreditCard } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';

interface ClientProfileScreenProps {
  student: Student;
  lessons: Lesson[];
  onBack: () => void;
  onAddPayment: (studentId: string, amountUzs: number, lessonsAdded: number, paymentDate?: string) => void;
  onDeleteStudent: (studentId: string) => void;
  onUpdateBillingDay: (studentId: string, day: number) => void;
  onUpdateColor: (studentId: string, color: string) => void;
  onToggleCalendarDate: (studentId: string, dateStr: string) => void;
  onSaveStudentInfo?: (studentId: string, updates: { name?: string; phone?: string }) => void;
}

export const ClientProfileScreen: React.FC<ClientProfileScreenProps> = ({
  student,
  lessons,
  onBack,
  onAddPayment,
  onDeleteStudent,
  onUpdateColor,
  onUpdateBillingDay,
  onSaveStudentInfo,
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'subscription' | 'payments' | 'lessons'>('info');
  const [studentName, setStudentName] = useState(student.name);
  const [studentPhone, setStudentPhone] = useState(student.phone || '');
  const [showColorPicker, setShowColorPicker] = useState(false);
  
  // Subscription form state
  const [showSubForm, setShowSubForm] = useState(false);
  const [subLessons, setSubLessons] = useState(8);
  const [subPrice, setSubPrice] = useState(student.price_per_lesson);

  const studentLessons = lessons
    .filter(l => l.student_id === student.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const completedLessons = studentLessons.filter(l => l.status === 'completed');
  const missedLessons = studentLessons.filter(l => l.status === 'missed_penalty');
  const balance = student.prepaid_balance;
  const totalPackage = student.package_total_lessons || 8;

  const PRESET_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#14B8A6',
    '#F97316', '#84CC16', '#0EA5E9', '#A855F7'
  ];

  const tabs = [
    { id: 'info', label: 'Информация' },
    { id: 'subscription', label: 'Абонемент' },
    { id: 'payments', label: 'Оплаты' },
    { id: 'lessons', label: 'Занятия' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#f2f2f7] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 bg-white">
        <button 
          onClick={() => { hapticImpact('light'); onBack(); }} 
          className="w-9 h-9 flex items-center justify-center rounded-full bg-red-50 text-red-500 active:scale-90 transition-transform"
        >
          <X className="w-5 h-5" strokeWidth={2.5} />
        </button>
        <button 
          onClick={() => { 
            hapticNotification('success'); 
            // Save changes
            if (onSaveStudentInfo && (studentName !== student.name || studentPhone !== (student.phone || ''))) {
              onSaveStudentInfo(student.id, { name: studentName, phone: studentPhone });
            }
            onBack(); 
          }} 
          className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-50 text-blue-500 active:scale-90 transition-transform"
        >
          <Check className="w-5 h-5" strokeWidth={3} />
        </button>
      </div>

      {/* Tab Bar */}
      <div className="flex bg-white px-3 pb-3 gap-2 overflow-x-auto no-scrollbar border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { hapticImpact('light'); setActiveTab(tab.id as any); }}
            className={`whitespace-nowrap text-[13px] font-bold px-3.5 py-1.5 rounded-full transition-all ${
              activeTab === tab.id 
                ? 'bg-[#007AFF] text-white shadow-sm' 
                : 'text-gray-500 bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto pb-8">
        
        {/* ========== ИНФОРМАЦИЯ ========== */}
        {activeTab === 'info' && (
          <div className="p-4 space-y-4">
            {/* Name */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <input
                type="text"
                value={studentName}
                onChange={e => setStudentName(e.target.value)}
                className="w-full text-xl font-bold text-black focus:outline-none bg-transparent"
                placeholder="Имя ученика"
              />
            </div>

            {/* Settings Card */}
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
              {/* Color */}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-medium text-black">Цвет</span>
                  <button 
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="w-7 h-7 rounded-full shadow-md"
                    style={{ backgroundColor: student.color || '#3B82F6' }}
                  />
                </div>
                {showColorPicker && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100">
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => { onUpdateColor(student.id, c); setShowColorPicker(false); hapticImpact('light'); }}
                        className={`w-8 h-8 rounded-full transition-transform active:scale-90 ${student.color === c ? 'ring-2 ring-offset-2 ring-blue-500' : ''}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Price */}
              <div className="p-4 flex items-center justify-between">
                <span className="text-[15px] font-medium text-black">Стоимость</span>
                <span className="text-[15px] font-bold text-black bg-gray-100 px-3 py-1 rounded-lg">
                  {student.price_per_lesson.toLocaleString('ru-RU')}
                </span>
              </div>

              {/* Balance — REAL DATA */}
              <div className="p-4 flex items-center justify-between">
                <span className="text-[15px] font-medium text-black">Остаток уроков</span>
                <span className={`text-[15px] font-extrabold px-3 py-1 rounded-lg ${
                  balance <= 1 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
                }`}>
                  {balance}
                </span>
              </div>

              {/* Billing Day */}
              <div className="p-4 flex items-center justify-between">
                <span className="text-[15px] font-medium text-black">День оплаты</span>
                <select 
                  value={Number(student.billing_day) || 10}
                  onChange={e => { onUpdateBillingDay(student.id, Number(e.target.value)); hapticImpact('light'); }}
                  className="bg-gray-100 text-black font-bold text-[15px] rounded-lg px-3 py-1 border-0 focus:outline-none appearance-none"
                >
                  {[1, 5, 10, 15, 20, 25, 28].map(d => (
                    <option key={d} value={d}>{d}-е число</option>
                  ))}
                </select>
              </div>

              {/* Notes */}
              <div className="p-4">
                <textarea
                  placeholder="Комментарий"
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm text-black focus:outline-none focus:border-blue-400 min-h-[70px] resize-none"
                />
              </div>
            </div>

            {/* Additional Info */}
            <h3 className="text-black font-extrabold text-base px-1 pt-2">Дополнительная информация</h3>
            <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
              <div className="p-4">
                <input
                  type="tel"
                  value={studentPhone}
                  onChange={e => setStudentPhone(e.target.value)}
                  placeholder="Номер телефона"
                  className="w-full text-[15px] font-medium text-black focus:outline-none bg-transparent placeholder-gray-400"
                />
              </div>
              <div className="p-4 flex items-center justify-between">
                <span className="text-[15px] font-medium text-black">Telegram</span>
                <span className="text-[15px] text-blue-500 font-medium">{student.telegram || '—'}</span>
              </div>
            </div>

            {/* Delete Student */}
            <button 
              onClick={() => {
                if (confirm('Точно удалить ученика и все его занятия?')) {
                  onDeleteStudent(student.id);
                  onBack();
                }
              }}
              className="w-full bg-gradient-to-r from-red-500 to-red-600 text-white font-bold py-4 rounded-2xl flex items-center justify-between px-5 active:scale-[0.97] transition-transform mt-2 shadow-sm shadow-red-500/20"
            >
              <span>Удалить ученика</span>
              <ChevronRight className="w-5 h-5 text-white/60" />
            </button>
          </div>
        )}

        {/* ========== АБОНЕМЕНТ ========== */}
        {activeTab === 'subscription' && (
          <div className="p-4 space-y-4">
            {/* Current subscription info */}
            {balance > 0 ? (
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-bold text-black">Текущий абонемент</h3>
                  <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">Активен</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-black text-black">{balance}</div>
                    <div className="text-[10px] font-bold text-gray-500 mt-1">Осталось</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-black text-green-600">{completedLessons.length}</div>
                    <div className="text-[10px] font-bold text-gray-500 mt-1">Проведено</div>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <div className="text-2xl font-black text-red-500">{missedLessons.length}</div>
                    <div className="text-[10px] font-bold text-gray-500 mt-1">Пропуски</div>
                  </div>
                </div>
                <div className="mt-4 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                  <div 
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((totalPackage - balance) / totalPackage) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] font-bold text-gray-400">
                  <span>Использовано: {totalPackage - balance}</span>
                  <span>Всего: {totalPackage}</span>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                <div className="text-4xl mb-3">📋</div>
                <h3 className="text-lg font-bold text-black mb-1">Абонементы отсутствуют</h3>
                <p className="text-sm text-gray-500">Добавьте абонемент, чтобы отслеживать занятия</p>
              </div>
            )}

            {/* Add subscription form */}
            {!showSubForm ? (
              <button
                onClick={() => { setShowSubForm(true); hapticImpact('medium'); }}
                className="w-full bg-[#007AFF] text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.97] transition-transform shadow-lg shadow-blue-500/20"
              >
                <Plus className="w-5 h-5" />
                Добавить абонемент
              </button>
            ) : (
              <div className="bg-white rounded-2xl shadow-sm p-5 space-y-5">
                <h3 className="text-[15px] font-bold text-black">Новый абонемент</h3>
                
                {/* Lessons count */}
                <div>
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Количество уроков</label>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => { if (subLessons > 1) setSubLessons(subLessons - 1); hapticImpact('light'); }}
                      className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-black active:bg-gray-200 transition-colors"
                    >
                      <Minus className="w-5 h-5" />
                    </button>
                    <div className="flex-1 text-center">
                      <span className="text-3xl font-black text-black">{subLessons}</span>
                      <span className="text-sm text-gray-400 ml-1">уроков</span>
                    </div>
                    <button 
                      onClick={() => { setSubLessons(subLessons + 1); hapticImpact('light'); }}
                      className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center text-black active:bg-gray-200 transition-colors"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>
                  {/* Quick select */}
                  <div className="flex gap-2 mt-3">
                    {[4, 8, 12, 16].map(n => (
                      <button 
                        key={n}
                        onClick={() => { setSubLessons(n); hapticImpact('light'); }}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold transition-colors ${
                          subLessons === n 
                            ? 'bg-blue-500 text-white' 
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Total */}
                <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-600">Итого к оплате</span>
                  <span className="text-xl font-black text-black">
                    {(subLessons * subPrice).toLocaleString('ru-RU')} сум
                  </span>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSubForm(false)}
                    className="flex-1 py-3.5 rounded-xl bg-gray-100 text-gray-700 font-bold active:scale-95 transition-transform"
                  >
                    Отмена
                  </button>
                  <button
                    onClick={() => {
                      hapticNotification('success');
                      onAddPayment(student.id, subLessons * subPrice, subLessons);
                      setShowSubForm(false);
                    }}
                    className="flex-1 py-3.5 rounded-xl bg-[#007AFF] text-white font-bold active:scale-95 transition-transform shadow-md shadow-blue-500/20"
                  >
                    Оплатить
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========== ОПЛАТЫ ========== */}
        {activeTab === 'payments' && (
          <div className="p-4 space-y-4">
            {/* Quick summary */}
            <div className="bg-white rounded-2xl shadow-sm p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-black">Баланс уроков</div>
                  <div className={`text-2xl font-black ${balance > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {balance > 0 ? balance : `Долг: ${Math.abs(balance)}`}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  hapticImpact('medium');
                  setActiveTab('subscription');
                }}
                className="w-full py-3 rounded-xl bg-green-50 text-green-700 font-bold text-sm active:bg-green-100 transition-colors"
              >
                + Пополнить баланс
              </button>
            </div>

            {/* Payment history placeholder — real data will show when payments exist */}
            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
              <div className="text-4xl mb-3">💳</div>
              <h3 className="text-base font-bold text-black mb-1">История оплат</h3>
              <p className="text-sm text-gray-500">
                Пополните абонемент, и записи оплат появятся здесь
              </p>
            </div>
          </div>
        )}

        {/* ========== ЗАНЯТИЯ ========== */}
        {activeTab === 'lessons' && (
          <div className="p-4 space-y-3">
            {studentLessons.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
                <div className="text-4xl mb-3">📚</div>
                <h3 className="text-base font-bold text-black mb-1">Нет занятий</h3>
                <p className="text-sm text-gray-500">Добавьте урок в расписании</p>
              </div>
            ) : (
              studentLessons.map(lesson => {
                const date = parseISO(lesson.date);
                const isPaid = lesson.status === 'completed';
                const isMissed = lesson.status === 'missed_penalty';
                const isPlanned = lesson.status === 'planned';
                
                return (
                  <div key={lesson.id} className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 text-sm font-bold text-black border-b border-gray-100">
                      {format(date, 'd MMMM yyyy, EE', { locale: ru })}
                    </div>
                    <div className="p-4 flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-[15px] text-black">{student.name}</h3>
                        <div className="text-gray-500 text-xs mt-1 flex items-center gap-1.5 font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          {lesson.time_str || '—'}
                        </div>
                      </div>
                      <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${
                        isPaid 
                          ? 'bg-green-50 text-green-600'
                          : isMissed 
                            ? 'bg-orange-50 text-orange-600' 
                            : 'bg-blue-50 text-blue-500'
                      }`}>
                        {isPaid ? 'Проведён' : isMissed ? 'Пропуск' : 'Запланирован'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
