'use client';

import React, { useState } from 'react';
import { Student } from '@/types';
import { Search, Plus } from 'lucide-react';
import { formatUZS } from '@/lib/formatters';

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
    <div className="flex flex-col h-full bg-gray-50 pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-2 bg-white sticky top-0 z-10 border-b border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-black tracking-tight">Клиенты</h1>
          <button 
            onClick={onAddStudent}
            className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center active:bg-blue-100 transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>
        
        {/* Search Bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-3 py-2 bg-gray-100 border-transparent rounded-xl text-sm placeholder-gray-500 focus:border-blue-500 focus:bg-white focus:ring-0 transition-colors"
            placeholder="Поиск клиентов..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 px-4 py-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            {students.length === 0 ? 'У вас пока нет клиентов' : 'Ничего не найдено'}
          </div>
        ) : (
          filtered.map(student => (
            <button
              key={student.id}
              onClick={() => onOpenStudent(student)}
              className="w-full flex items-center p-3 bg-white rounded-2xl shadow-sm border border-gray-100 active:scale-[0.98] transition-transform text-left"
            >
              {/* Avatar */}
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg mr-3 shadow-inner"
                style={{ backgroundColor: student.color || '#3B82F6' }}
              >
                {student.name.charAt(0).toUpperCase()}
              </div>
              
              {/* Info */}
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-gray-900 truncate">{student.name}</h3>
                <div className="text-xs text-gray-500 mt-0.5">
                  {formatUZS(student.price_per_lesson)} / урок
                </div>
              </div>
              
              {/* Balance Badge */}
              <div className="flex flex-col items-end justify-center ml-2">
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                  student.prepaid_balance <= 1 
                    ? 'bg-red-50 text-red-600'
                    : 'bg-green-50 text-green-600'
                }`}>
                  {student.prepaid_balance} ур.
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};
