'use client';

import React, { useState, useEffect } from 'react';
import { X, FileSpreadsheet, Download, Copy, Check, TrendingUp } from 'lucide-react';
import { generateMonthlyExportData } from '@/lib/reports';
import { formatUZS } from '@/lib/formatters';
import { hapticImpact, hapticNotification } from '@/lib/telegram';

interface MonthlyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MonthlyReportModal: React.FC<MonthlyReportModalProps> = ({ isOpen, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<Awaited<ReturnType<typeof generateMonthlyExportData>> | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      generateMonthlyExportData().then((res) => {
        setData(res);
        setLoading(false);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDownloadCsv = () => {
    if (!data) return;
    hapticImpact('medium');
    const blob = new Blob(['\ufeff' + data.csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tutor_report_${data.monthName.replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    hapticNotification('success');
  };

  const handleCopyText = () => {
    if (!data) return;
    hapticImpact('light');
    navigator.clipboard.writeText(data.formattedText);
    setCopied(true);
    hapticNotification('success');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 text-xs text-zinc-200 shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <h3 className="text-base font-extrabold text-zinc-100">
              Итоги месяца {data?.monthName ? `(${data.monthName})` : ''}
            </h3>
          </div>
          <button
            onClick={() => {
              hapticImpact('light');
              onClose();
            }}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-200 bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="py-8 text-center text-zinc-400">Формирование сводки...</div>
        ) : data ? (
          <div className="space-y-4">
            {/* Top Summary Banner */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl">
                <span className="text-[10px] uppercase font-bold text-zinc-400">Заработано:</span>
                <div className="text-base font-black text-emerald-400 mt-0.5">
                  {formatUZS(data.totalEarned)}
                </div>
              </div>
              <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-2xl">
                <span className="text-[10px] uppercase font-bold text-zinc-400">Проведено:</span>
                <div className="text-base font-black text-teal-400 mt-0.5">
                  {data.totalCompleted} уроков
                </div>
              </div>
            </div>

            {/* Students Breakdown Table */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-bold text-zinc-400">По ученикам:</span>
              <div className="bg-zinc-950 border border-zinc-800 rounded-2xl divide-y divide-zinc-800/60 overflow-hidden">
                {data.studentsBreakdown.map((s, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-zinc-100 text-xs">{s.name}</div>
                      <div className="text-[10px] text-zinc-400">
                        {s.completedInMonth} ур. проведенных • {formatUZS(s.price)}/ур.
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-emerald-400 text-xs">
                        {formatUZS(s.earnedUzs)}
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        остаток: {s.remaining > 0 ? `+${s.remaining}` : s.remaining} ур.
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                onClick={handleDownloadCsv}
                className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-zinc-100 font-bold text-xs shadow-lg active:scale-95 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel (.csv)</span>
              </button>

              <button
                onClick={handleCopyText}
                className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-bold text-xs border border-zinc-800 active:scale-95 transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Скопировано!' : 'Копировать'}</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};


