import React, { useEffect, useState } from 'react';
import { relativeTime } from '../lib/adminTools';

/** "Updated 12s ago" with a small Refresh link. Tells you the screen is live without making noise. */
export const Updated: React.FC<{ at: number | null; refreshing?: boolean; onRefresh?: () => void }> = ({ at, refreshing, onRefresh }) => {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-3 text-[13px] text-slate-500">
      <span className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${refreshing ? 'animate-pulse bg-[#ffc174]' : 'bg-slate-600'}`} aria-hidden="true" />
        {at ? `Updated ${relativeTime(at)}` : 'Loading…'}
      </span>
      {onRefresh && (
        <button type="button" onClick={onRefresh} disabled={refreshing} className="cursor-pointer text-slate-400 transition-colors hover:text-[#ffc174] disabled:opacity-50">
          Refresh
        </button>
      )}
    </div>
  );
};
