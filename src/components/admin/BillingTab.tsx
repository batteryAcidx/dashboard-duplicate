import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button, Card, Chip, Field, Notice, Row, inputCls } from '../ui';
import { adminErrorText, centsToDollars, dollarsToCents, guaranteeView } from '../../lib/adminTools';
import type { Guarantee } from '../../lib/adminTools';

interface Invoice {
  id: string;
  issued_on: string;
  kind: string;
  amount_cents: number;
  status: string;
  paid_on: string | null;
  note: string | null;
}

export interface Billing {
  exists: boolean;
  plan: string;
  monthly_price_cents: number;
  setup_fee_cents: number;
  status: string;
  billing_email: string | null;
  payment_method: string;
  go_live_at: string | null;
  next_invoice_on: string | null;
  guarantee_override: string | null;
  notes: string | null;
  paid_cents: number;
  pending_cents: number;
  invoices: Invoice[];
  guarantee: Guarantee & { go_live_at?: string; window_end?: string };
}

const STATUS_OPTIONS: [string, string][] = [['trial', 'Trial'], ['active', 'Active'], ['past_due', 'Past due'], ['paused', 'Paused'], ['canceled', 'Canceled']];
const METHOD_OPTIONS: [string, string][] = [['manual', 'Manual'], ['card', 'Card'], ['ach', 'Bank transfer'], ['invoice', 'Invoice']];
const KIND_OPTIONS: [string, string][] = [['monthly', 'Monthly fee'], ['setup', 'Setup fee'], ['credit', 'Credit'], ['adjustment', 'Adjustment']];
const statusTone = (s: string): 'ok' | 'gold' | 'danger' | 'plain' => (s === 'active' ? 'ok' : s === 'past_due' ? 'danger' : s === 'trial' ? 'gold' : 'plain');
const dayText = (d: string | null) => (d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set');

const Sel: React.FC<{ id: string; value: string; onChange: (v: string) => void; options: [string, string][] }> = ({ id, value, onChange, options }) => (
  <select id={id} value={value} onChange={(e) => onChange(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls}>
    {options.map(([v, l]) => (
      <option key={v} value={v}>{l}</option>
    ))}
  </select>
);

export const BillingTab: React.FC<{ accountId: string; onDenied: () => void; initial?: Billing }> = ({ accountId, onDenied, initial }) => {
  const [b, setB] = useState<Billing | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // plan form
  const [plan, setPlan] = useState(initial?.plan ?? '');
  const [monthly, setMonthly] = useState(initial ? String(initial.monthly_price_cents / 100) : '');
  const [setup, setSetup] = useState(initial ? String(initial.setup_fee_cents / 100) : '');
  const [status, setStatus] = useState(initial?.status ?? 'trial');
  const [method, setMethod] = useState(initial?.payment_method ?? 'manual');
  const [email, setEmail] = useState(initial?.billing_email ?? '');
  const [nextOn, setNextOn] = useState(initial?.next_invoice_on ?? '');
  const [goLive, setGoLive] = useState(initial?.go_live_at ? initial.go_live_at.slice(0, 10) : '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [override, setOverride] = useState(initial?.guarantee_override ?? '');
  // invoice form
  const [kind, setKind] = useState('monthly');
  const [amount, setAmount] = useState('');
  const [issued, setIssued] = useState('');
  const [invStatus, setInvStatus] = useState('pending');
  const [invNote, setInvNote] = useState('');

  const apply = (data: Billing) => {
    setB(data);
    setPlan(data.plan);
    setMonthly(String(data.monthly_price_cents / 100));
    setSetup(String(data.setup_fee_cents / 100));
    setStatus(data.status);
    setMethod(data.payment_method);
    setEmail(data.billing_email ?? '');
    setNextOn(data.next_invoice_on ?? '');
    setGoLive(data.go_live_at ? data.go_live_at.slice(0, 10) : '');
    setNotes(data.notes ?? '');
    setOverride(data.guarantee_override ?? '');
  };

  const fail = (message: string) => {
    if (message.includes('forbidden')) return onDenied();
    setError(adminErrorText(message));
  };

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('admin_billing_get', { p_account_id: accountId });
    if (err) return fail(err.message);
    setError(null);
    apply(data as Billing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, ok: string): Promise<boolean> => {
    setBusy(key);
    setError(null);
    setNote(null);
    const { data, error: err } = await fn();
    setBusy(null);
    if (err) {
      fail(err.message);
      return false;
    }
    apply(data as Billing);
    setNote(ok);
    setTimeout(() => setNote(null), 4000);
    return true;
  };

  const savePlan = () => {
    const m = dollarsToCents(monthly);
    const s = dollarsToCents(setup || '0');
    if (m === null || m < 0) return setError('Enter the monthly price in dollars, for example 697.');
    if (s === null || s < 0) return setError('Enter the setup fee in dollars, or 0.');
    if (!plan.trim()) return setError('Give the plan a name.');
    run(
      'plan',
      () =>
        supabase.rpc('admin_billing_save', {
          p_account_id: accountId,
          p_patch: {
            plan: plan.trim(), monthly_price_cents: m, setup_fee_cents: s, status, payment_method: method,
            billing_email: email.trim() || null, next_invoice_on: nextOn || null, notes: notes.trim() || null,
            go_live_at: goLive ? `${goLive}T12:00:00Z` : null,
          },
        }),
      'Saved'
    );
  };

  const saveOverride = (v: string) => {
    setOverride(v);
    run('override', () => supabase.rpc('admin_billing_save', { p_account_id: accountId, p_patch: { guarantee_override: v || null } }), 'Saved');
  };

  const addInvoice = async () => {
    const cents = dollarsToCents(amount);
    if (cents === null || cents === 0) return setError('Enter an amount in dollars. Use a negative amount for a credit, like -697.');
    const ok = await run(
      'invoice',
      () => supabase.rpc('admin_invoice_add', { p_account_id: accountId, p_kind: kind, p_amount_cents: cents, p_issued_on: issued || null, p_status: invStatus, p_note: invNote.trim() || null }),
      'Invoice added'
    );
    if (ok) {
      setAmount('');
      setInvNote('');
    }
  };

  const setInvoice = (id: string, s: 'paid' | 'void' | 'pending') =>
    run('inv-' + id, () => supabase.rpc('admin_invoice_set_status', { p_invoice_id: id, p_status: s, p_paid_on: null }), 'Updated');

  if (!b) return <p className="py-16 text-center text-sm text-slate-400">{error ?? 'Loading billing…'}</p>;

  const g = guaranteeView(b.guarantee);
  const required = b.guarantee.required ?? 2;
  const pct = Math.min(100, Math.round(((b.guarantee.booked ?? 0) / required) * 100));

  return (
    <div className="space-y-8">
      {error && <Notice tone="error">{error}</Notice>}
      {note && <Notice tone="ok">{note}</Notice>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ['Plan', b.plan, null],
          ['Monthly', centsToDollars(b.monthly_price_cents), null],
          ['Paid to date', centsToDollars(b.paid_cents), null],
          ['Waiting', centsToDollars(b.pending_cents), null],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl border border-white/[0.07] bg-[#0f1424] p-5">
            <div className="text-sm text-slate-400">{label}</div>
            <div className="mt-2 truncate font-display text-2xl font-bold tracking-tight text-slate-100">{value}</div>
          </div>
        ))}
      </div>

      <Card
        title="30-day guarantee"
        hint="Two booked inspections in the first 30 days after go-live, with at least 6 missed calls a week, or the next month is free. A booked inspection counts even if it is later moved or cancelled."
        action={<Chip tone={g.tone}>{g.label}</Chip>}
      >
        <p className="text-[15px] leading-relaxed text-slate-300">{g.detail}</p>
        <div>
          <div className="mb-2 flex justify-between text-sm text-slate-400">
            <span>Booked inspections</span>
            <span className="font-data">{b.guarantee.booked ?? 0} / {required}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full rounded-full bg-[#f59e0b] transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <Row label="Went live" value={b.go_live_at ? dayText(b.go_live_at) : 'Not yet'} />
        <Row label="Window ends" value={b.guarantee.window_end ? dayText(b.guarantee.window_end) : 'Not yet'} />
        <Row label="Missed calls in the window" value={`${b.guarantee.missed_calls ?? 0} (${b.guarantee.calls_per_week ?? 0} a week)`} />
        <Field id="g-override" label="Decision" hint="Override the result by hand, for example to give the free month or to waive it.">
          <Sel id="g-override" value={override} onChange={saveOverride} options={[['', 'Follow the numbers'], ['credited', 'Free month given'], ['waived', 'Waived']]} />
        </Field>
      </Card>

      <Card
        title="Plan and billing"
        action={<Chip tone={statusTone(b.status)}>{STATUS_OPTIONS.find(([v]) => v === b.status)?.[1]}</Chip>}
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="bp-plan" label="Plan name">
            <input id="bp-plan" value={plan} onChange={(e) => setPlan(e.target.value)} maxLength={60} className={inputCls} />
          </Field>
          <Field id="bp-status" label="Status">
            <Sel id="bp-status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
          </Field>
          <Field id="bp-monthly" label="Monthly price ($)">
            <input id="bp-monthly" inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} className={inputCls} />
          </Field>
          <Field id="bp-setup" label="Setup fee ($)">
            <input id="bp-setup" inputMode="decimal" value={setup} onChange={(e) => setSetup(e.target.value)} className={inputCls} />
          </Field>
          <Field id="bp-method" label="Payment method">
            <Sel id="bp-method" value={method} onChange={setMethod} options={METHOD_OPTIONS} />
          </Field>
          <Field id="bp-email" label="Billing email">
            <input id="bp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </Field>
          <Field id="bp-next" label="Next invoice on">
            <input id="bp-next" type="date" value={nextOn} onChange={(e) => setNextOn(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls} />
          </Field>
          <Field id="bp-live" label="Went live on" hint="Starts the 30-day guarantee. Set automatically when the engine is first turned on.">
            <input id="bp-live" type="date" value={goLive} onChange={(e) => setGoLive(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls} />
          </Field>
        </div>
        <Field id="bp-notes" label="Notes">
          <textarea id="bp-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={1000} className={`${inputCls} h-auto py-3`} />
        </Field>
        <Button onClick={savePlan} disabled={busy === 'plan'}>{busy === 'plan' ? 'Saving…' : 'Save billing'}</Button>
      </Card>

      <Card title="Invoices" hint="A simple ledger. Record what you charged and what has been paid.">
        {b.invoices.length === 0 ? (
          <p className="text-sm text-slate-400">No invoices yet.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {b.invoices.map((i) => (
              <li key={i.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-display text-base font-bold text-slate-100">{centsToDollars(i.amount_cents)}</span>
                    <Chip tone={i.status === 'paid' ? 'ok' : i.status === 'void' ? 'plain' : 'gold'}>{i.status === 'paid' ? 'Paid' : i.status === 'void' ? 'Void' : 'Waiting'}</Chip>
                  </div>
                  <div className="mt-1 text-sm text-slate-400">
                    {KIND_OPTIONS.find(([v]) => v === i.kind)?.[1]} · {dayText(i.issued_on)}
                    {i.note ? ` · ${i.note}` : ''}
                  </div>
                </div>
                {i.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button tone="quiet" className="!h-10 !px-4" onClick={() => setInvoice(i.id, 'paid')} disabled={busy === 'inv-' + i.id}>Mark paid</Button>
                    <Button tone="quiet" className="!h-10 !px-4" onClick={() => setInvoice(i.id, 'void')} disabled={busy === 'inv-' + i.id}>Void</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-5 rounded-xl border border-white/[0.06] bg-[#0a0f1d] p-5">
          <div className="text-sm font-semibold text-slate-300">Add an invoice</div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field id="in-kind" label="Type">
              <Sel id="in-kind" value={kind} onChange={setKind} options={KIND_OPTIONS} />
            </Field>
            <Field id="in-amount" label="Amount ($)" hint="A credit is negative, like -697.">
              <input id="in-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="697" className={inputCls} />
            </Field>
            <Field id="in-date" label="Date">
              <input id="in-date" type="date" value={issued} onChange={(e) => setIssued(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls} />
            </Field>
            <Field id="in-status" label="Status">
              <Sel id="in-status" value={invStatus} onChange={setInvStatus} options={[['pending', 'Waiting for payment'], ['paid', 'Paid']]} />
            </Field>
          </div>
          <Field id="in-note" label="Note (optional)">
            <input id="in-note" value={invNote} onChange={(e) => setInvNote(e.target.value)} maxLength={300} className={inputCls} />
          </Field>
          <Button onClick={addInvoice} disabled={busy === 'invoice'}>{busy === 'invoice' ? 'Adding…' : 'Add invoice'}</Button>
        </div>
      </Card>
    </div>
  );
};
