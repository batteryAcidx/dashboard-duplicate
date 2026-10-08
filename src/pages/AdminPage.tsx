import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, LogOut, Plus, RotateCcw } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { NotFoundPage } from './NotFoundPage';
import { AdminConversations } from '../components/AdminConversations';
import { AdminOverview } from '../components/AdminOverview';

/* ---------- types ---------- */

type StepStatus = 'pending' | 'in_progress' | 'waiting_on_you' | 'done';
type AccountStatus = 'setup' | 'live' | 'paused' | 'cancelled';
type OwnerState = 'active' | 'pending' | 'none';

interface ClientRow {
  id: string;
  name: string;
  territory: string | null;
  status: AccountStatus;
  created_at: string;
  steps_done: number;
  steps_total: number;
  waiting: number;
  owner_email: string | null;
  owner_state: OwnerState;
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

interface ClientDetail {
  account: {
    id: string;
    name: string;
    territory: string | null;
    service_area: string | null;
    services: string | null;
    timezone: string;
    status: AccountStatus;
    registration_status: string;
    texting_number: string | null;
    notification_phone: string | null;
    ghl_location_id: string | null;
    created_at: string;
  };
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

const inputCls =
  "w-full bg-[#090d18] border border-[#232839] focus:border-[#f59e0b] focus:outline-none rounded-lg px-3 py-2.5 text-sm font-['Inter'] text-slate-100 placeholder:text-slate-600 disabled:opacity-60";

const labelCls =
  "block font-['JetBrains_Mono'] text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-1.5";

const primaryBtn =
  "px-4 py-2 rounded-lg bg-[#f59e0b] hover:bg-[#fbbf24] text-[#150f05] font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50";

const ghostBtn =
  "px-4 py-2 rounded-lg bg-[#111728] border border-[#212b42] hover:border-[#314060] text-slate-300 font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50";

const StatusChip: React.FC<{ status: AccountStatus }> = ({ status }) => (
  <span
    className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-['JetBrains_Mono'] uppercase tracking-wider font-semibold shrink-0 ${STATUS_CHIP[status]}`}
  >
    {STATUS_LABEL[status]}
  </span>
);

const Card: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="p-5 sm:p-6 rounded-xl bg-[#111625] border border-[#22283a]">
    <h2 className="font-['Space_Grotesk'] text-base sm:text-lg font-bold text-slate-100 tracking-tight">{title}</h2>
    {hint && <p className="mt-1 text-xs sm:text-[13px] text-slate-400 leading-relaxed">{hint}</p>}
    <div className="mt-4 space-y-4">{children}</div>
  </section>
);

const ReadRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 text-sm">
    <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-widest text-slate-500 font-semibold pt-0.5">
      {label}
    </span>
    <span className="text-slate-200 text-right break-words min-w-0">{value || '—'}</span>
  </div>
);

const ErrorLine: React.FC<{ text: string | null }> = ({ text }) =>
  text ? (
    <p role="alert" className="text-xs text-red-400 font-['Inter']">
      {text}
    </p>
  ) : null;

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
      timezone: tz,
    });
    setSaving(false);
    if (r.status === 403) {
      onDenied();
      return;
    }
    if (r.error || !r.data) {
      setError(r.error || 'Could not create the client.');
      return;
    }
    onDone({ account_id: r.data.account_id, owner_email: r.data.owner_email, name: company.trim() });
  };

  return (
    <form onSubmit={submit} className="mb-6 p-5 sm:p-6 rounded-xl bg-[#111625] border border-[#f59e0b]/30 space-y-4">
      <h2 className="font-['Space_Grotesk'] text-base sm:text-lg font-bold text-slate-100 tracking-tight">
        New client
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="c-company" className={labelCls}>Company name</label>
          <input id="c-company" required maxLength={100} value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="c-territory" className={labelCls}>Territory</label>
          <input id="c-territory" maxLength={100} value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="214 Dallas, TX" className={inputCls} />
        </div>
        <div>
          <label htmlFor="c-email" className={labelCls}>Owner email</label>
          <input id="c-email" type="email" required autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="c-name" className={labelCls}>Owner name</label>
          <input id="c-name" maxLength={80} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} />
        </div>
        <div className="sm:col-span-2">
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

const ClientListView: React.FC<{ goto: (p: string) => void; onDenied: () => void }> = ({ goto, onDenied }) => {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [created, setCreated] = useState<{ account_id: string; owner_email: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const r = await callAdmin<{ clients: ClientRow[] }>('list_clients');
    if (r.status === 403) {
      onDenied();
      return;
    }
    if (r.error || !r.data) {
      setError(r.error || 'Could not load clients.');
      setLoading(false);
      return;
    }
    setClients(r.data.clients);
    setLoading(false);
  }, [onDenied]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="mt-6 mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <span className="font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#f59e0b] font-bold block mb-2">
            ADMIN
          </span>
          <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-black uppercase tracking-tight text-slate-100 leading-none">
            Clients
          </h1>
        </div>
        <button type="button" onClick={() => setShowCreate((v) => !v)} className={`${primaryBtn} inline-flex items-center gap-1.5`}>
          <Plus className="w-4 h-4" />
          New client
        </button>
      </div>

      {created && (
        <div className="mb-6 p-4 rounded-xl bg-[#1a1710] border border-[#f59e0b]/40 text-sm text-slate-200 leading-relaxed">
          <strong className="font-['Space_Grotesk']">{created.name}</strong> created. An invite was sent to{' '}
          {created.owner_email}.{' '}
          <button type="button" onClick={() => goto(`/admin/${created.account_id}`)} className="text-[#ffc174] underline cursor-pointer">
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
            load();
          }}
        />
      )}

      {loading ? (
        <div className="py-20 text-center font-['JetBrains_Mono'] text-xs uppercase tracking-wider text-slate-400">
          Loading clients…
        </div>
      ) : error ? (
        <div className="py-12 text-center space-y-4">
          <p className="text-sm text-slate-300">{error}</p>
          <button type="button" onClick={load} className={`${primaryBtn} inline-flex items-center gap-1.5`}>
            <RotateCcw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      ) : clients.length === 0 ? (
        <div className="p-10 rounded-xl border border-dashed border-[#232839] bg-[#0c101d]/60 text-center text-sm text-slate-400">
          No clients yet. Create the first one.
        </div>
      ) : (
        <ul className="space-y-3">
          {clients.map((c) => {
            const pct = c.steps_total ? Math.round((c.steps_done / c.steps_total) * 100) : 0;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => goto(`/admin/${c.id}`)}
                  className="w-full text-left p-4 sm:p-5 rounded-xl bg-[#111625] hover:bg-[#151b2c] border border-[#22283a] transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-['Space_Grotesk'] text-[15px] font-bold text-slate-100 truncate">{c.name}</span>
                        <StatusChip status={c.status} />
                        {c.waiting > 0 && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-[#f59e0b]/50 bg-[#261d10] text-[#ffc174] text-[10px] font-['JetBrains_Mono'] uppercase tracking-wider font-semibold">
                            Waiting on client
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-400 truncate">
                        {c.territory || 'No territory'} · {c.owner_email || 'No owner'}
                        {c.owner_state === 'pending' ? ' · invite pending' : ''}
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <div className="h-1.5 flex-1 rounded-full bg-[#151b2b] overflow-hidden">
                          <div className="h-full rounded-full bg-[#f59e0b]" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="font-['JetBrains_Mono'] text-[11px] text-slate-500 shrink-0">
                          {c.steps_done} of {c.steps_total} steps
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
};

/* ---------- one setup step editor ---------- */

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
    <li className="p-4 rounded-lg bg-[#0e1322] border border-[#252939] space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="font-['Space_Grotesk'] text-sm font-bold text-slate-100">{step.title}</span>
        {step.status === 'done' && step.completed_at && (
          <span className="font-['JetBrains_Mono'] text-[11px] text-slate-500">{fmt(step.completed_at)}</span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
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
    </li>
  );
};

/* ---------- client detail ---------- */

const ClientDetailView: React.FC<{
  accountId: string;
  goto: (p: string) => void;
  onDenied: () => void;
}> = ({ accountId, goto, onDenied }) => {
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      const r = await callAdmin<ClientDetail>('get_client', { account_id: accountId });
      if (r.status === 403) {
        onDenied();
        return;
      }
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

  const saveStep = async (key: string, status: StepStatus, note: string): Promise<string | null> => {
    const r = await callAdmin('update_step', { account_id: accountId, step_key: key, status, note });
    if (r.error) return r.error;
    await load(true);
    return null;
  };

  const changeStatus = async (to: 'pause' | 'reactivate' | 'cancel') => {
    const text =
      to === 'pause'
        ? 'Pause this account?'
        : to === 'cancel'
        ? 'Cancel this account? This frees the territory. All data is kept.'
        : 'Reactivate this account?';
    if (!window.confirm(text)) return;
    setBusy(true);
    setActionError(null);
    const r = await callAdmin('set_status', { account_id: accountId, to });
    setBusy(false);
    if (r.error) {
      setActionError(r.error);
      return;
    }
    await load(true);
  };

  const resendInvite = async () => {
    setBusy(true);
    setActionError(null);
    setInviteMsg(null);
    const r = await callAdmin<{ owner_email: string }>('resend_invite', {
      account_id: accountId,
      owner_email: inviteEmail,
    });
    setBusy(false);
    if (r.error) {
      setActionError(r.error);
      return;
    }
    setInviteMsg(`Invite sent to ${r.data?.owner_email ?? 'the owner'}.`);
    setInviteEmail('');
    await load(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => goto('/admin')}
        className="inline-flex items-center gap-1.5 mt-4 text-xs font-['Space_Grotesk'] font-bold text-slate-300 hover:text-[#ffc174] transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4 text-[#ffc174]" />
        All clients
      </button>

      {loading ? (
        <div className="py-24 text-center font-['JetBrains_Mono'] text-xs uppercase tracking-wider text-slate-400">
          Loading client…
        </div>
      ) : error || !detail ? (
        <div className="py-16 text-center space-y-4">
          <p className="text-sm text-slate-300">{error || 'Could not load this client.'}</p>
          <button type="button" onClick={() => load()} className={`${primaryBtn} inline-flex items-center gap-1.5`}>
            <RotateCcw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 mb-6">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-black uppercase tracking-tight text-slate-100 leading-none">
                {detail.account.name}
              </h1>
              <StatusChip status={detail.account.status} />
            </div>
            <p className="mt-2 text-sm text-slate-400">{detail.account.territory || 'No territory'}</p>
          </div>

          {actionError && (
            <div role="alert" className="mb-5 p-3.5 rounded-xl bg-red-950/40 border border-red-900/40 text-red-400 text-sm">
              {actionError}
            </div>
          )}

          <div className="space-y-5">
            {/* Owner */}
            <Card title="Owner">
              {detail.owner ? (
                <>
                  <ReadRow label="Name" value={detail.owner.full_name || ''} />
                  <ReadRow label="Email" value={detail.owner.email || ''} />
                  <ReadRow
                    label="Login"
                    value={
                      detail.owner.state === 'active'
                        ? `Active · last sign-in ${fmt(detail.owner.last_sign_in_at)}`
                        : 'Invite not accepted yet'
                    }
                  />
                </>
              ) : (
                <p className="text-sm text-slate-300">No owner is linked to this account.</p>
              )}

              {(!detail.owner || detail.owner.state === 'pending') && (
                <div className="space-y-3 pt-1">
                  <div>
                    <label htmlFor="invite-email" className={labelCls}>
                      {detail.owner ? 'Send to a different email (optional)' : 'Owner email'}
                    </label>
                    <input
                      id="invite-email"
                      type="email"
                      autoCapitalize="none"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder={detail.owner?.email || 'owner@company.com'}
                      className={inputCls}
                    />
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button type="button" onClick={resendInvite} disabled={busy} className={primaryBtn}>
                      {busy ? 'Sending…' : detail.owner ? 'Resend invite' : 'Send invite'}
                    </button>
                    {inviteMsg && <span className="font-['JetBrains_Mono'] text-xs text-[#ffc174]">{inviteMsg}</span>}
                  </div>
                  <p className="text-[11.5px] text-slate-500 leading-relaxed">
                    This replaces the old, never-used login with a fresh one, so older invite links stop working.
                  </p>
                </div>
              )}
            </Card>

            {/* Setup steps */}
            <Card
              title="Setup steps"
              hint="The note is shown to the client. For “Waiting on client”, it appears in their “We need one thing from you” box."
            >
              <ul className="space-y-3">
                {detail.steps.map((s) => (
                  <StepEditor key={`${s.id}-${s.status}-${s.note ?? ''}`} step={s} onSave={saveStep} />
                ))}
              </ul>
              {detail.steps.length === 0 && (
                <p className="text-sm text-slate-400">This account has no setup steps.</p>
              )}
            </Card>

            {/* Account */}
            <Card title="Account" hint="The client edits their own business info in Settings. These fields are read-only here.">
              <ReadRow label="Time zone" value={detail.account.timezone} />
              <ReadRow label="Service area" value={detail.account.service_area || ''} />
              <ReadRow label="Notification phone" value={detail.account.notification_phone || ''} />
              <ReadRow label="Texting number" value={detail.account.texting_number || ''} />
              <ReadRow label="Registration" value={detail.account.registration_status.replace(/_/g, ' ')} />
              <ReadRow label="GHL location" value={detail.account.ghl_location_id || ''} />
              <ReadRow label="Created" value={fmt(detail.account.created_at)} />
              <ReadRow
                label="Leads"
                value={`${detail.counts.leads} total · ${detail.counts.unread} unread · ${detail.counts.last7} in the last 7 days`}
              />
            </Card>

            {/* Status */}
            <Card
              title="Account status"
              hint="Pausing marks the account paused. Texting actually stops once the GHL connection is built. Cancelling frees the territory and keeps all data."
            >
              <div className="flex items-center gap-3 flex-wrap">
                {(detail.account.status === 'setup' || detail.account.status === 'live') && (
                  <button type="button" onClick={() => changeStatus('pause')} disabled={busy} className={ghostBtn}>
                    Pause
                  </button>
                )}
                {(detail.account.status === 'paused' || detail.account.status === 'cancelled') && (
                  <button type="button" onClick={() => changeStatus('reactivate')} disabled={busy} className={primaryBtn}>
                    Reactivate
                  </button>
                )}
                {detail.account.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => changeStatus('cancel')}
                    disabled={busy}
                    className="px-4 py-2 rounded-lg bg-red-950/30 border border-red-900/40 hover:border-red-700/60 text-red-400 font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
                  >
                    Cancel account
                  </button>
                )}
              </div>
            </Card>

            <AdminOverview accountId={accountId} call={callAdmin} onDenied={onDenied} />
            <AdminConversations accountId={accountId} call={callAdmin} onDenied={onDenied} />

            {/* Activity */}
            <Card title="Admin activity" hint="Everything done to this client from this page. Times are in your browser's time zone.">
              {detail.audit.length === 0 ? (
                <p className="text-sm text-slate-400">Nothing yet.</p>
              ) : (
                <ul className="space-y-2">
                  {detail.audit.map((a) => (
                    <li key={a.id} className="flex items-start justify-between gap-4 text-sm">
                      <span className="text-slate-300 min-w-0 break-words">
                        {a.detail || a.action.replace(/_/g, ' ')}
                      </span>
                      <span className="font-['JetBrains_Mono'] text-[11px] text-slate-500 shrink-0 pt-0.5">
                        {fmt(a.created_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleDenied = useCallback(() => setDenied(true), []);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const goto = (path: string) => {
    if (onNavigate) onNavigate(path);
    else window.location.assign(path);
  };

  // not an admin: look exactly like a page that does not exist
  if (denied) return <NotFoundPage onNavigate={onNavigate} />;

  return (
    <div className="min-h-screen w-full bg-[#090e1c] text-[#dee1f7] font-['Inter']">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-5 pb-3 flex items-center justify-between gap-4">
        <span className="font-['Space_Grotesk'] text-lg font-bold text-slate-100 tracking-tight">
          WEDGE<span className="text-[#ffc174]">SCALE</span>{' '}
          <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-[#ffc174] border border-[#ffc174]/40 rounded-md px-1.5 py-0.5 align-middle">
            Admin
          </span>
        </span>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111728] border border-[#212b42] text-slate-300 text-xs"
            aria-expanded={menuOpen}
          >
            <span className="max-w-[160px] truncate hidden sm:inline">{userEmail}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-xl bg-[#0f1422] border border-[#222c42] py-1.5 z-50">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onSignOut?.();
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-red-400 hover:bg-[#192236] text-left"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 pb-20">
        {accountId ? (
          <ClientDetailView accountId={accountId} goto={goto} onDenied={handleDenied} />
        ) : (
          <ClientListView goto={goto} onDenied={handleDenied} />
        )}
      </main>
    </div>
  );
};