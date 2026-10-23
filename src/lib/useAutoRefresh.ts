import { useCallback, useEffect, useRef, useState } from 'react';
import { getRefreshSeconds } from './adminTools';

/**
 * Keeps a screen in sync without anyone pressing anything. It loads once, then again every N seconds
 * (the admin chooses N in Settings), and the moment the tab comes back into view. "Refresh" does it on demand.
 * Pass a key that changes when the screen should start over (for example the client id).
 */
export function useAutoRefresh(load: () => Promise<unknown> | void, key: string = '') {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadRef.current();
      setUpdatedAt(Date.now());
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const secs = getRefreshSeconds();
    const timer = secs > 0 ? setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, secs * 1000) : undefined;
    const onVisible = () => {
      if (secs > 0 && document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, key]);

  return { updatedAt, refreshing, refresh };
}
