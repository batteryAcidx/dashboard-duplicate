import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, Plus, RotateCcw } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { NotFoundPage } from './NotFoundPage';
import { AdminConversations } from '../components/AdminConversations';
import { AdminOverview } from '../components/AdminOverview';
import { AdminMfaGate } from '../components/AdminMfaGate';
import { ControlsTab } from '../components/admin/ControlsTab';
import { CalendarTab } from '../components/admin/CalendarTab';
import { BillingTab } from '../components/admin/BillingTab';
import { ActivityTab } from '../components/admin/ActivityTab';
import { HealthTab } from '../components/admin/HealthTab';
import { LegacyGhlCard } from '../components/admin/LegacyGhlCard';
import { AdminSettings } from '../components/admin/AdminSettings';
import { AdminShell } from '../components/admin/AdminShell';
import { Updated } from '../components/Updated';
import { useAutoRefresh } from '../lib/useAutoRefresh';
import { Card as UiCard, Row as UiRow, inputCls as uiInputCls } from '../components/ui';

/* ---------- types ---------- */

type StepStatus = 'pending' | 'in_progress' | 'waiting_on_you' | 'done';
type AccountStatus = 'setup' | 'live' | 'paused' | 'cancelled';
type OwnerState = 'active' | 'pending' | 'none';

interface ClientRow {
  id: string;
  name: string;
  status: AccountStatus;
  created_at: string;
  steps_done: number;
  steps_total: number;
  waiting: number;
  owner_email: string | null;
  owner_state: OwnerState;
  territories: string[];
}

interface StepRow {
  id: string;
  step_key: string;
  title: string;
  status: StepStatus;
  note: string | null;
  completed_at: string | null;
  sort_order: number;
}

interface TerritoryRef {
  id: string;
  name: string;
  country: string;
  region: string | null;
  locked_at: string | null;
}

interface ClientDetail {
  account: {
    id: string;
    name: string;
    service_area: string | null;
    services: string | null;
    timezone: string;
    status: AccountStatus;
    registration_status: string;
    texting_number: string | null;
    notification_phone: string | null;
    ghl_location_id?: string | null;
    created_at: string;
  };
  territories: TerritoryRef[];
  steps: StepRow[];
  owner: {
    email: string | null;
    full_name: string | null;
    state: 'active' | 'pending';
    last_sign_in_at: string | null;
  } | null;
  counts: { leads: number; unread: number; last7: number };
  audit: { id: string; action: string; detail: string | null; created_at: string }[];
}

interface TerritoryRow {
  id: string;
  name: string;
  country: string;
  region: string | null;
  account_id: string | null;
  locked_at: string | null;
  holder_name: string | null;
}

/* ---------- calling the server function ---------- */

async function callAdmin<T>(
  action: string,
  payload: Record<string, unknown> = {}
): Promise<{ data: T | null; error: string | null; status: number }> {
  if (!isSupabaseConfigured) {
    return { data: null, error: 'The dashboard is not connected to its database.', status: 500 };
  }
  const { data, error } = await supabase.functions.invoke('admin-api', { body: { action, ...payload } });
  if (error) {
    let message = 'Something went wrong. Check your connection and try again.';
    let status = 500;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      status = ctx.status || 500;
      try {
        const j = await ctx.json();
        if (j && typeof j.error === 'string') message = j.error;
      } catch {
        /* keep the generic message */
      }
    }
    return { data: null, error: message, status };
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    return { data: null, error: String((data as { error: string }).error), status: 400 };
  }
  return { data: data as T, error: null, status: 200 };
}

/* ---------- constants and helpers ---------- */

