'use client';

import React, { useState } from 'react';
import { X, Database, CheckCircle2, Copy, Sparkles, Server } from 'lucide-react';
import { hapticImpact, hapticNotification } from '@/lib/telegram';

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  isCloudConnected: boolean;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
  isCloudConnected,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const copySqlInstruction = () => {
    const text = `-- Запустите файл supabase-schema.sql в вашем Supabase SQL Editor`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    hapticNotification('success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            <span>Статус базы данных</span>
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

        <div className="p-3.5 rounded-xl border bg-slate-950/80 border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-3 h-3 rounded-full ${
                isCloudConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <div>
              <div className="font-bold text-slate-200">
                {isCloudConnected ? 'Supabase подключен' : 'Локальный режим (Демо / LocalStorage)'}
              </div>
              <div className="text-[11px] text-slate-400">
                {isCloudConnected
                  ? 'Данные синхронизируются в реальном времени в облаке'
                  : 'Все данные сохраняются прямо на вашем устройстве'}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
          <h4 className="font-semibold text-slate-200 flex items-center gap-1.5">
            <Server className="w-3.5 h-3.5 text-blue-400" />
            <span>Как подключить свой Supabase (1 раз):</span>
          </h4>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-400 leading-relaxed pl-1">
            <li>В вашем аккаунте Supabase нажмите <b>New Project</b> (например, `tutor-crm`).</li>
            <li>Откройте раздел <b>SQL Editor</b> в Supabase и запустите готовый скрипт из файла <code className="text-blue-300">supabase-schema.sql</code>.</li>
            <li>В файле <code className="text-blue-300">.env.local</code> укажите ваш <code className="text-slate-300">NEXT_PUBLIC_SUPABASE_URL</code> и <code className="text-slate-300">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.</li>
          </ol>
        </div>

        <button
          onClick={onClose}
          className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold py-2.5 rounded-xl transition-all active:scale-95"
        >
          Понятно, продолжить
        </button>
      </div>
    </div>
  );
};
