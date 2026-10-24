import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSync } from '../lib/sync';
import { relativeTime } from '../domain/index';

/**
 * The one place that shows everything is in step, and the one Sync button.
 * compact: just an icon (it spins while syncing). The time is in its tooltip. Used where the bar is busy.
 */
export const SyncIndicator: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const sync = useSync();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);
  if (!sync) return null;
  const busy = sync.syncing;
  const status = busy ? 'Syncing…' : sync.lastSyncAt ? `Synced ${relativeTime(sync.lastSyncAt)}` : 'Syncing…';
  if (compact) {
    return (
      <button
        type="button"
        onClick={() => sync.syncAll()}
        disabled={busy}
        aria-label="Sync everything now"
        title={`${status}. Press to sync now.`}
        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200 disabled:cursor-default"
      >
        <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin text-[#ffc174]' : ''}`} aria-hidden="true" />
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => sync.syncAll()}
      disabled={busy}
      aria-label="Sync everything now"
      className="flex h-11 cursor-pointer items-center gap-2.5 rounded-xl px-3 text-[13px] text-slate-400 transition-colors hover:text-slate-200 disabled:cursor-default"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${busy ? 'animate-pulse bg-[#ffc174]' : sync.lastSyncAt ? 'bg-emerald-400' : 'bg-slate-600'}`} aria-hidden="true" />
      <span className="hidden sm:inline">{busy ? 'Syncing…' : sync.lastSyncAt ? `Synced ${relativeTime(sync.lastSyncAt)}` : 'Syncing…'}</span>
      <span className="sm:hidden">{busy ? 'Syncing' : 'Sync'}</span>
    </button>
  );
};
