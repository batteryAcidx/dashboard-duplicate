import React, { useCallback, useEffect, useState } from 'react';

type Result<T> = { data: T | null; error: string | null; status: number };
type CallAdmin = <T>(action: string, payload?: Record<string, unknown>) => Promise<Result<T>>;
type WindowKey = '24h' | '7d' | '30d';

interface Stats {
  captured: number;
  booked: number;
  pipeline: number;
  avg_response_seconds: number | null;
}

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const formatResponse = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m === 0 ? `${s}s` : `${m}m ${s < 10 ? '0' : ''}${s}s`;
};

const WINDOWS: [WindowKey, string][] = [
  ['24h', '24 hours'],
  ['7d', '7 days'],
  ['30d', '30 days'],
];

interface Props {
  accountId: string;
  call: CallAdmin;
  onDenied: () => void;
}

export const AdminOverview: React.FC<Props> = ({ accountId, call, onDenied }) => {
  const [win, setWin] = useState<WindowKey>('7d');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await call<{ stats: Stats }>('get_overview', { account_id: accountId, window: win });
    if (r.status === 403) {
      onDenied();
      return;
    }
    if (r.error || !r.data) {
      setError(r.error || 'Could not load the overview.');
      setLoading(false);
      return;
    }
    setStats(r.data.stats);
    setLoading(false);
  }, [accountId, win, call, onDenied]);

  useEffect(() => {
    load();
  }, [load]);

  const rate = stats && stats.captured > 0 ? `${Math.round((stats.booked / stats.captured) * 100)}%` : '—';

  const cards: [string, string, string][] = stats
    ? [
        ['Response speed', stats.avg_response_seconds ? formatResponse(stats.avg_response_seconds) : '—', 'Average response time.'],
        ['Calls rescued', String(stats.captured), 'Total missed calls captured.'],
        ['Pipeline value', money(Number(stats.pipeline) || 0), 'From the client\u2019s typical job values.'],
        ['Booking rate', rate, `${stats.booked} of ${stats.captured} missed calls booked.`],
      ]
    : [];

  return (
    <section className="p-5 sm:p-6 rounded-xl bg-[#111625] border border-[#22283a]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-['Space_Grotesk'] text-base sm:text-lg font-bold text-slate-100 tracking-tight">
            Overview
          </h2>
          <p className="mt-1 text-xs sm:text-[13px] text-slate-400 leading-relaxed">
            The same numbers and rules as the client's own Overview. Totals only, no message content.
          </p>
        </div>
        <div role="group" aria-label="Time window" className="inline-flex p-0.5 rounded-lg bg-[#090d18] border border-[#232839]">
          {WINDOWS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={win === key}
              onClick={() => setWin(key)}
              className={`px-3 py-1.5 rounded-md font-['JetBrains_Mono'] text-[11px] font-semibold transition-colors cursor-pointer ${
                win === key
                  ? 'bg-[#151b2b] border border-[#2b354d] text-[#ffc174]'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {loading && !stats ? (
          <p className="py-6 text-center font-['JetBrains_Mono'] text-xs uppercase tracking-wider text-slate-400">
            Loading overview…
          </p>
        ) : error ? (
          <p role="alert" className="text-xs text-red-400 font-['Inter']">
            {error}
          </p>
        ) : (
          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${loading ? 'opacity-60' : ''}`}>
            {cards.map(([label, value, note]) => (
              <div key={label} className="rounded-xl bg-[#0e1322] p-4 border border-[#252939]">
                <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#d8c3ad] font-medium">
                  {label}
                </span>
                <div className="font-['Space_Grotesk'] text-2xl font-bold tracking-tight text-[#ffc174] tabular-nums mt-2">
                  {value}
                </div>
                <span className="font-['Inter'] text-[11px] text-slate-400 block mt-1">{note}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};