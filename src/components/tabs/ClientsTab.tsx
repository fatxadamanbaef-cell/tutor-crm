'use client';

import React, { useState } from 'react';
import { Student } from '@/types';
import { Search, Plus, UserCheck, AlertCircle, Calendar } from 'lucide-react';
import { hapticImpact } from '@/lib/telegram';

interface ClientsTabProps {
  students: Student[];
  onOpenStudent: (student: Student) => void;
  onAddStudent: () => void;
}

export const ClientsTab: React.FC<ClientsTabProps> = ({ students, onOpenStudent, onAddStudent }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#f2f2f7] pb-28">
      {/* Header */}
      <div className="px-4 pt-5 pb-3 bg-white border-b border-gray-200/80 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">Ученики</h1>
            <p className="text-xs text-gray-500 font-semibold mt-0.5">Всего: {students.length} учеников</p>
          </div>
          <button 
            onClick={() => { hapticImpact('light'); onAddStudent(); }}
            className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20 active:scale-90 transition-transform"
          >
            <Plus className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
        
        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-3 py-2 bg-gray-100 border-transparent rounded-xl text-xs font-semibold text-gray-900 placeholder-gray-400 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-blue-500"
            placeholder="Поиск по имени ученика"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Students List */}
      <div className="flex-1 px-4 py-4 space-y-3 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-xs font-semibold">
            {students.length === 0 ? 'У вас пока нет учеников. Добавьте первого!' : 'Ученик не найден'}
          </div>
        ) : (
          filtered.map(student => {
            const target = student.monthly_target_lessons || 12;
            const conducted = student.conducted_this_month || 0;
            const missed = student.missed_this_month || 0;

            return (
              <div
                key={student.id}
                onClick={() => { hapticImpact('light'); onOpenStudent(student); }}
                className="w-full bg-white rounded-2xl p-3.5 shadow-xs border border-gray-200/70 overflow-hidden cursor-pointer active:scale-[0.98] transition-all hover:border-blue-300"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm shadow-xs"
                      style={{ backgroundColor: student.color || '#3B82F6' }}
                    >
                      {student.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-gray-900 leading-tight">{student.name}</h3>
                      <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5 font-medium">
                        <Calendar className="w-3 h-3 text-gray-400" />
                        <span>Оплата: <b>{student.billing_day || '10 число'}</b></span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
                      {conducted}/{target} ур.
                    </span>
                  </div>
                </div>

                {/* Progress / Status Bar */}
                <div className="grid grid-cols-3 gap-2 pt-2.5 border-t border-gray-100 text-center">
                  <div className="bg-gray-50 py-1.5 px-2 rounded-xl">
                    <span className="text-[10px] font-bold text-gray-400 block uppercase">Норма</span>
                    <span className="text-xs font-black text-gray-800">{target} ур.</span>
                  </div>
                  <div className="bg-green-50 py-1.5 px-2 rounded-xl">
                    <span className="text-[10px] font-bold text-green-700 block uppercase">Проведено</span>
                    <span className="text-xs font-black text-green-700">{conducted} ✅</span>
                  </div>
                  <div className="bg-red-50 py-1.5 px-2 rounded-xl">
                    <span className="text-[10px] font-bold text-red-700 block uppercase">Пропуски</span>
                    <span className="text-xs font-black text-red-700">{missed} ❌</span>
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
