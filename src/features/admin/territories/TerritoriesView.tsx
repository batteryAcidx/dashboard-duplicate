import React, { useCallback, useEffect, useState } from 'react';
import { callAdmin } from '../../../api';
import { TerritoryRow, fmtDate } from '../../../domain/accounts';
import { inputCls, labelCls, primaryBtn, ghostBtn, dangerBtn, Pill, LoadingBlock, RetryBlock } from '../shared';

export const TerritoriesView: React.FC<{ goto: (p: string) => void; onDenied: () => void }> = ({ goto, onDenied }) => {
  const [rows, setRows] = useState<TerritoryRow[]>([]);
  const [clients, setClients] = useState<{ id: string; name: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | 'locked' | 'available'>('all');
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('US');
  const [region, setRegion] = useState('');
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ id: string; kind: 'release' | 'delete' } | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      const r = await callAdmin<{ territories: TerritoryRow[]; clients: { id: string; name: string; status: string }[] }>(
        'list_territories'
      );
      if (r.status === 403) return onDenied();
      if (r.error || !r.data) {
        setError(r.error || 'Could not load territories.');
        setLoading(false);
        return;
      }
      setRows(r.data.territories);
      setClients(r.data.clients);
      setLoading(false);
    },
    [onDenied]
  );

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action: string, payload: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setActionError(null);
    const r = await callAdmin(action, payload);
    setBusy(false);
    if (r.status === 403) {
      onDenied();
      return false;
    }
    if (r.error) {
      setActionError(r.error);
      return false;
    }
    await load(true);
    return true;
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run('add_territory', { name, country, region })) {
      setName('');
      setRegion('');
    }
  };

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (t) =>
      (filter === 'all' || (filter === 'locked' ? t.account_id : !t.account_id)) &&
      (!q || t.name.toLowerCase().includes(q) || (t.holder_name || '').toLowerCase().includes(q))
  );
  const locked = rows.filter((t) => t.account_id).length;

  return (
    <>
      <div className="mt-8 mb-6">
        <span className="font-body text-xs tracking-wide text-[#f59e0b] font-bold block mb-2">ADMIN</span>
        <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-100 leading-none">
          Territories
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          {rows.length} total · {locked} locked · {rows.length - locked} available. Each territory can be locked by one
          client at a time.
        </p>
      </div>

      <form onSubmit={add} className="mb-6 p-5 rounded-xl bg-[#111625] border border-[#22283a]">
        <h2 className="font-display text-base font-bold text-slate-100 tracking-tight mb-3">Add a territory</h2>
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-4 items-end">
          <div>
            <label htmlFor="t-name" className={labelCls}>Name</label>
            <input id="t-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="214" className={inputCls} />
          </div>
          <div>
            <label htmlFor="t-country" className={labelCls}>Country</label>
            <select id="t-country" value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls}>
              <option value="US">United States</option>
              <option value="CA">Canada</option>
            </select>
          </div>
          <div>
            <label htmlFor="t-region" className={labelCls}>State or province</label>
            <input id="t-region" maxLength={10} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="TX" className={inputCls} />
          </div>
          <button type="submit" disabled={busy} className={primaryBtn}>Add</button>
        </div>
      </form>

      {actionError && (
        <div role="alert" className="mb-4 p-3.5 rounded-xl bg-red-950/40 border border-red-900/40 text-red-400 text-sm">
          {actionError}
        </div>
      )}

      {loading ? (
        <LoadingBlock text="Loading territories…" />
      ) : error ? (
        <RetryBlock text={error} onRetry={() => load()} />
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between gap-4 flex-wrap">
            <div role="group" aria-label="Filter" className="inline-flex rounded-xl border border-white/[0.07] bg-[#090d18] p-1">
              {(
                [
                  ['all', 'All'],
                  ['locked', 'Locked'],
                  ['available', 'Available'],
                ] as ['all' | 'locked' | 'available', string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-md font-data text-[11px] font-semibold transition-colors cursor-pointer ${
                    filter === key
                      ? 'bg-[#151b2b] border border-[#2b354d] text-[#ffc174]'
                      : 'text-slate-400 hover:text-slate-200 border border-transparent'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              type="search"
              aria-label="Search territories"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search territory or client"
              className={`${inputCls} md:w-72`}
            />
          </div>

          {visible.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/[0.09] p-12 text-center text-sm text-slate-400">
              {rows.length === 0 ? 'No territories yet. Add one above, or lock one from a client page.' : 'No territories match.'}
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0f1424]">
              <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,2.2fr)] gap-4 border-b border-white/[0.06] px-6 py-3.5 text-[13px] font-medium text-slate-500 md:grid">
                <span>Territory</span>
                <span>Status</span>
                <span>Held by</span>
                <span>Since</span>
                <span className="text-right">Action</span>
              </div>
              <ul className="divide-y divide-[#1b2336]">
                {visible.map((t) => {
                  const isLocked = Boolean(t.account_id);
                  const confirming = pending?.id === t.id ? pending.kind : null;
                  return (
                    <li
                      key={t.id}
                      className="grid grid-cols-1 gap-3 px-5 py-5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,2.2fr)] md:items-center md:gap-4 md:px-6"
                    >
                      <div className="min-w-0">
                        <span className="font-display text-sm font-bold text-slate-100">{t.name}</span>
                        <span className="ml-2 text-[11px] text-slate-500 font-data">
                          {t.country}
                          {t.region ? ` · ${t.region}` : ''}
                        </span>
                      </div>
                      <div>{isLocked ? <Pill tone="gold">Locked</Pill> : <Pill>Available</Pill>}</div>
                      <div className="min-w-0 text-sm">
                        {isLocked ? (
                          t.account_id && t.holder_name ? (
                            <button
                              type="button"
                              onClick={() => goto(`/admin/${t.account_id}`)}
                              className="text-[#ffc174] hover:underline cursor-pointer truncate max-w-full text-left"
                            >
                              {t.holder_name}
                            </button>
                          ) : (
                            <span className="text-slate-400">Unknown client</span>
                          )
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 font-data">{fmtDate(t.locked_at)}</div>
                      <div className="flex flex-wrap items-center justify-start gap-2 md:justify-end">
                        {confirming ? (
                          <>
                            <span className="text-xs text-slate-300">
                              {confirming === 'release' ? 'Release it?' : 'Delete it?'}
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={async () => {
                                const ok = await run(confirming === 'release' ? 'release_territory' : 'delete_territory', {
                                  territory_id: t.id,
                                });
                                if (ok) setPending(null);
                              }}
                              className={confirming === 'delete' ? dangerBtn : primaryBtn}
                            >
                              Yes
                            </button>
                            <button type="button" disabled={busy} onClick={() => setPending(null)} className={ghostBtn}>
                              No
                            </button>
                          </>
                        ) : isLocked ? (
                          <button type="button" disabled={busy} onClick={() => setPending({ id: t.id, kind: 'release' })} className={ghostBtn}>
                            Release
                          </button>
                        ) : (
                          <>
                            <select
                              aria-label={`Assign ${t.name} to a client`}
                              value={choice[t.id] || ''}
                              onChange={(e) => setChoice((c) => ({ ...c, [t.id]: e.target.value }))}
                              className={`${inputCls} md:w-44`}
                            >
                              <option value="">Assign to…</option>
                              {clients.map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={busy || !choice[t.id]}
                              onClick={() => run('assign_territory', { account_id: choice[t.id], territory_id: t.id })}
                              className={primaryBtn}
                            >
                              Lock
                            </button>
                            <button type="button" disabled={busy} onClick={() => setPending({ id: t.id, kind: 'delete' })} className={ghostBtn}>
                              Delete
                            </button>
                          </>
                        )}
                      </div>
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

/* ---------- client detail: setup steps ---------- */

/* ---------- client detail: account tab ---------- */

