import React, { useEffect, useRef, useState } from 'react';
import { RotateCw } from 'lucide-react';

const THRESHOLD = 64;
const MAX_PULL = 110;

export interface PullState {
  distance: number;
  status: 'idle' | 'pulling' | 'ready' | 'refreshing';
}

export function usePullToRefresh(onRefresh: () => Promise<unknown>): PullState {
  const [state, setState] = useState<PullState>({ distance: 0, status: 'idle' });
  const startY = useRef<number | null>(null);
  const distance = useRef(0);
  const busy = useRef(false);
  const refreshRef = useRef(onRefresh);
  refreshRef.current = onRefresh;

  useEffect(() => {
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

    const onStart = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1) return;
      const target = e.target as Element | null;
      if (target?.closest('input, textarea, select, [role="menu"], [data-no-pull]')) {
        startY.current = null;
        return;
      }
      startY.current = atTop() ? e.touches[0].clientY : null;
      distance.current = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (startY.current === null || busy.current) return;
      const y = e.touches[0].clientY;
      const dy = y - startY.current;
      if (dy <= 0 || !atTop()) {
        // scrolling the page, not pulling: start measuring again from here
        startY.current = y;
        distance.current = 0;
        setState((s) => (s.status === 'idle' ? s : { distance: 0, status: 'idle' }));
        return;
      }
      if (e.cancelable) e.preventDefault();
      const d = Math.min(MAX_PULL, dy * 0.5);
      distance.current = d;
      setState({ distance: d, status: d >= THRESHOLD ? 'ready' : 'pulling' });
    };

    const onEnd = async () => {
      if (startY.current === null) return;
      startY.current = null;
      if (busy.current) return;
      if (distance.current >= THRESHOLD) {
        busy.current = true;
        setState({ distance: THRESHOLD, status: 'refreshing' });
        try {
          await refreshRef.current();
        } catch {
          /* the page shows its own errors */
        }
        busy.current = false;
      }
      distance.current = 0;
      setState({ distance: 0, status: 'idle' });
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return state;
}

export const PullIndicator: React.FC<{ pull: PullState; lastUpdated?: number | null }> = ({ pull, lastUpdated }) => {
  if (pull.status === 'idle') return null;
  const refreshing = pull.status === 'refreshing';
  const updated = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed left-0 right-0 z-[60] flex justify-center"
      style={{ top: 'env(safe-area-inset-top, 0px)' }}
    >
      <div
        className="mt-2 flex items-center gap-2 rounded-full border border-[#2b354d] bg-[#111728] px-4 py-2 shadow-lg"
        style={{ transform: `translateY(${Math.max(0, pull.distance - 40)}px)`, opacity: Math.min(1, pull.distance / 40) }}
      >
        <RotateCw
          className={`h-4 w-4 text-[#ffc174] ${refreshing ? 'animate-spin' : ''}`}
          style={refreshing ? undefined : { transform: `rotate(${pull.distance * 3}deg)` }}
        />
        <span className="font-['JetBrains_Mono'] text-xs text-slate-200">
          {refreshing
            ? 'Refreshing…'
            : pull.status === 'ready'
            ? 'Release to refresh'
            : `Pull to refresh${updated ? ` · updated ${updated}` : ''}`}
        </span>
      </div>
    </div>
  );
};