const STEP_LABEL: Record<StepStatus, string> = {
  pending: 'Up next',
  in_progress: 'In progress',
  waiting_on_you: 'Waiting on client',
  done: 'Done',
};
const STEP_ORDER: StepStatus[] = ['pending', 'in_progress', 'waiting_on_you', 'done'];
const STEP_TONE: Record<StepStatus, string> = {
  done: 'text-[#ffc174] border-[#ffc174]/30 bg-[#ffc174]/10',
  in_progress: 'text-slate-300 border-[#2b354d] bg-[#151b2b]',
  waiting_on_you: 'text-[#ffc174] border-[#f59e0b]/60 bg-[#261d10]',
  pending: 'text-slate-500 border-[#232839] bg-[#0a0e19]',
};

const STATUS_LABEL: Record<AccountStatus, string> = {
  setup: 'Setting up',
  live: 'Live',
  paused: 'Paused',
  cancelled: 'Cancelled',
};
const STATUS_CHIP: Record<AccountStatus, string> = {
  setup: 'text-slate-300 border-[#2b354d] bg-[#151b2b]',
  live: 'text-[#ffc174] border-[#ffc174]/30 bg-[#ffc174]/10',
  paused: 'text-slate-400 border-[#232a3f] bg-[#0a0e19]',
  cancelled: 'text-red-400 border-red-900/40 bg-red-950/30',
};

const TIMEZONES: [string, string][] = [
  ['America/New_York', 'Eastern (New York)'],
  ['America/Chicago', 'Central (Chicago)'],
  ['America/Denver', 'Mountain (Denver)'],
  ['America/Phoenix', 'Arizona (Phoenix)'],
  ['America/Los_Angeles', 'Pacific (Los Angeles)'],
  ['America/Anchorage', 'Alaska (Anchorage)'],
  ['Pacific/Honolulu', 'Hawaii (Honolulu)'],
  ['America/Toronto', 'Eastern (Toronto)'],
  ['America/Winnipeg', 'Central (Winnipeg)'],
  ['America/Edmonton', 'Mountain (Edmonton)'],
  ['America/Vancouver', 'Pacific (Vancouver)'],
  ['America/Halifax', 'Atlantic (Halifax)'],
];

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : '—';
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const inputCls = uiInputCls;
const labelCls = "mb-2 block text-sm font-medium text-slate-300";
const primaryBtn =
  "inline-flex h-11 items-center justify-center rounded-xl bg-[#f59e0b] px-5 font-display text-sm font-bold text-[#150f05] transition-colors hover:bg-[#fbbf24] cursor-pointer disabled:opacity-50";
const ghostBtn =
  "inline-flex h-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 font-display text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.07] cursor-pointer disabled:opacity-50";
const dangerBtn =
  "inline-flex h-11 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-5 font-display text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/15 cursor-pointer disabled:opacity-50";

/* ---------- small building blocks ---------- */

const StatusChip: React.FC<{ status: AccountStatus }> = ({ status }) => (
  <span
    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CHIP[status]}`}
  >
    {STATUS_LABEL[status]}
  </span>
);

const Pill: React.FC<{ children: React.ReactNode; tone?: 'gold' | 'plain' }> = ({ children, tone = 'plain' }) => (
  <span
    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
      tone === 'gold'
        ? 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#ffc174]'
        : 'border-white/[0.08] bg-white/[0.04] text-slate-300'
    }`}
  >
    {children}
  </span>
);

const TerritoryTag: React.FC<{ name: string }> = ({ name }) => (
  <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 font-data text-xs text-slate-200">
    {name}
  </span>
);

const Card: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <UiCard title={title} hint={hint}>
    {children}
  </UiCard>
);

const ReadRow: React.FC<{ label: string; value: string }> = ({ label, value }) => <UiRow label={label} value={value} />;

const ErrorLine: React.FC<{ text: string | null }> = ({ text }) =>
  text ? (
    <p role="alert" className="text-xs text-red-400 font-body">
      {text}
    </p>
  ) : null;

const LoadingBlock: React.FC<{ text: string }> = ({ text }) => (
  <div className="py-20 text-center font-body text-xs tracking-wide text-slate-400">{text}</div>
);

