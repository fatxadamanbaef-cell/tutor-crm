'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { UserPlus, BookOpen, Calendar, Sparkles } from 'lucide-react';
import { hapticImpact } from '@/lib/telegram';

interface EmptyStateProps {
  onAddStudent: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onAddStudent }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center py-16 px-6 text-center space-y-6"
    >
      {/* Animated icon */}
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
        className="w-20 h-20 rounded-3xl bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center shadow-2xl shadow-teal-600/30"
      >
        <Sparkles className="w-10 h-10 text-zinc-100" />
      </motion.div>

      <div className="space-y-2">
        <h2 className="text-xl font-black text-zinc-100">Добро пожаловать!</h2>
        <p className="text-sm text-zinc-400 max-w-xs">
          Это ваш личный трекер учеников. Добавьте первого ученика, чтобы начать отслеживать занятия и оплаты.
        </p>
      </div>

      {/* Features preview */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
        <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-center space-y-1">
          <Calendar className="w-5 h-5 text-teal-400 mx-auto" />
          <span className="text-[10px] font-bold text-zinc-400 block">Календарь</span>
        </div>
        <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-center space-y-1">
          <BookOpen className="w-5 h-5 text-emerald-400 mx-auto" />
          <span className="text-[10px] font-bold text-zinc-400 block">Уроки</span>
        </div>
        <div className="p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-center space-y-1">
          <span className="text-lg block">💰</span>
          <span className="text-[10px] font-bold text-zinc-400 block">Оплаты</span>
        </div>
      </div>

      {/* CTA Button */}
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => {
          hapticImpact('medium');
          onAddStudent();
        }}
        className="flex items-center gap-2 bg-gradient-to-r from-teal-600 to-teal-800 hover:from-teal-500 hover:to-teal-800 text-zinc-100 font-black text-sm px-8 py-3.5 rounded-2xl shadow-xl shadow-teal-600/25 transition-all"
      >
        <UserPlus className="w-5 h-5" />
        <span>Добавить первого ученика</span>
      </motion.button>
    </motion.div>
  );
};


