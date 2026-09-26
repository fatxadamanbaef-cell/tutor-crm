'use client';

import React from 'react';
import { Calendar, Users, BarChart3, Settings } from 'lucide-react';
import { hapticImpact } from '@/lib/telegram';

export type TabType = 'schedule' | 'clients' | 'stats' | 'settings';

interface BottomNavProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onChangeTab }) => {
  const tabs = [
    { id: 'schedule', label: 'Расписание', icon: Calendar },
    { id: 'clients', label: 'Клиенты', icon: Users },
    { id: 'stats', label: 'Статистика', icon: BarChart3 },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ] as const;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-xl border-t border-gray-200 pb-safe z-40">
      <div className="flex items-center justify-around max-w-md mx-auto px-2 py-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (!isActive) hapticImpact('light');
                onChangeTab(tab.id);
              }}
              className={`flex flex-col items-center justify-center w-16 h-12 transition-colors ${
                isActive ? 'text-blue-500' : 'text-gray-400 hover:text-gray-500'
              }`}
            >
              <Icon className={`w-6 h-6 mb-1 ${isActive ? 'fill-blue-500/10' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-semibold tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
