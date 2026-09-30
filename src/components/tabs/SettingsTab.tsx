'use client';

import React from 'react';
import { Settings as SettingsIcon, Bell, Globe, Moon, Info, ExternalLink } from 'lucide-react';

export const SettingsTab: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-[#f2f2f7] pb-24">
      <div className="px-4 pt-6 pb-4 bg-white border-b border-gray-200">
        <h1 className="text-2xl font-bold text-black tracking-tight">Настройки</h1>
      </div>
      
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Bell className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-[15px] font-medium text-black">Уведомления</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
          </div>
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <Globe className="w-4 h-4 text-purple-600" />
              </div>
              <span className="text-[15px] font-medium text-black">Язык</span>
            </div>
            <span className="text-sm text-gray-500 font-medium">Русский</span>
          </div>
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center">
                <Moon className="w-4 h-4 text-gray-600" />
              </div>
              <span className="text-[15px] font-medium text-black">Тёмная тема</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" />
              <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-blue-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
                <Info className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <span className="text-[15px] font-medium text-black block">Версия</span>
                <span className="text-xs text-gray-400">Tutor Tracker MVP</span>
              </div>
            </div>
            <span className="text-sm text-gray-500 font-medium">1.0.0</span>
          </div>
          <a href="https://t.me/farxad_dev" target="_blank" rel="noopener noreferrer" className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <ExternalLink className="w-4 h-4 text-blue-600" />
              </div>
              <span className="text-[15px] font-medium text-black">Поддержка</span>
            </div>
            <span className="text-sm text-gray-500 font-medium">Telegram →</span>
          </a>
        </div>
      </div>
    </div>
  );
};
