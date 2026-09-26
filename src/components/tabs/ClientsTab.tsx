'use client';

import React, { useState } from 'react';
import { Student } from '@/types';
import { Search, Plus, MoreHorizontal, Settings, Lock, CheckCircle2 } from 'lucide-react';

interface ClientsTabProps {
  students: Student[];
  onOpenStudent: (student: Student) => void;
  onAddStudent: () => void;
}

export const ClientsTab: React.FC<ClientsTabProps> = ({ students, onOpenStudent, onAddStudent }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [subTab, setSubTab] = useState<'clients' | 'groups' | 'archive'>('clients');

  const filtered = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#f9f9f9] pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-2 bg-white sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <button className="w-8 h-8 flex items-center justify-center text-black">
            <Settings className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-black tracking-tight">Клиенты</h1>
          <div className="flex gap-2">
            <button 
              onClick={onAddStudent}
              className="w-8 h-8 rounded-full bg-gray-100 text-black flex items-center justify-center transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
            <button className="w-8 h-8 rounded-full bg-gray-100 text-black flex items-center justify-center transition-colors">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="relative mb-3">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-500 font-bold" strokeWidth={3} />
          </div>
          <input
            type="text"
            className="block w-full pl-9 pr-3 py-2 bg-gray-100 border-transparent rounded-2xl text-[15px] font-semibold text-black placeholder-gray-500 focus:outline-none"
            placeholder="Поиск"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Sub Tabs */}
        <div className="flex gap-6 border-b border-gray-200">
          <button 
            onClick={() => setSubTab('clients')}
            className={`pb-2 text-[13px] font-bold ${subTab === 'clients' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500'}`}
          >
            Клиенты
          </button>
          <button 
            onClick={() => setSubTab('groups')}
            className={`pb-2 text-[13px] font-bold ${subTab === 'groups' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500'}`}
          >
            Группы
          </button>
          <button 
            onClick={() => setSubTab('archive')}
            className={`pb-2 text-[13px] font-bold ${subTab === 'archive' ? 'text-blue-500 border-b-2 border-blue-500' : 'text-gray-500'}`}
          >
            Архив
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 py-4 space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm font-bold">
            {students.length === 0 ? 'У вас пока нет клиентов' : 'Ничего не найдено'}
          </div>
        ) : (
          filtered.map(student => (
            <div
              key={student.id}
              onClick={() => onOpenStudent(student)}
              className="w-full bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
            >
              <div className="p-3 flex items-center justify-between">
                <div className="flex items-center">
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center text-black font-extrabold text-sm mr-3"
                    style={{ backgroundColor: student.color || '#3B82F6' }}
                  >
                    {student.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="text-[17px] font-extrabold text-black leading-tight">{student.name}</h3>
                    <div className="text-[11px] font-bold text-gray-500 mt-0.5">
                      {Math.floor(student.price_per_lesson / 1000)}к · Стоимость
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={(e) => { e.stopPropagation(); onOpenStudent(student); }}
                  className="px-3 py-1.5 bg-[#eef5ff] text-blue-600 rounded-lg text-xs font-bold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" strokeWidth={3} />
                  Пополнить
                </button>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-3 border-t border-gray-200 h-16">
                <div className="flex flex-col items-center justify-center bg-[#f0f0f0] border-r border-gray-200">
                  <Lock className="w-3.5 h-3.5 text-gray-400 mb-1" />
                  <span className="text-gray-400 font-extrabold text-[13px] leading-none">—</span>
                  <span className="text-[9px] font-bold text-gray-400 mt-1">Баланс</span>
                </div>
                <div className="flex flex-col items-center justify-center bg-[#f0f0f0] border-r border-gray-200">
                  <Lock className="w-3.5 h-3.5 text-gray-400 mb-1" />
                  <span className="text-gray-400 font-extrabold text-[13px] leading-none">—</span>
                  <span className="text-[9px] font-bold text-gray-400 mt-1">Оплаты</span>
                </div>
                <div className="flex flex-col items-center justify-center bg-[#e8f7e8]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 mb-1" />
                  <span className="text-black font-extrabold text-[13px] leading-none">{student.prepaid_balance > 0 ? student.prepaid_balance : 0}</span>
                  <span className="text-[9px] font-bold text-green-600 mt-1">Занятия</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
