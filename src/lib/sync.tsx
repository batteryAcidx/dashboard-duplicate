import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getRefreshSeconds } from './preferences';

/**
 * ONE place keeps every admin screen in step.
 * Each screen registers how to reload itself. The sync runs on a timer, the moment you come back to the tab,
 * and when you press the single "Sync" button in the header. No screen has its own refresh control.
 */
interface SyncApi {
  register: (id: string, load: () => Promise<unknown> | void) => () => void;
  syncAll: () => Promise<void>;
  markSynced: () => void;
  lastSyncAt: number | null;
  syncing: boolean;
}

const SyncContext = createContext<SyncApi | null>(null);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const loaders = useRef(new Map<string, () => Promise<unknown> | void>());
  const running = useRef(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  const register = useCallback((id: string, load: () => Promise<unknown> | void) => {
    loaders.current.set(id, load);
    return () => {
      loaders.current.delete(id);
    };
  }, []);

  const markSynced = useCallback(() => setLastSyncAt((t) => t ?? Date.now()), []);

  const syncAll = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setSyncing(true);
    try {
      await Promise.all([...loaders.current.values()].map((fn) => Promise.resolve().then(fn).catch(() => undefined)));
      setLastSyncAt(Date.now());
    } finally {
      running.current = false;
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const secs = getRefreshSeconds();
    const timer = secs > 0 ? setInterval(() => { if (document.visibilityState === 'visible') syncAll(); }, secs * 1000) : undefined;
    const onVisible = () => {
      if (secs > 0 && document.visibilityState === 'visible') syncAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [syncAll]);

  const value = useMemo(() => ({ register, syncAll, markSynced, lastSyncAt, syncing }), [register, syncAll, markSynced, lastSyncAt, syncing]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
};

export function useSync(): SyncApi | null {
  return useContext(SyncContext);
}

/** Loads a screen once, then lets the main sync keep it fresh. Pass a key that changes when the screen should start over. */
export function useSynced(load: () => Promise<unknown> | void, key: string = ''): void {
  const sync = useContext(SyncContext);
  const loadRef = useRef(load);
  loadRef.current = load;
  const id = useRef(Math.random().toString(36).slice(2));

  useEffect(() => {
    const run = () => loadRef.current();
    Promise.resolve(run()).finally(() => sync?.markSynced());
    return sync ? sync.register(`${id.current}:${key}`, run) : undefined;
  }, [sync, key]);
}