const RetryBlock: React.FC<{ text: string; onRetry: () => void }> = ({ text, onRetry }) => (
  <div className="py-12 text-center space-y-4">
    <p className="text-sm text-slate-300">{text}</p>
    <button type="button" onClick={onRetry} className={`${primaryBtn} inline-flex items-center gap-1.5`}>
      <RotateCcw className="w-3.5 h-3.5" />
      Retry
    </button>
  </div>
);

/* ---------- create client form ---------- */

const CreateClientForm: React.FC<{
  onDone: (r: { account_id: string; owner_email: string; name: string }) => void;
  onCancel: () => void;
  onDenied: () => void;
}> = ({ onDone, onCancel, onDenied }) => {
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [territory, setTerritory] = useState('');
  const [country, setCountry] = useState('US');
  const [tz, setTz] = useState('America/Chicago');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const r = await callAdmin<{ account_id: string; owner_email: string }>('create_client', {
      company_name: company,
      owner_email: email,
      owner_name: ownerName,
      territory,
      territory_country: country,
      timezone: tz,
    });
    setSaving(false);
    if (r.status === 403) return onDenied();
    if (r.error || !r.data) return setError(r.error || 'Could not create the client.');
    onDone({ account_id: r.data.account_id, owner_email: r.data.owner_email, name: company.trim() });
  };

  return (
    <form onSubmit={submit} className="mb-6 p-5 sm:p-6 rounded-xl bg-[#111625] border border-[#f59e0b]/30 space-y-4">
      <h2 className="font-display text-base sm:text-lg font-bold text-slate-100 tracking-tight">New client</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="c-company" className={labelCls}>Company name</label>
          <input id="c-company" required maxLength={100} value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="c-email" className={labelCls}>Owner email</label>
          <input id="c-email" type="email" required autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="c-name" className={labelCls}>Owner name</label>
          <input id="c-name" maxLength={80} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="c-territory" className={labelCls}>Territory (optional)</label>
          <input id="c-territory" maxLength={100} value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="214" className={inputCls} />
        </div>
        <div>
          <label htmlFor="c-country" className={labelCls}>Country</label>
          <select id="c-country" value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls}>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
        </div>
        <div>
          <label htmlFor="c-tz" className={labelCls}>Time zone</label>
          <select id="c-tz" value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls}>
            {TIMEZONES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <ErrorLine text={error} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className={primaryBtn}>
          {saving ? 'Creating…' : 'Create and send invite'}
        </button>
        <button type="button" onClick={onCancel} className={ghostBtn}>Cancel</button>
      </div>
    </form>
  );
};

/* ---------- client list ---------- */

const FILTERS: ['all' | AccountStatus, string][] = [
  ['all', 'All'],
  ['setup', 'Setting up'],
  ['live', 'Live'],
  ['paused', 'Paused'],
  ['cancelled', 'Cancelled'],
];

