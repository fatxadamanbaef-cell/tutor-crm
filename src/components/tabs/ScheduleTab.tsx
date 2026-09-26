'use client';

import React from 'react';

export const ScheduleTab: React.FC = () => {
  return (
    <div className="flex flex-col h-full bg-gray-50 pb-24 px-4 pt-6">
      <h1 className="text-2xl font-bold text-black tracking-tight mb-4">Расписание</h1>
      <div className="flex-1 flex flex-col items-center justify-center text-center opacity-50">
        <span className="text-4xl mb-4">🗓</span>
        <p className="text-gray-500 font-semibold">Сетка расписания в разработке (Этап 2)</p>
      </div>
    </div>
  );
};
