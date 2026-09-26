'use client';

import React from 'react';
import { Settings as SettingsIcon } from 'lucide-react';

export const SettingsTab: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-gray-50 pb-24 px-4 pt-6">
      <h1 className="text-2xl font-bold text-black tracking-tight mb-4">Настройки</h1>
      <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
        <SettingsIcon className="w-10 h-10 mb-4 text-gray-400" />
        <p className="text-gray-500 font-semibold">Настройки в разработке</p>
      </div>
    </div>
  );
};