const ClientListView: React.FC<{ goto: (p: string) => void; onDenied: () => void }> = ({ goto, onDenied }) => {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<{ account_id: string; owner_email: string; name: string } | null>(null);
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

  const { updatedAt, refreshing, refresh } = useAutoRefresh(load, 'clients');

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
        <button type="button" onClick={() => setShowCreate((v) => !v)} className={`${primaryBtn} gap-2`}>
          <Plus className="h-4 w-4" />
          New client
        </button>
      </div>

      {created && (
        <div className="mb-6 rounded-2xl border border-[#f59e0b]/35 bg-[#f59e0b]/[0.07] p-5 text-[15px] leading-relaxed text-slate-200">
          <strong className="font-display">{created.name}</strong> created. An invite was sent to {created.owner_email}.{' '}
          <button type="button" onClick={() => goto(`/admin/${created.account_id}`)} className="cursor-pointer text-[#ffc174] underline underline-offset-4">
            Open client
          </button>
        </div>
      )}

      {showCreate && (
        <CreateClientForm
          onDenied={onDenied}
          onCancel={() => setShowCreate(false)}
          onDone={(r) => {
            setCreated(r);
            setShowCreate(false);
            refresh();
          }}
        />
      )}

      {!loaded && !error ? (
        <LoadingBlock text="Loading clients…" />
      ) : error && !loaded ? (
        <RetryBlock text={error} onRetry={refresh} />
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
          <div className="mb-4">
            <Updated at={updatedAt} refreshing={refreshing} onRefresh={refresh} />
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

const TerritoriesView: React.FC<{ goto: (p: string) => void; onDenied: () => void }> = ({ goto, onDenied }) => {
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

const StepEditor: React.FC<{
  step: StepRow;
  onSave: (key: string, status: StepStatus, note: string) => Promise<string | null>;
}> = ({ step, onSave }) => {
  const [status, setStatus] = useState<StepStatus>(step.status);
  const [note, setNote] = useState(step.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = status !== step.status || note.trim() !== (step.note || '');

  const save = async () => {
    setSaving(true);
    setError(null);
    const err = await onSave(step.step_key, status, note);
    setSaving(false);
    if (err) setError(err);
  };

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-3">
        <select
          aria-label={`Status of ${step.title}`}
          value={status}
          onChange={(e) => setStatus(e.target.value as StepStatus)}
          className={inputCls}
        >
          {STEP_ORDER.map((s) => (
            <option key={s} value={s}>{STEP_LABEL[s]}</option>
          ))}
        </select>
        <input
          aria-label={`Note for ${step.title}`}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note shown to the client (optional)"
          className={inputCls}
        />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={save} disabled={!dirty || saving} className={primaryBtn}>
          {saving ? 'Saving…' : 'Save step'}
        </button>
        <ErrorLine text={error} />
      </div>
    </div>
  );
};

const StepsPanel: React.FC<{
  steps: StepRow[];
  onSave: (key: string, status: StepStatus, note: string) => Promise<string | null>;
}> = ({ steps, onSave }) => {
  const [open, setOpen] = useState<string | null>(steps.find((s) => s.status !== 'done')?.step_key ?? null);

  const save = async (key: string, status: StepStatus, note: string) => {
    const err = await onSave(key, status, note);
    if (!err) setOpen(null);
    return err;
  };

  return (
    <Card
      title="Setup steps"
      hint="The note is shown to the client. For “Waiting on client”, it appears in their “We need one thing from you” box."
    >
      {steps.length === 0 ? (
        <p className="text-sm text-slate-400">This account has no setup steps.</p>
      ) : (
        <ul className="space-y-2">
          {steps.map((s) => {
            const isOpen = open === s.step_key;
            return (
              <li key={`${s.id}-${s.status}-${s.note ?? ''}`} className="p-4 rounded-lg bg-[#0e1322] border border-[#252939]">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-display text-sm font-bold text-slate-100">{s.title}</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-body tracking-wide font-semibold ${STEP_TONE[s.status]}`}
                    >
                      {STEP_LABEL[s.status]}
                    </span>
                    {s.status === 'done' && s.completed_at && (
                      <span className="font-data text-[11px] text-slate-500">{fmt(s.completed_at)}</span>
                    )}
                  </div>
                  <button type="button" onClick={() => setOpen(isOpen ? null : s.step_key)} className={ghostBtn}>
                    {isOpen ? 'Close' : 'Edit'}
                  </button>
                </div>
                {!isOpen && s.note && <p className="mt-2 text-xs text-slate-400 leading-relaxed">Note: {s.note}</p>}
                {isOpen && <StepEditor step={s} onSave={save} />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};

/* ---------- client detail: account tab ---------- */

const DetailsCard: React.FC<{ detail: ClientDetail; onSaved: () => Promise<void>; onDenied: () => void }> = ({
  detail,
  onSaved,
  onDenied,
}) => {
  const [name, setName] = useState(detail.account.name);
  const [tz, setTz] = useState(detail.account.timezone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = name.trim() !== detail.account.name || tz !== detail.account.timezone;
  const tzKnown = TIMEZONES.some(([v]) => v === tz);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const r = await callAdmin('update_client', { account_id: detail.account.id, name, timezone: tz });
    setSaving(false);
    if (r.status === 403) return onDenied();
    if (r.error) return setError(r.error);
    await onSaved();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card
      title="Details"
      hint="The company name appears in this client's texts (“Summit Roofing here…”), so change it only when it is really changing."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="d-name" className={labelCls}>Company name</label>
          <input id="d-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="d-tz" className={labelCls}>Time zone</label>
          <select id="d-tz" value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls}>
            {!tzKnown && <option value={tz}>{tz}</option>}
            {TIMEZONES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={save} disabled={!dirty || saving} className={primaryBtn}>
          {saving ? 'Saving…' : 'Save details'}
        </button>
        {saved && <span className="font-data text-xs text-[#ffc174]">Saved</span>}
        <ErrorLine text={error} />
      </div>
    </Card>
  );
};

const TerritoriesCard: React.FC<{ detail: ClientDetail; onChanged: () => Promise<void>; onDenied: () => void }> = ({
  detail,
  onChanged,
  onDenied,
}) => {
  const [name, setName] = useState('');
  const [country, setCountry] = useState('US');
  const [region, setRegion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const cancelled = detail.account.status === 'cancelled';

  const run = async (action: string, payload: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const r = await callAdmin(action, payload);
    setBusy(false);
    if (r.status === 403) {
      onDenied();
      return false;
    }
    if (r.error) {
      setError(r.error);
      return false;
    }
    await onChanged();
    return true;
  };

  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run('assign_territory', { account_id: detail.account.id, name, country, region })) {
      setName('');
      setRegion('');
    }
  };

  return (
    <Card
      title="Territories"
      hint="A territory can be locked by one client at a time. Use one naming scheme (for example area codes), so two names can never cover the same ground."
    >
      {detail.territories.length === 0 ? (
        <p className="text-sm text-slate-400">No territory locked yet.</p>
      ) : (
        <ul className="space-y-2">
          {detail.territories.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#0e1322] border border-[#252939]">
              <div className="min-w-0">
                <span className="font-display text-sm font-bold text-slate-100">{t.name}</span>
                <span className="ml-2 text-[11px] text-slate-500 font-data">
                  {t.country}
                  {t.region ? ` · ${t.region}` : ''} · since {fmtDate(t.locked_at)}
                </span>
              </div>
              {pending === t.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300">Release it?</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (await run('release_territory', { territory_id: t.id })) setPending(null);
                    }}
                    className={primaryBtn}
                  >
                    Yes
                  </button>
                  <button type="button" disabled={busy} onClick={() => setPending(null)} className={ghostBtn}>No</button>
                </div>
              ) : (
                <button type="button" disabled={busy} onClick={() => setPending(t.id)} className={ghostBtn}>Release</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {cancelled ? (
        <p className="text-xs text-slate-500">This client is cancelled. Reactivate it before locking a territory.</p>
      ) : (
        <form onSubmit={assign} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end pt-1">
          <div>
            <label htmlFor="a-name" className={labelCls}>Lock a territory</label>
            <input id="a-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="214" className={inputCls} />
          </div>
          <div>
            <label htmlFor="a-country" className={labelCls}>Country</label>
            <select id="a-country" value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls}>
              <option value="US">US</option>
              <option value="CA">CA</option>
            </select>
          </div>
          <div>
            <label htmlFor="a-region" className={labelCls}>State</label>
            <input id="a-region" maxLength={10} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="TX" className={inputCls} />
          </div>
          <button type="submit" disabled={busy} className={primaryBtn}>Lock</button>
        </form>
      )}
      <ErrorLine text={error} />
    </Card>
  );
};

const OwnerCard: React.FC<{ detail: ClientDetail; onChanged: () => Promise<void>; onDenied: () => void }> = ({
  detail,
  onChanged,
  onDenied,
}) => {
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const owner = detail.owner;

  const resend = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    const r = await callAdmin<{ owner_email: string }>('resend_invite', {
      account_id: detail.account.id,
      owner_email: inviteEmail,
    });
    setBusy(false);
    if (r.status === 403) return onDenied();
    if (r.error) return setError(r.error);
    setMsg(`Invite sent to ${r.data?.owner_email ?? 'the owner'}.`);
    setInviteEmail('');
    await onChanged();
  };

  return (
    <Card title="Owner">
      {owner ? (
        <>
          <ReadRow label="Name" value={owner.full_name || ''} />
          <ReadRow label="Email" value={owner.email || ''} />
          <ReadRow
            label="Login"
            value={owner.state === 'active' ? `Active · last sign-in ${fmt(owner.last_sign_in_at)}` : 'Invite not accepted yet'}
          />
        </>
      ) : (
        <p className="text-sm text-slate-300">No owner is linked to this account.</p>
      )}

      {(!owner || owner.state === 'pending') && (
        <div className="space-y-3 pt-1">
          <div>
            <label htmlFor="invite-email" className={labelCls}>
              {owner ? 'Send to a different email (optional)' : 'Owner email'}
            </label>
            <input
              id="invite-email"
              type="email"
              autoCapitalize="none"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={owner?.email || 'owner@company.com'}
              className={inputCls}
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={resend} disabled={busy} className={primaryBtn}>
              {busy ? 'Sending…' : owner ? 'Resend invite' : 'Send invite'}
            </button>
            {msg && <span className="font-data text-xs text-[#ffc174]">{msg}</span>}
          </div>
          <ErrorLine text={error} />
          <p className="text-[11.5px] text-slate-500 leading-relaxed">
            This replaces the old, never-used login with a fresh one, so older invite links stop working.
          </p>
        </div>
      )}
    </Card>
  );
};

const StatusCard: React.FC<{ detail: ClientDetail; onChanged: () => Promise<void>; onDenied: () => void }> = ({
  detail,
  onChanged,
  onDenied,
}) => {
  const [pending, setPending] = useState<'pause' | 'reactivate' | 'cancel' | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = detail.account.status;

  const mustType = pending === 'cancel';
  const typedOk = !mustType || typed.trim().toLowerCase() === detail.account.name.toLowerCase();

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    const r = await callAdmin('set_status', { account_id: detail.account.id, to: pending });
    setBusy(false);
    if (r.status === 403) return onDenied();
    if (r.error) {
      setError(r.error);
      await onChanged();
      setPending(null);
      return;
    }
    setPending(null);
    setTyped('');
    await onChanged();
  };

  return (
    <Card
      title="Account status"
      hint="Pausing marks the account paused and stops all texting for this client."
    >
      <div className="flex items-center gap-3 flex-wrap">
        {(status === 'setup' || status === 'live') && (
          <button type="button" onClick={() => setPending('pause')} disabled={busy} className={ghostBtn}>Pause</button>
        )}
        {(status === 'paused' || status === 'cancelled') && (
          <button type="button" onClick={() => setPending('reactivate')} disabled={busy} className={primaryBtn}>Reactivate</button>
        )}
        {status === 'cancelled' && (
          <span className="text-xs text-slate-500">Territories were released when this account was cancelled. Lock them again if needed.</span>
        )}
      </div>

      {pending && pending !== 'cancel' && (
        <div className="p-3 rounded-lg bg-[#1a1710] border border-[#f59e0b]/40 space-y-3">
          <p className="text-xs text-slate-200 leading-relaxed">
            {pending === 'pause' ? 'Pause this account?' : 'Reactivate this account?'}
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={confirm} disabled={busy} className={primaryBtn}>
              {busy ? 'Working…' : 'Yes, continue'}
            </button>
            <button type="button" onClick={() => setPending(null)} disabled={busy} className={ghostBtn}>Go back</button>
          </div>
        </div>
      )}

      {status !== 'cancelled' && (
        <div className="mt-2 p-4 rounded-lg border border-red-900/40 bg-red-950/10 space-y-3">
          <div className="font-body text-[11px] tracking-wide text-red-400 font-semibold">
            Danger area
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Cancelling releases every territory this client holds, so anyone else can take them. All data is kept.
          </p>
          {pending === 'cancel' ? (
            <div className="space-y-3">
              <label htmlFor="cancel-confirm" className={labelCls}>
                Type “{detail.account.name}” to confirm
              </label>
              <input
                id="cancel-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className={inputCls}
              />
              <div className="flex items-center gap-3">
                <button type="button" onClick={confirm} disabled={busy || !typedOk} className={dangerBtn}>
                  {busy ? 'Working…' : 'Cancel this account'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPending(null);
                    setTyped('');
                  }}
                  disabled={busy}
                  className={ghostBtn}
                >
                  Go back
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setPending('cancel')} disabled={busy} className={dangerBtn}>
              Cancel account
            </button>
          )}
        </div>
      )}
      <ErrorLine text={error} />
    </Card>
  );
};

/* ---------- client detail ---------- */

type Tab = 'overview' | 'conversations' | 'health' | 'setup' | 'controls' | 'calendar' | 'billing' | 'account' | 'activity';

const ClientDetailView: React.FC<{
  accountId: string;
  goto: (p: string) => void;
  onDenied: () => void;
}> = ({ accountId, goto, onDenied }) => {
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      const r = await callAdmin<ClientDetail>('get_client', { account_id: accountId });
      if (r.status === 403) return onDenied();
      if (r.error || !r.data) {
        setError(r.status === 404 ? 'Client not found.' : r.error || 'Could not load this client.');
        setLoading(false);
        return;
      }
      setDetail(r.data);
      setLoading(false);
    },
    [accountId, onDenied]
  );

  useEffect(() => {
    load();
  }, [load]);

  const reload = useCallback(() => load(true), [load]);

  const saveStep = async (key: string, status: StepStatus, note: string): Promise<string | null> => {
    const r = await callAdmin('update_step', { account_id: accountId, step_key: key, status, note });
    if (r.error) return r.error;
    await load(true);
    return null;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => goto('/admin')}
        className="inline-flex items-center gap-1.5 mt-6 text-xs font-display font-bold text-slate-300 hover:text-[#ffc174] transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4 text-[#ffc174]" />
        All clients
      </button>

      {loading ? (
        <LoadingBlock text="Loading client…" />
      ) : error || !detail ? (
        <RetryBlock text={error || 'Could not load this client.'} onRetry={() => load()} />
      ) : (
        <>
          <div className="mb-8 mt-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-100 leading-none">
                {detail.account.name}
              </h1>
              <StatusChip status={detail.account.status} />
              {detail.owner?.state === 'pending' && <Pill>Invite pending</Pill>}
              {detail.steps.some((s) => s.status === 'waiting_on_you') && <Pill tone="gold">Waiting on client</Pill>}
            </div>
            <div className="mt-2.5 flex items-center gap-2 flex-wrap text-sm text-slate-400">
              {detail.territories.length ? (
                detail.territories.map((t) => <TerritoryTag key={t.id} name={t.name} />)
              ) : (
                <span className="text-slate-500">No territory</span>
              )}
              <span className="text-slate-600">·</span>
              <span>{detail.owner?.email || 'No owner'}</span>
            </div>
          </div>

          <div role="tablist" className="mb-8 flex items-center gap-1 overflow-x-auto border-b border-white/[0.06] [scrollbar-width:none]">
            {(
              [
                ['overview', 'Overview'],
                ['conversations', 'Conversations'],
                ['health', 'Health'],
                ['setup', `Setup ${detail.steps.filter((s) => s.status === 'done').length}/${detail.steps.length}`],
                ['controls', 'Controls'],
                ['calendar', 'Calendar'],
                ['billing', 'Billing'],
                ['account', 'Account'],
                ['activity', 'Activity'],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`-mb-px shrink-0 cursor-pointer border-b-2 px-4 py-3.5 font-display text-[15px] font-semibold transition-colors ${
                  tab === key
                    ? 'border-[#f59e0b] text-slate-100'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* these two stay mounted so an open conversation survives switching tabs */}
          <div className={tab === 'overview' ? 'block space-y-4' : 'hidden'}>
            <p className="font-data text-xs text-slate-400">
              {detail.counts.leads} leads · {detail.counts.unread} unread · {detail.counts.last7} in the last 7 days
            </p>
            <AdminOverview accountId={accountId} call={callAdmin} onDenied={onDenied} />
          </div>
          <div className={tab === 'conversations' ? 'block' : 'hidden'}>
            <AdminConversations accountId={accountId} call={callAdmin} onDenied={onDenied} />
          </div>

          {tab === 'setup' && <StepsPanel steps={detail.steps} onSave={saveStep} />}

          {tab === 'health' && <HealthTab accountId={accountId} onDenied={onDenied} />}
          {tab === 'controls' && <ControlsTab accountId={accountId} onDenied={onDenied} />}
          {tab === 'calendar' && <CalendarTab accountId={accountId} onDenied={onDenied} />}
          {tab === 'billing' && <BillingTab accountId={accountId} onDenied={onDenied} />}

          {tab === 'account' && (
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
              <div className="space-y-8">
                <DetailsCard detail={detail} onSaved={reload} onDenied={onDenied} />
                <TerritoriesCard detail={detail} onChanged={reload} onDenied={onDenied} />
              </div>
              <div className="space-y-8">
                <OwnerCard detail={detail} onChanged={reload} onDenied={onDenied} />
                <Card title="Business info" hint="The client edits these in their own Settings.">
                  <ReadRow label="Service area" value={detail.account.service_area || ''} />
                  <ReadRow label="Services" value={detail.account.services || ''} />
                  <ReadRow label="Notification phone" value={detail.account.notification_phone || ''} />
                  <ReadRow label="Created" value={fmtDate(detail.account.created_at)} />
                </Card>
                <StatusCard detail={detail} onChanged={reload} onDenied={onDenied} />
                <LegacyGhlCard accountId={detail.account.id} current={detail.account.ghl_location_id ?? null} onDenied={onDenied} onChanged={reload} />
              </div>
            </div>
          )}

          {tab === 'activity' && <ActivityTab accountId={accountId} onDenied={onDenied} />}
        </>
      )}
    </>
  );
};

/* ---------- the page ---------- */

interface AdminPageProps {
  onNavigate?: (path: string) => void;
  onSignOut?: () => void;
  userEmail?: string;
  accountId?: string | null;
}

export const AdminPage: React.FC<AdminPageProps> = ({ onNavigate, onSignOut, userEmail = '', accountId = null }) => {
  const [denied, setDenied] = useState(false);

  const handleDenied = useCallback(() => setDenied(true), []);

  const goto = (path: string) => {
    if (onNavigate) onNavigate(path);
    else window.location.assign(path);
  };

  // not an admin: look exactly like a page that does not exist
  if (denied) return <NotFoundPage onNavigate={onNavigate} />;

  const section = accountId === 'territories' ? 'territories' : accountId === 'settings' ? 'settings' : 'clients';

  // Everything, including the Clients / Territories / Settings navigation, sits INSIDE the gate.
  // Until the code is entered, the gate shows only its own slim header and the check.
  return (
    <AdminMfaGate onDenied={handleDenied} userEmail={userEmail} onSignOut={onSignOut}>
      <AdminShell section={section} userEmail={userEmail} onNavigate={goto} onSignOut={onSignOut}>
        {section === 'territories' ? (
          <TerritoriesView goto={goto} onDenied={handleDenied} />
        ) : section === 'settings' ? (
          <AdminSettings userEmail={userEmail} onSignOut={onSignOut} />
        ) : accountId ? (
          <ClientDetailView accountId={accountId} goto={goto} onDenied={handleDenied} />
        ) : (
          <ClientListView goto={goto} onDenied={handleDenied} />
        )}
      </AdminShell>
    </AdminMfaGate>
  );
};
