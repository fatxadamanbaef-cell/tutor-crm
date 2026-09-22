'use client';

import React from 'react';
import { Calendar, Users, RefreshCw, DollarSign } from 'lucide-react';
import { hapticSelection } from '@/lib/telegram';

export type TabType = 'schedule' | 'students' | 'makeups' | 'finances';

interface BottomNavProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  pendingMakeupsCount: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  setActiveTab,
  pendingMakeupsCount,
}) => {
  const tabs = [
    { id: 'schedule' as TabType, label: 'Расписание', icon: Calendar },
    { id: 'students' as TabType, label: 'Ученики', icon: Users },
    {
      id: 'makeups' as TabType,
      label: 'Отработки',
      icon: RefreshCw,
      badge: pendingMakeupsCount > 0 ? pendingMakeupsCount : null,
    },
    { id: 'finances' as TabType, label: 'Финансы', icon: DollarSign },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/90 backdrop-blur-md border-t border-slate-800/80 px-2 py-2 pb-safe">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                hapticSelection();
                setActiveTab(tab.id);
              }}
              className={`relative flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl transition-all duration-200 active:scale-95 ${
                isActive
                  ? 'text-blue-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 ${
                    isActive ? 'scale-110 text-blue-400' : ''
                  }`}
                />
                {tab.badge && (
                  <span className="absolute -top-1.5 -right-2.5 bg-amber-500 text-slate-950 text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[16px] text-center shadow-md animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-1 tracking-tight">{tab.label}</span>
              {isActive && (
                <span className="absolute bottom-0 w-8 h-1 bg-blue-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
