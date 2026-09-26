'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error details:', error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 gap-4 p-6 font-sans">
      <div className="text-4xl">⚠️</div>
      <h2 className="text-lg font-bold text-slate-100">Что-то пошло не так</h2>
      <div className="p-3 bg-red-950/60 border border-red-800 rounded-lg text-red-200 text-xs max-w-sm w-full font-mono overflow-auto max-h-48 break-words select-text">
        <p className="font-bold">{error?.name || 'Error'}: {error?.message || 'Unknown error'}</p>
        {error?.digest && <p className="text-[10px] text-red-400 mt-1">Digest: {error.digest}</p>}
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => {
            try {
              localStorage.clear();
              window.location.reload();
            } catch(e) {}
          }}
          className="bg-red-800 hover:bg-red-700 text-white font-medium py-2.5 px-4 rounded-xl text-xs"
        >
          🧹 Сбросить кэш и данные
        </button>
        <button
          onClick={reset}
          className="bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 px-4 rounded-xl text-xs"
        >
          🔄 Повторить
        </button>
      </div>
    </div>
  );
}
