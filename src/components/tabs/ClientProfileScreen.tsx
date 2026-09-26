'use client';

import React, { useState } from 'react';
import { Student, Lesson } from '@/types';
import { X, Check, Lock, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
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
}

export const ClientProfileScreen: React.FC<ClientProfileScreenProps> = ({
  student,
  lessons,
  onBack,
  onAddPayment,
  onDeleteStudent,
  onUpdateColor
}) => {
  const [activeTab, setActiveTab] = useState<'info' | 'subscription' | 'payments' | 'lessons'>('info');
  const [studentName, setStudentName] = useState(student.name);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const studentLessons = lessons
    .filter(l => l.student_id === student.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const PRESET_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', 
    '#8B5CF6', '#EC4899', '#06B6D4', '#14B8A6'
  ];

  return (
    <div className="fixed inset-0 z-50 bg-[#f9f9f9] flex flex-col animate-in slide-in-from-right duration-200">
      {/* Header Buttons */}
      <div className="flex items-center justify-between px-4 pt-6 pb-2 bg-white sticky top-0 z-10">
        <button onClick={() => { hapticImpact('light'); onBack(); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-red-50 text-red-500">
          <X className="w-5 h-5" />
        </button>
        <button onClick={() => { hapticNotification('success'); onBack(); }} className="w-8 h-8 flex items-center justify-center rounded-full bg-blue-50 text-blue-500">
          <Check className="w-5 h-5" strokeWidth={3} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-white px-4 pb-3 border-b border-gray-200 gap-4 overflow-x-auto no-scrollbar">
        {[
          { id: 'info', label: 'Информация' },
          { id: 'subscription', label: 'Абонемент' },
          { id: 'payments', label: 'Оплаты' },
          { id: 'lessons', label: 'Занятия' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { hapticImpact('light'); setActiveTab(tab.id as any); }}
            className={`whitespace-nowrap text-[13px] font-bold px-3 py-1.5 rounded-xl transition-colors ${
              activeTab === tab.id ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500 bg-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'info' && (
          <div className="p-4 space-y-4">
            {/* Name Input */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100">
              <input
                type="text"
                value={studentName}
                onChange={e => setStudentName(e.target.value)}
                className="w-full text-xl font-bold text-black focus:outline-none"
              />
            </div>

            {/* Main Info */}
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-black font-semibold text-[15px]">Цвет</span>
                <button 
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="w-7 h-7 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.1)] flex items-center justify-center"
                  style={{ backgroundColor: student.color || '#3B82F6' }}
                >
                </button>
              </div>

              {showColorPicker && (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => {
                        onUpdateColor(student.id, c);
                        setShowColorPicker(false);
                      }}
                      className="w-8 h-8 rounded-full border-2 border-transparent focus:border-black"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}

              <hr className="border-gray-100" />
              
              <div className="flex items-center justify-between">
                <span className="text-black font-semibold text-[15px]">Стоимость</span>
                <div className="bg-gray-100 px-3 py-1.5 rounded-lg font-bold text-black text-[15px]">
                  {student.price_per_lesson.toLocaleString('ru-RU').replace(',', '.')}
                </div>
              </div>
              
              <hr className="border-gray-100" />
              
              <div className="flex items-center justify-between">
                <span className="text-black font-semibold text-[15px]">Валюта</span>
                <div className="flex items-center text-gray-400">
                  <ChevronUp className="w-3.5 h-3.5" />
                  <ChevronDown className="w-3.5 h-3.5 -ml-1" />
                </div>
              </div>

              <hr className="border-gray-100" />

              <div className="flex items-center justify-between">
                <span className="text-black font-semibold text-[15px]">Остаток средств:</span>
                <Lock className="w-4 h-4 text-black" />
              </div>

              <hr className="border-gray-100" />

              <textarea
                placeholder="Комментарий"
                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:outline-none min-h-[80px]"
              />
            </div>

            {/* Additional Info */}
            <h3 className="text-black font-extrabold text-lg px-2 mt-6 mb-2">Дополнительная информация</h3>
            <div className="bg-white rounded-3xl p-4 shadow-sm border border-gray-100 space-y-4">
              <input
                type="tel"
                placeholder="Номер телефона"
                className="w-full font-semibold text-[15px] focus:outline-none placeholder-gray-300"
              />
              <hr className="border-gray-100" />
              <div className="flex items-center justify-between">
                <span className="text-black font-semibold text-[15px]">Дата рождения</span>
                <span className="text-black font-bold">--.--.--</span>
              </div>
            </div>

            {/* Archive Button */}
            <button 
              onClick={() => {
                if(confirm('Перенести в архив? (Для удаления используйте долгое нажатие)')) {
                  onDeleteStudent(student.id);
                  onBack();
                }
              }}
              className="w-full mt-4 bg-gradient-to-r from-orange-300 to-orange-400 text-white font-bold py-4 rounded-2xl flex items-center justify-between px-6 shadow-sm active:scale-95 transition-transform"
            >
              <span className="text-[15px]">Клиента в архив</span>
              <ChevronRight className="w-5 h-5 text-white/70" />
            </button>
          </div>
        )}

        {activeTab === 'subscription' && (
          <div className="h-full flex flex-col items-center justify-center p-4">
            <h2 className="text-lg font-bold text-black mt-20">Абонементы отсутствуют</h2>
            <div className="flex-1"></div>
            <button 
              onClick={() => {
                hapticImpact('medium');
                const priceStr = prompt('Сколько занятий добавить?', '8');
                if (priceStr) {
                  onAddPayment(student.id, student.price_per_lesson * Number(priceStr), Number(priceStr));
                }
              }}
              className="w-full bg-[#007AFF] hover:bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-transform mt-20"
            >
              Добавить абонемент
            </button>
          </div>
        )}

        {activeTab === 'payments' && (
          <div className="p-4 flex flex-col items-center pt-20">
             <h2 className="text-lg font-bold text-gray-500">История оплат появится здесь</h2>
          </div>
        )}

        {activeTab === 'lessons' && (
          <div className="p-4 space-y-6">
            {studentLessons.length === 0 ? (
              <div className="text-center pt-20 text-gray-400 font-bold">Нет занятий</div>
            ) : (
              studentLessons.map(lesson => {
                const date = parseISO(lesson.date);
                return (
                  <div key={lesson.id}>
                    <div className="bg-gray-100 rounded-t-xl px-4 py-2 font-bold text-black text-sm">
                      {format(date, 'd MMMM yyyy, EE', { locale: ru })}
                    </div>
                    <div className="bg-white border border-gray-100 p-4 flex items-center justify-between shadow-sm rounded-b-xl">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-extrabold text-[15px] text-black">{student.name}</h3>
                          <Lock className="w-3.5 h-3.5 text-black" />
                        </div>
                        <div className="text-gray-500 text-xs mt-1 flex items-center gap-1 font-medium">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                          {lesson.time_str}
                        </div>
                      </div>
                      <div className="bg-red-50 text-red-500 font-bold text-[11px] px-2 py-1 rounded">
                        Не оплачено
                      </div>
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
