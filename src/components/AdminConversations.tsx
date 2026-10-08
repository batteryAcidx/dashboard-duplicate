import React, { useState } from 'react';
import { ArrowLeft, Eye, Pencil, PhoneMissed } from 'lucide-react';

type Result<T> = { data: T | null; error: string | null; status: number };
type CallAdmin = <T>(action: string, payload?: Record<string, unknown>) => Promise<Result<T>>;

interface LeadSummary {
  id: string;
  name: string | null;
  address: string | null;
  city: string | null;
  status: string;
  priority: boolean;
  unread: boolean;
  created_at: string;
  message_count: number;
  last_message_at: string | null;
}

interface LeadDetail {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  insurance_carrier: string | null;
  payment_type: string;
  status: string;
  priority: boolean;
  final_value: number | null;
  job_type: string | null;
  missed_call_at: string | null;
  opted_out: boolean;
  automation_paused: boolean;
}

interface EventRow {
  id: string;
  event_type: string;
  detail: string | null;
  actor: string;
  created_at: string;
}

interface ThreadData {
  company: string;
  timezone: string;
  lead: LeadDetail;
  messages: { id: string; sender: string; body: string | null; sent_at: string; delivery_status: string }[];
  events: EventRow[];
  attachments: { id: string; message_id: string | null; file_name: string | null; size_bytes: number | null }[];
  appointments: { starts_at: string; status: string }[];
}

const STATUS_LABEL: Record<string, string> = {
  booked: 'Booked',
  following_up: 'Following up',
  needs_you: 'Needs you',
  not_a_lead: 'Not a lead',
  won: 'Won',
  lost: 'Lost',
};
const STATUS_ORDER = ['booked', 'following_up', 'needs_you', 'won', 'lost', 'not_a_lead'];

const JOB_OPTIONS: [string, string][] = [
  ['', 'Not set'],
  ['repair', 'Repair'],
  ['storm_damage', 'Storm damage'],
  ['full_reroof', 'Full reroof'],
  ['commercial', 'Commercial'],
];

