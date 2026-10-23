import React, { useCallback, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button, Card, Field, Notice, inputCls } from '../ui';
import { Updated } from '../Updated';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import { EMPTY_FILTERS, actionLabel, activityArgs, adminErrorText, filtersActive, pageInfo } from '../../lib/adminTools';
import type { ActivityFilters } from '../../lib/adminTools';

export interface ActivityRow {
  id: string | null;
  created_at: string;
  action: string;
  detail: string | null;
  actor_id: string | null;
  actor_email: string | null;
}

export interface ActivityResult {
  total: number;
  rows: ActivityRow[];
  actors: { id: string; email: string | null }[];
  actions: string[];
  limit: number;
  offset: number;
}

const PAGE = 25;
const shortWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fullWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
const who = (r: ActivityRow) => (r.actor_email ? r.actor_email.split('@')[0] : r.actor_id ? 'An admin' : 'System');

export const ActivityTab: React.FC<{ accountId: string; onDenied: () => void; initial?: ActivityResult }> = ({ accountId, onDenied, initial }) => {
  const [data, setData] = useState<ActivityResult | null>(initial ?? null);
  const [filters, setFilters] = useState<ActivityFilters>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: res, error: err } = await supabase.rpc('admin_activity_list', activityArgs(accountId, filters, offset, PAGE));
    if (err) {
      if (err.message.includes('forbidden')) return onDenied();
      setError(adminErrorText(err.message));
      return;
    }
    setError(null);
    setData(res as ActivityResult);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, filters, offset]);

  const { updatedAt, refreshing, refresh } = useAutoRefresh(load, `${accountId}:${JSON.stringify(filters)}:${offset}`);

  const change = (patch: Partial<ActivityFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setOffset(0);
    setOpen(null);
  };

  if (!data) return <p className="py-16 text-center text-sm text-slate-400">{error ?? 'Loading activity…'}</p>;
  const info = pageInfo(data.total, data.offset, data.limit || PAGE);
  const rowKey = (r: ActivityRow, i: number) => r.id ?? `${r.created_at}-${i}`;

  return (
    <div className="space-y-8">
      {error && <Notice tone="error">{error}</Notice>}

      <Card
        title="Activity"
        hint="Everything done for this client by the admin team: changes, notes and actions. Open a line to read it in full."
        action={<Updated at={updatedAt} refreshing={refreshing} onRefresh={refresh} />}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="act-q" label="Search">
            <input id="act-q" type="search" value={filters.search} onChange={(e) => change({ search: e.target.value })} placeholder="Words in the note" className={inputCls} />
          </Field>
          <Field id="act-who" label="Who">
            <select id="act-who" value={filters.actor} onChange={(e) => change({ actor: e.target.value })} style={{ colorScheme: 'dark' }} className={inputCls}>
              <option value="">Everyone</option>
              {data.actors.map((a) => (
                <option key={a.id} value={a.id}>{a.email ?? 'Unknown admin'}</option>
              ))}
            </select>
          </Field>
          <Field id="act-what" label="What">
            <select id="act-what" value={filters.action} onChange={(e) => change({ action: e.target.value })} style={{ colorScheme: 'dark' }} className={inputCls}>
              <option value="">Anything</option>
              {data.actions.map((a) => (
                <option key={a} value={a}>{actionLabel(a)}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field id="act-from" label="From">
              <input id="act-from" type="date" value={filters.from} onChange={(e) => change({ from: e.target.value })} style={{ colorScheme: 'dark' }} className={inputCls} />
            </Field>
            <Field id="act-to" label="To">
              <input id="act-to" type="date" value={filters.to} onChange={(e) => change({ to: e.target.value })} style={{ colorScheme: 'dark' }} className={inputCls} />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-slate-400">
            {data.total === 0 ? 'No entries' : `Showing ${info.from} to ${info.to} of ${info.total}`}
            {filtersActive(filters) ? ' (filtered)' : ''}
          </span>
          {filtersActive(filters) && (
            <Button tone="quiet" className="!h-10 !px-4" onClick={() => change(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          )}
        </div>

        {data.rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/[0.09] p-10 text-center text-sm text-slate-400">
            {filtersActive(filters) ? 'Nothing matches those filters.' : 'Nothing has been done for this client yet.'}
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07]">
            {data.rows.map((r, i) => {
              const k = rowKey(r, i);
              const isOpen = open === k;
              return (
                <li key={k} className="bg-[#0a0f1d]">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : k)}
                    aria-expanded={isOpen}
                    className="flex w-full cursor-pointer items-center gap-4 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03] sm:px-5"
                  >
                    <span className="hidden w-32 shrink-0 text-[13px] text-slate-500 sm:block">{shortWhen(r.created_at)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-slate-100">{actionLabel(r.action)}</span>
                      <span className="block truncate text-[13px] text-slate-500 sm:hidden">{shortWhen(r.created_at)} · {who(r)}</span>
                    </span>
                    <span className="hidden w-28 shrink-0 truncate text-[13px] text-slate-400 sm:block">{who(r)}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isOpen && (
                    <div className="space-y-3 border-t border-white/[0.05] px-4 py-4 sm:px-5">
                      <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-200">{r.detail || 'No details were recorded.'}</p>
                      <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-[13px] sm:grid-cols-2">
                        <div className="flex justify-between gap-4"><dt className="text-slate-500">When</dt><dd className="text-right text-slate-300">{fullWhen(r.created_at)}</dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-slate-500">Who</dt><dd className="min-w-0 break-all text-right text-slate-300">{r.actor_email || 'System'}</dd></div>
                        <div className="flex justify-between gap-4"><dt className="text-slate-500">Action</dt><dd className="font-data text-right text-slate-300">{r.action}</dd></div>
                      </dl>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {info.pages > 1 && (
          <div className="flex items-center justify-between gap-3">
            <Button tone="quiet" disabled={!info.hasPrev} onClick={() => setOffset(Math.max(0, data.offset - PAGE))}>
              Previous
            </Button>
            <span className="text-sm text-slate-400">
              Page {info.page} of {info.pages}
            </span>
            <Button tone="quiet" disabled={!info.hasNext} onClick={() => setOffset(data.offset + PAGE)}>
              Next
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
};
