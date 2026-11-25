'use client';

import React from 'react';
import { Calendar, Users, Wallet, Settings } from 'lucide-react';
import { hapticImpact } from '@/lib/telegram';

export type TabType = 'schedule' | 'clients' | 'stats' | 'settings';

interface BottomNavProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  lowBalanceCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onChangeTab,
  lowBalanceCount = 0,
}) => {
  const tabs = [
    { id: 'schedule', label: 'Расписание', icon: Calendar },
    { id: 'clients', label: 'Ученики', icon: Users, badge: lowBalanceCount },
    { id: 'stats', label: 'Доход', icon: Wallet },
    { id: 'settings', label: 'Настройки', icon: Settings },
  ] as const;

  return (
    <nav
      aria-label="Основная навигация"
      className="fixed bottom-0 left-0 right-0 bg-white/95 border-t border-[#E7E2D8] pb-safe z-40"
    >
      <div className="flex items-center justify-around max-w-md mx-auto px-2 py-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              onClick={() => {
                if (!isActive) hapticImpact('light');
                onChangeTab(tab.id);
              }}
              className={`relative flex flex-col items-center justify-center w-20 h-10 rounded-2xl transition-colors active:scale-95 ${
                isActive
                  ? 'bg-[#EEF3FE] text-[#2F6FED]'
                  : 'text-[#8C857B] hover:text-[#44403C]'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-[19px] h-[19px] mb-0.5 transition-transform ${
                    isActive ? 'scale-105' : ''
                  }`}
                  strokeWidth={isActive ? 2.4 : 1.9}
                  aria-hidden="true"
                />
                {'badge' in tab && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-full bg-[#E85D3F] text-white text-[9px] font-bold tabular-nums flex items-center justify-center leading-none">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] tracking-tight leading-none ${
                  isActive ? 'font-semibold text-[#2F6FED]' : 'font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
