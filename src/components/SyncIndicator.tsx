import React, { useEffect, useState } from 'react';
import { useSync } from '../lib/sync';
import { relativeTime } from '../domain/index';

/** The one place that shows everything is in step, and the one Sync button. */
export const SyncIndicator: React.FC = () => {
  const sync = useSync();
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 10000);
    return () => clearInterval(t);
  }, []);
  if (!sync) return null;
  const busy = sync.syncing;
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
