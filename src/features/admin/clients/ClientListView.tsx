import React, { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { callAdmin } from '../../../api';
import { useSynced, useSync } from '../../../lib/sync';
import { AccountStatus, ClientRow } from '../../../domain/accounts';
import { inputCls, primaryBtn, StatusChip, Pill, TerritoryTag, LoadingBlock, RetryBlock } from '../shared';

export const FILTERS: ['all' | AccountStatus, string][] = [
  ['all', 'All'],
  ['setup', 'Setting up'],
  ['live', 'Live'],
  ['paused', 'Paused'],
  ['cancelled', 'Cancelled'],
];

export const ClientListView: React.FC<{ goto: (p: string) => void; onDenied: () => void }> = ({ goto, onDenied }) => {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | AccountStatus>('all');

  // loads on its own and keeps itself up to date, without flashing a loading screen each time
  const load = useCallback(async () => {
    const r = await callAdmin<{ clients: ClientRow[] }>('list_clients');
    if (r.status === 403) return onDenied();
    if (r.error || !r.data) {
      setError(r.error || 'Could not load clients.');
      return;
    }
    setError(null);
    setClients(r.data.clients);
    setLoaded(true);
  }, [onDenied]);

  const sync = useSync();
  useSynced(load, 'clients');

  const q = query.trim().toLowerCase();
  const visible = clients.filter(
    (c) =>
      (filter === 'all' || c.status === filter) &&
      (!q ||
        c.name.toLowerCase().includes(q) ||
        (c.owner_email || '').toLowerCase().includes(q) ||
        c.territories.some((t) => t.toLowerCase().includes(q)))
  );
  const countOf = (f: 'all' | AccountStatus) => (f === 'all' ? clients.length : clients.filter((c) => c.status === f).length);

  return (
    <>
      <div className="mb-8 mt-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <span className="mb-2 block text-sm font-semibold text-[#f59e0b]">Admin</span>
          <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-100 sm:text-4xl">Clients</h1>
        </div>
        <button type="button" onClick={() => goto('/admin/new')} className={`${primaryBtn} gap-2`}>
          <Plus className="h-4 w-4" />
          New client
        </button>
      </div>

      {!loaded && !error ? (
        <LoadingBlock text="Loading clients…" />
      ) : error && !loaded ? (
        <RetryBlock text={error} onRetry={() => sync?.syncAll()} />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div role="tablist" aria-label="Filter by status" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
              {FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={filter === key}
                  onClick={() => setFilter(key)}
                  className={`inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${
                    filter === key
                      ? 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#ffc174]'
                      : 'border-white/[0.08] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                  <span className={`text-xs ${filter === key ? 'text-[#ffc174]/70' : 'text-slate-500'}`}>{countOf(key)}</span>
                </button>
              ))}
            </div>
            <input
              type="search"
              aria-label="Search clients"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, email or territory"
              className={`${inputCls} lg:w-80`}
            />
          </div>

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.09] p-12 text-center text-sm text-slate-400">
              {clients.length === 0 ? 'No clients yet. Create the first one.' : 'No clients match.'}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0f1424]">
              <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,2fr)_minmax(0,1.3fr)] gap-4 border-b border-white/[0.06] px-6 py-3.5 text-[13px] font-medium text-slate-500 md:grid">
                <span>Client</span>
                <span>Territory</span>
                <span>Owner</span>
                <span>Setup</span>
              </div>
              <ul className="divide-y divide-white/[0.06]">
                {visible.map((c) => {
                  const pct = c.steps_total ? Math.round((c.steps_done / c.steps_total) * 100) : 0;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => goto(`/admin/${c.id}`)}
                        className="grid w-full cursor-pointer grid-cols-1 gap-3 px-5 py-5 text-left transition-colors hover:bg-white/[0.03] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,2fr)_minmax(0,1.3fr)] md:items-center md:gap-4 md:px-6"
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                          <span className="truncate font-display text-base font-bold tracking-tight text-slate-100">{c.name}</span>
                          <StatusChip status={c.status} />
                          {c.waiting > 0 && <Pill tone="gold">Waiting on client</Pill>}
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          {c.territories.length ? (
                            c.territories.map((t) => <TerritoryTag key={t} name={t} />)
                          ) : (
                            <span className="text-sm text-slate-500">No territory</span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm text-slate-300">{c.owner_email || 'No owner'}</div>
                          {c.owner_state === 'pending' && <div className="text-xs text-slate-500">Invite pending</div>}
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                            <div className="h-full rounded-full bg-[#f59e0b]" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="shrink-0 font-data text-xs text-slate-500">
                            {c.steps_done}/{c.steps_total}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
};

/* ---------- territories page ---------- */

