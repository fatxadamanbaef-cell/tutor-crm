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
    <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 pb-safe z-40">
      <div className="flex items-center justify-around max-w-md mx-auto px-2 py-1.5">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (!isActive) hapticImpact('light');
                onChangeTab(tab.id);
              }}
              className={`relative flex flex-col items-center justify-center w-18 h-12 rounded-2xl transition-all active:scale-95 ${
                isActive ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 mb-0.5 transition-transform ${
                    isActive ? 'scale-105' : ''
                  }`}
                  strokeWidth={isActive ? 2.5 : 2}
                />
                {'badge' in tab && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-2.5 min-w-[15px] h-[15px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold tabular-nums flex items-center justify-center leading-none">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] tracking-tight ${
                  isActive ? 'font-semibold text-blue-600' : 'font-medium'
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