const toKey = (s: string | null) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
const dayKey = (iso: string, tz: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: tz });
const dayLabel = (iso: string, tz: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
const clock = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
const whenLabel = (iso: string | null, tz: string) => (iso ? `${dayLabel(iso, tz)} ${clock(iso, tz)}` : '—');
const mb = (b: number | null) => (b ? `${(b / 1048576).toFixed(1)} MB` : '');
const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
const actorSuffix = (a: string) => (a === 'owner' ? ' · by owner' : a === 'support' ? ' · by support' : ' · automatic');

const btn =
  "px-4 py-2 rounded-lg bg-[#f59e0b] hover:bg-[#fbbf24] text-[#150f05] font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50";
const ghost =
  "px-4 py-2 rounded-lg bg-[#111728] border border-[#212b42] hover:border-[#314060] text-slate-300 font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50";
const inputCls =
  "w-full bg-[#090d18] border border-[#232839] focus:border-[#f59e0b] focus:outline-none rounded-lg px-3 py-2.5 text-sm font-['Inter'] text-slate-100 placeholder:text-slate-600 disabled:opacity-60";
const labelCls =
  "block font-['JetBrains_Mono'] text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-1.5";

/* ---------- the edit panel ---------- */

interface EditPanelProps {
  lead: LeadDetail;
  call: CallAdmin;
  onDenied: () => void;
  onSaved: (lead: Partial<LeadDetail>, events: EventRow[]) => void;
}

const EditPanel: React.FC<EditPanelProps> = ({ lead, call, onDenied, onSaved }) => {
  const initial = {
    status: lead.status,
    value: lead.final_value ? String(Math.round(Number(lead.final_value))) : '',
    job: JOB_OPTIONS.some(([v]) => v !== '' && v === toKey(lead.job_type)) ? toKey(lead.job_type) : '',
    priority: lead.priority,
    name: lead.name || '',
    phone: lead.phone || '',
    address: lead.address || '',
    city: lead.city || '',
  };

  const [form, setForm] = useState(initial);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof initial>(k: K, v: (typeof initial)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const buildChanges = (): { changes: Record<string, unknown>; problem: string | null } => {
    const c: Record<string, unknown> = {};

    if (form.status !== initial.status) c.status = form.status;
    if (form.status === 'won') {
      const valueChanged = form.value.trim() !== initial.value;
      if (form.status !== initial.status || valueChanged) {
        const raw = form.value.replace(/[^0-9.]/g, '');
        const n = Number(raw);
        if (!raw || Number.isNaN(n) || n <= 0 || n > 1000000) {
          return { changes: c, problem: 'Enter the job value in dollars, for example 12500.' };
        }
        c.final_value = Math.round(n);
      }
    }
    if (form.job !== initial.job) c.job_type = form.job === '' ? null : form.job;
    if (form.priority !== initial.priority) c.priority = form.priority;
    if (form.name.trim() !== initial.name) {
      if (!form.name.trim()) return { changes: c, problem: 'The name cannot be empty.' };
      c.name = form.name.trim();
    }
    if (form.phone.trim() !== initial.phone) c.phone = form.phone.trim();
    if (form.address.trim() !== initial.address) c.address = form.address.trim();
    if (form.city.trim() !== initial.city) c.city = form.city.trim();

    return { changes: c, problem: null };
  };

  const submit = async () => {
    setError(null);
    const { changes, problem } = buildChanges();
    if (problem) return setError(problem);
    if (Object.keys(changes).length === 0) return setError('Change something first.');

    const why = reason.trim();
    if (why.length < 3) return setError('Enter a reason (at least 3 characters). It is saved in the admin log.');

    if (!window.confirm('Save these changes? The client will see a "WedgeScale support" marker in the conversation.')) {
      return;
    }

    setSaving(true);
    const r = await call<{ changed: boolean; lead?: Partial<LeadDetail>; events?: EventRow[] }>('edit_lead', {
      lead_id: lead.id,
      changes,
      reason: why,
    });
    setSaving(false);

    if (r.status === 403) return onDenied();
    if (r.error || !r.data) return setError(r.error || 'Could not save the changes.');
    if (!r.data.changed) return setError('No changes were needed.');
    onSaved(r.data.lead || {}, r.data.events || []);
  };

  return (
    <div className="p-4 rounded-lg bg-[#0e1322] border border-[#f59e0b]/30 space-y-4">
      <p className="text-xs text-slate-400 leading-relaxed">
        Messages and history cannot be edited. Every change is saved in Admin activity with your reason, and the client
        sees a "WedgeScale support" marker.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="ed-status" className={labelCls}>Status</label>
          <select id="ed-status" value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>

        {form.status === 'won' ? (
          <div>
            <label htmlFor="ed-value" className={labelCls}>Final job value ($)</label>
            <input
              id="ed-value"
              inputMode="decimal"
              value={form.value}
              onChange={(e) => set('value', e.target.value)}
              placeholder="12500"
              className={inputCls}
            />
          </div>
        ) : (
          <div />
        )}

        <div>
          <label htmlFor="ed-job" className={labelCls}>Job type</label>
          <select id="ed-job" value={form.job} onChange={(e) => set('job', e.target.value)} className={inputCls}>
            {JOB_OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-200 sm:self-end sm:pb-2.5">
          <input
            type="checkbox"
            checked={form.priority}
            onChange={(e) => set('priority', e.target.checked)}
            className="h-4 w-4 accent-[#f59e0b]"
          />
          Priority lead
        </label>

        <div>
          <label htmlFor="ed-name" className={labelCls}>Name</label>
          <input id="ed-name" maxLength={80} value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="ed-phone" className={labelCls}>Phone</label>
          <input id="ed-phone" type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="ed-address" className={labelCls}>Address</label>
          <input id="ed-address" maxLength={200} value={form.address} onChange={(e) => set('address', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="ed-city" className={labelCls}>City</label>
          <input id="ed-city" maxLength={100} value={form.city} onChange={(e) => set('city', e.target.value)} className={inputCls} />
        </div>
      </div>

      <div>
        <label htmlFor="ed-reason" className={labelCls}>Reason (required)</label>
        <textarea
          id="ed-reason"
          rows={2}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="For example: the owner called to correct the address"
          className={`${inputCls} resize-none`}
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-400 font-['Inter']">
          {error}
        </p>
      )}

      <button type="button" onClick={submit} disabled={saving} className={btn}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
};

/* ---------- the card ---------- */

interface Props {
  accountId: string;
  call: CallAdmin;
  onDenied: () => void;
}

export const AdminConversations: React.FC<Props> = ({ accountId, call, onDenied }) => {
  const [leads, setLeads] = useState<LeadSummary[] | null>(null);
  const [listTz, setListTz] = useState('America/Chicago');
  const [thread, setThread] = useState<ThreadData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editNote, setEditNote] = useState<string | null>(null);
  const [editVersion, setEditVersion] = useState(0);

  const loadLeads = async () => {
    setBusy(true);
    setError(null);
    const r = await call<{ leads: LeadSummary[]; timezone: string }>('list_leads', { account_id: accountId });
    setBusy(false);
    if (r.status === 403) return onDenied();
    if (r.error || !r.data) return setError(r.error || 'Could not load the leads.');
    setLeads(r.data.leads);
    setListTz(r.data.timezone || 'America/Chicago');
  };

  const openThread = async (leadId: string) => {
    setBusy(true);
    setError(null);
    const r = await call<ThreadData>('get_thread', { lead_id: leadId });
    setBusy(false);
    if (r.status === 403) return onDenied();
    if (r.error || !r.data) return setError(r.error || 'Could not open the conversation.');
    setThread(r.data);
    setEditOpen(false);
    setEditNote(null);
  };

  const handleSaved = (updated: Partial<LeadDetail>, events: EventRow[]) => {
    setThread((prev) =>
      prev ? { ...prev, lead: { ...prev.lead, ...updated }, events: [...prev.events, ...events] } : prev
    );
    setLeads((prev) =>
      prev
        ? prev.map((l) =>
            l.id === updated.id
              ? {
                  ...l,
                  name: updated.name ?? l.name,
                  address: updated.address ?? l.address,
                  city: updated.city ?? l.city,
                  status: updated.status ?? l.status,
                  priority: updated.priority ?? l.priority,
                }
              : l
          )
        : prev
    );
    setEditVersion((v) => v + 1);
    setEditNote('Saved. The client will see a "WedgeScale support" marker in the conversation.');
  };

  /* ---------- the conversation ---------- */
  const renderThread = (t: ThreadData) => {
    const tz = t.timezone;
    const firstName = (t.lead.name || 'Homeowner').split(' ')[0];

    type Item =
      | { kind: 'message'; at: string; m: ThreadData['messages'][number] }
      | { kind: 'event'; at: string; e: EventRow };

    const items: Item[] = [
      ...t.messages.map((m): Item => ({ kind: 'message', at: m.sent_at, m })),
      ...t.events.map((e): Item => ({ kind: 'event', at: e.created_at, e })),
    ].sort((a, b) => {
      const d = new Date(a.at).getTime() - new Date(b.at).getTime();
      if (d !== 0) return d;
      return a.kind === b.kind ? 0 : a.kind === 'message' ? -1 : 1;
    });

    const place = [t.lead.address, t.lead.city].filter(Boolean).join(', ');
    let lastDay = '';

    return (
      <div>
        <button
          type="button"
          onClick={() => setThread(null)}
          className="inline-flex items-center gap-1.5 text-xs font-['Space_Grotesk'] font-bold text-slate-300 hover:text-[#ffc174] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#ffc174]" />
          Back to the list
        </button>

        <div className="mt-4 pb-4 mb-4 border-b border-[#252939] space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="font-['Space_Grotesk'] text-lg font-bold text-slate-100 tracking-tight">
              {t.lead.name || 'Unnamed lead'}
            </h3>
            {t.lead.priority && (
              <span className="px-2 py-0.5 rounded-md bg-[#141a29]/80 border border-white/[0.09] text-[10px] font-['JetBrains_Mono'] uppercase tracking-wider text-[#ffc174] font-semibold">
                Priority
              </span>
            )}
            <span className="px-2 py-0.5 rounded-md bg-[#151b2b] border border-[#2b354d] text-[10px] font-['JetBrains_Mono'] uppercase tracking-wider text-slate-300 font-semibold">
              {STATUS_LABEL[t.lead.status] || t.lead.status}
              {t.lead.status === 'won' && t.lead.final_value ? ` · ${money(Number(t.lead.final_value))}` : ''}
            </span>
          </div>
          <p className="text-xs sm:text-[13px] text-slate-300 leading-relaxed">
            <span className="font-['JetBrains_Mono']">{t.lead.phone || 'No phone'}</span>
            {' · '}
            {t.lead.payment_type === 'out_of_pocket' ? 'Out of pocket' : t.lead.insurance_carrier || 'Insurance not given'}
            {place ? ` · ${place}` : ''}
          </p>
          <p className="font-['JetBrains_Mono'] text-xs text-slate-400">
            Job type: {JOB_OPTIONS.find(([v]) => v !== '' && v === toKey(t.lead.job_type))?.[1] || 'Not set'}
          </p>
          {t.appointments.length > 0 && (
            <p className="font-['JetBrains_Mono'] text-xs text-[#ffc174]">
              {t.appointments.map((a) => `${whenLabel(a.starts_at, tz)} (${a.status})`).join(' · ')}
            </p>
          )}
          {(t.lead.opted_out || t.lead.automation_paused) && (
            <p className="font-['JetBrains_Mono'] text-xs text-slate-400">
              {t.lead.opted_out ? 'Opted out of texts' : ''}
              {t.lead.opted_out && t.lead.automation_paused ? ' · ' : ''}
              {t.lead.automation_paused ? 'Automation paused on this lead' : ''}
            </p>
          )}
          <p className="font-['JetBrains_Mono'] text-[11px] text-slate-500">
            Times are in {t.company ? `${t.company}'s` : 'the client\u2019s'} time zone ({tz}).
          </p>
        </div>

        {/* edit area */}
        <div className="mb-4 space-y-3">
          {editNote && <p className="font-['JetBrains_Mono'] text-xs text-[#ffc174]">{editNote}</p>}
          {editOpen ? (
            <>
              <EditPanel key={editVersion} lead={t.lead} call={call} onDenied={onDenied} onSaved={handleSaved} />
              <button type="button" onClick={() => setEditOpen(false)} className={ghost}>
                Close editor
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                setEditOpen(true);
                setEditNote(null);
              }}
              className={`${ghost} inline-flex items-center gap-1.5`}
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit this lead
            </button>
          )}
        </div>

        <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
          {t.lead.missed_call_at && (
            <div className="flex items-center justify-center pb-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0a0e19] border border-[#232a3f] text-xs font-['JetBrains_Mono'] text-slate-400">
                <PhoneMissed className="w-3.5 h-3.5" />
                <span>Missed call · {whenLabel(t.lead.missed_call_at, tz)}</span>
              </div>
            </div>
          )}

          {items.length === 0 && (
            <p className="text-center font-['JetBrains_Mono'] text-xs text-slate-500 py-6">No messages yet.</p>
          )}

          {items.map((it) => {
            const k = dayKey(it.at, tz);
            const showDay = k !== lastDay;
            lastDay = k;
            const divider = showDay ? (
              <div className="flex items-center justify-center my-2">
                <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-slate-400 bg-[#0a0e19] border border-[#232a3f] px-3 py-0.5 rounded-full font-semibold">
                  {dayLabel(it.at, tz)}
                </span>
              </div>
            ) : null;

            if (it.kind === 'event') {
              return (
                <React.Fragment key={`e-${it.e.id}`}>
                  {divider}
                  <div className="flex items-center justify-center">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#0a0e19] border border-[#232a3f] text-[11px] font-['JetBrains_Mono'] text-slate-500 text-center leading-snug">
                      <span className={`h-1 w-1 rounded-full shrink-0 ${it.e.actor === 'system' ? 'bg-slate-500' : 'bg-[#ffc174]'}`} />
                      {it.e.detail || it.e.event_type.replace(/_/g, ' ')}
                      {actorSuffix(it.e.actor)} · {clock(it.at, tz)}
                    </span>
                  </div>
                </React.Fragment>
              );
            }

            const m = it.m;
            const isHomeowner = m.sender === 'homeowner';
            const label = isHomeowner ? firstName : m.sender === 'owner' ? 'Owner' : 'Automation';
            const files = t.attachments.filter((a) => a.message_id === m.id);

            return (
              <React.Fragment key={`m-${m.id}`}>
                {divider}
                <div
                  className={`p-3 text-xs sm:text-[13px] leading-relaxed rounded-2xl border max-w-[92%] ${
                    isHomeowner
                      ? 'ml-auto rounded-tr-sm bg-[#ffc174]/[0.09] border-[#ffc174]/20 text-slate-100'
                      : 'rounded-tl-sm bg-[#111625] border-[#252939] text-[#dee1f7]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1 pb-1 border-b border-[#252b3d]/40">
                    <span
                      className={`font-['JetBrains_Mono'] text-[11px] font-bold uppercase tracking-wider ${
                        isHomeowner ? 'text-[#ffc174]' : 'text-slate-400'
                      }`}
                    >
                      {label}
                    </span>
                    <span className="font-['JetBrains_Mono'] text-[10.5px] text-slate-500">
                      {clock(m.sent_at, tz)}
                      {m.delivery_status === 'failed' ? ' · failed' : ''}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-[#e2e8f0]">{m.body}</p>
                  {files.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-[#252b3d]/40 flex flex-wrap gap-2">
                      {files.map((f) => (
                        <span
                          key={f.id}
                          className="px-2 py-1 rounded-md bg-[#090d18] border border-[#262c3e] font-['JetBrains_Mono'] text-[10px] text-slate-300"
                        >
                          {f.file_name || 'Photo'} {mb(f.size_bytes)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  /* ---------- the card ---------- */
  return (
    <section className="p-5 sm:p-6 rounded-xl bg-[#111625] border border-[#22283a]">
      <h2 className="font-['Space_Grotesk'] text-base sm:text-lg font-bold text-slate-100 tracking-tight">
        Conversations
      </h2>
      <p className="mt-1 text-xs sm:text-[13px] text-slate-400 leading-relaxed">
        For support. Opening the list or a conversation is recorded in Admin activity, and viewing never marks anything
        as read. You can correct lead details, but messages and history cannot be changed.
      </p>

      <div className="mt-4 space-y-4">
        {error && (
          <p role="alert" className="text-xs text-red-400 font-['Inter']">
            {error}
          </p>
        )}

        {thread ? (
          renderThread(thread)
        ) : leads === null ? (
          <button type="button" onClick={loadLeads} disabled={busy} className={`${btn} inline-flex items-center gap-1.5`}>
            <Eye className="w-4 h-4" />
            {busy ? 'Opening…' : 'Show conversations'}
          </button>
        ) : leads.length === 0 ? (
          <p className="text-sm text-slate-400">This client has no conversations yet.</p>
        ) : (
          <ul className="space-y-2">
            {leads.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => openThread(l.id)}
                  disabled={busy}
                  className="w-full text-left p-3.5 rounded-lg bg-[#0e1322] hover:bg-[#151b2c] border border-[#252939] transition-colors cursor-pointer disabled:opacity-60"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-['Space_Grotesk'] text-sm font-bold text-slate-100 truncate">
                          {l.name || 'Unnamed lead'}
                        </span>
                        {l.priority && (
                          <span className="text-[9px] font-['JetBrains_Mono'] uppercase tracking-wider text-[#ffc174] border border-white/[0.09] rounded px-1.5 py-0.5">
                            Priority
                          </span>
                        )}
                        <span className="text-[9px] font-['JetBrains_Mono'] uppercase tracking-wider text-slate-400 border border-[#2b354d] rounded px-1.5 py-0.5">
                          {STATUS_LABEL[l.status] || l.status}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400 truncate">
                        {[l.address, l.city].filter(Boolean).join(', ') || 'No address'}
                      </div>
                    </div>
                    <div className="text-right shrink-0 font-['JetBrains_Mono'] text-[10.5px] text-slate-500">
                      <div>{l.message_count} messages</div>
                      <div>{whenLabel(l.last_message_at || l.created_at, listTz)}</div>
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};