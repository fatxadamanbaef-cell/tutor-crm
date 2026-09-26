'use client';

import React from 'react';
import { Student } from '@/types';
import { StudentRow } from './StudentRow';
import { Users, UserPlus } from 'lucide-react';
import { hapticImpact } from '@/lib/telegram';

interface StudentsSectionProps {
  students: Student[];
  onSelectStudent: (student: Student) => void;
  onAddStudent: () => void;
}

export const StudentsSection: React.FC<StudentsSectionProps> = ({
  students,
  onSelectStudent,
  onAddStudent,
}) => {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-indigo-400" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Мои ученики ({students.length})
          </h2>
        </div>

        <button
          onClick={() => {
            hapticImpact('light');
            onAddStudent();
          }}
          className="flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 active:scale-95 transition-all bg-indigo-500/10 border border-indigo-500/20 px-2 py-1 rounded-lg"
        >
          <UserPlus className="w-3 h-3" />
          <span>Ученик</span>
        </button>
      </div>

      <div className="space-y-2">
        {students.map((student) => (
          <StudentRow
            key={student.id}
            student={student}
            onClick={onSelectStudent}
          />
        ))}
      </div>
    </section>
  );
};
