import React, { useCallback, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button, Card, Chip, Field, Notice, Row, inputCls } from '../ui';
import { Updated } from '../Updated';
import { useAutoRefresh } from '../../lib/useAutoRefresh';
import { INVOICE_LABEL, SUBSCRIPTION_LABEL, adminErrorText, centsToDollars, guaranteeView, isStripeCustomerId, relativeTime, stripeCustomerUrl } from '../../lib/adminTools';
import type { Guarantee } from '../../lib/adminTools';

export interface StripeInvoice {
  id: string;
  number: string | null;
  status: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  hosted_invoice_url: string | null;
  issued_at: string | null;
  paid_at: string | null;
}

export interface Billing {
  exists: boolean;
  linked: boolean;
  plan: string;
  monthly_price_cents: number;
  status: string;
  go_live_at: string | null;
  guarantee_override: string | null;
  notes: string | null;
  stripe: {
    customer_id: string | null;
    subscription_id: string | null;
    status: string | null;
    price_label: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    payment_method: string | null;
    synced_at: string | null;
  };
  paid_cents: number;
  open_cents: number;
  invoices: StripeInvoice[];
  guarantee: Guarantee & { go_live_at?: string; window_end?: string };
}

const statusTone = (s: string | null): 'ok' | 'gold' | 'danger' | 'plain' =>
  s === 'active' ? 'ok' : s === 'trialing' ? 'gold' : s === 'past_due' || s === 'unpaid' ? 'danger' : 'plain';
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set');

export const BillingTab: React.FC<{ accountId: string; onDenied: () => void; initial?: Billing }> = ({ accountId, onDenied, initial }) => {
  const [b, setB] = useState<Billing | null>(initial ?? null);
  const [customer, setCustomer] = useState('');
  const [goLive, setGoLive] = useState(initial?.go_live_at ? initial.go_live_at.slice(0, 10) : '');
  const [override, setOverride] = useState(initial?.guarantee_override ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const dirty = useRef(false);

  const fail = (message: string) => {
    if (message.includes('forbidden')) return onDenied();
    setError(adminErrorText(message));
  };

  const apply = (data: Billing, resetForm: boolean) => {
    setB(data);
    if (resetForm) {
      setGoLive(data.go_live_at ? data.go_live_at.slice(0, 10) : '');
      setOverride(data.guarantee_override ?? '');
      setNotes(data.notes ?? '');
      dirty.current = false;
    }
  };

  // runs on its own: new payments and plan changes from Stripe appear without anyone pressing anything.
  // A refresh never overwrites something you are in the middle of typing.
  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('admin_billing_get', { p_account_id: accountId });
    if (err) return fail(err.message);
    setError(null);
    apply(data as Billing, !dirty.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const { updatedAt, refreshing, refresh } = useAutoRefresh(load, accountId);

  const flash = (msg: string) => {
    setNote(msg);
    setTimeout(() => setNote(null), 4000);
  };

  const syncNow = async (): Promise<boolean> => {
    const { error: err } = await supabase.functions.invoke('stripe-sync', { body: { account_id: accountId } });
    if (err) {
      setError('Linked, but the first sync from Stripe did not work yet. It will fill in when Stripe sends its next update, or try Sync now again.');
      return false;
    }
    return true;
  };

  const link = async () => {
    const id = customer.trim();
    if (!isStripeCustomerId(id)) return setError('A Stripe customer id looks like cus_NffrFeUfNV2Hib. Copy it from the customer page in Stripe.');
    setBusy('link');
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_billing_link_stripe', { p_account_id: accountId, p_customer_id: id });
    if (err) {
      setBusy(null);
      return fail(err.message);
    }
    apply(data as Billing, true);
    setCustomer('');
    const ok = await syncNow();
    setBusy(null);
    if (ok) flash('Linked and synced');
    await load();
  };

  const sync = async () => {
    setBusy('sync');
    setError(null);
    const ok = await syncNow();
    setBusy(null);
    if (ok) flash('Synced from Stripe');
    await load();
  };

  const unlink = async () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 6000);
      return;
    }
    setConfirming(false);
    setBusy('unlink');
    const { data, error: err } = await supabase.rpc('admin_billing_link_stripe', { p_account_id: accountId, p_customer_id: null });
    setBusy(null);
    if (err) return fail(err.message);
    apply(data as Billing, true);
    flash('Unlinked');
  };

  const saveLocal = async (patch: Record<string, unknown>, ok: string) => {
    setBusy('save');
    setError(null);
    const { data, error: err } = await supabase.rpc('admin_billing_save', { p_account_id: accountId, p_patch: patch });
    setBusy(null);
    if (err) return fail(err.message);
    apply(data as Billing, true);
    flash(ok);
  };

  if (!b) return <p className="py-16 text-center text-sm text-slate-400">{error ?? 'Loading billing…'}</p>;

  const g = guaranteeView(b.guarantee);
  const required = b.guarantee.required ?? 2;
  const pct = Math.min(100, Math.round(((b.guarantee.booked ?? 0) / required) * 100));
  const subLabel = b.stripe.status ? SUBSCRIPTION_LABEL[b.stripe.status] ?? b.stripe.status : 'No subscription yet';

  return (
    <div className="space-y-8">
      {error && <Notice tone="error">{error}</Notice>}
      {note && <Notice tone="ok">{note}</Notice>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm leading-relaxed text-slate-400">
          Stripe takes the payments. Everything on this page is read from Stripe automatically; nothing here needs typing in. Change the plan or refund in Stripe.
        </p>
        <Updated at={updatedAt} refreshing={refreshing} onRefresh={refresh} />
      </div>

      {!b.linked ? (
        <Card title="Connect to Stripe" hint="Link this client to their customer in Stripe. The plan, price, payments and invoices then appear here and stay up to date.">
          <Field id="st-cus" label="Stripe customer id" hint="In Stripe, open Customers, then the customer. The id starts with cus_.">
            <input id="st-cus" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="cus_..." autoCapitalize="off" autoCorrect="off" className={inputCls} />
          </Field>
          <Button onClick={link} disabled={busy === 'link' || !customer.trim()}>
            {busy === 'link' ? 'Linking…' : 'Link and sync'}
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {([
              ['Plan', b.stripe.price_label || b.plan],
              ['Monthly', b.monthly_price_cents ? centsToDollars(b.monthly_price_cents) : '—'],
              ['Paid to date', centsToDollars(b.paid_cents)],
              ['Open balance', centsToDollars(b.open_cents)],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/[0.07] bg-[#0f1424] p-5">
                <div className="text-sm text-slate-400">{label}</div>
                <div className={`mt-2 truncate font-display text-2xl font-bold tracking-tight ${label === 'Open balance' && b.open_cents > 0 ? 'text-red-300' : 'text-slate-100'}`}>{value}</div>
              </div>
            ))}
          </div>

          <Card
            title="Subscription"
            action={<Chip tone={statusTone(b.stripe.status)}>{subLabel}</Chip>}
          >
            <Row label="Next invoice" value={b.stripe.current_period_end ? day(b.stripe.current_period_end) : ''} />
            <Row label="Card on file" value={b.stripe.payment_method || ''} />
            <Row label="Last synced" value={b.stripe.synced_at ? relativeTime(b.stripe.synced_at) : 'Not yet'} />
            {b.stripe.cancel_at_period_end && <Notice tone="error">This subscription is set to cancel at the end of the current period.</Notice>}
            <div className="flex flex-wrap items-center gap-3">
              <Button tone="quiet" onClick={sync} disabled={busy === 'sync'}>{busy === 'sync' ? 'Syncing…' : 'Sync now'}</Button>
              <a
                href={stripeCustomerUrl(b.stripe.customer_id || '')}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 font-display text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.07]"
              >
                Open in Stripe
              </a>
              <Button tone={confirming ? 'danger' : 'quiet'} onClick={unlink} disabled={busy === 'unlink'}>
                {confirming ? 'Confirm: unlink' : 'Unlink'}
              </Button>
            </div>
          </Card>

          <Card title="Invoices" hint="The latest 24, mirrored from Stripe.">
            {b.invoices.length === 0 ? (
              <p className="text-sm text-slate-400">No invoices yet.</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {b.invoices.map((i) => (
                  <li key={i.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-display text-base font-bold text-slate-100">{centsToDollars(i.status === 'paid' ? i.amount_paid_cents : i.amount_due_cents)}</span>
                        <Chip tone={i.status === 'paid' ? 'ok' : i.status === 'open' ? 'gold' : 'plain'}>{INVOICE_LABEL[i.status] ?? i.status}</Chip>
                      </div>
                      <div className="mt-1 text-sm text-slate-400">
                        {i.number || 'Invoice'} · {day(i.issued_at)}
                      </div>
                    </div>
                    {i.hosted_invoice_url && (
                      <a href={i.hosted_invoice_url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#ffc174] underline-offset-4 hover:underline">
                        View invoice
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

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
        <Row label="Went live" value={b.go_live_at ? day(b.go_live_at) : 'Not yet'} />
        <Row label="Window ends" value={b.guarantee.window_end ? day(b.guarantee.window_end) : 'Not yet'} />
        <Row label="Missed calls in the window" value={`${b.guarantee.missed_calls ?? 0} (${b.guarantee.calls_per_week ?? 0} a week)`} />
        {b.guarantee.status === 'credit_due' && b.stripe.customer_id && (
          <Notice tone="error">A free month is owed. Apply a credit to the next invoice in Stripe, then mark it as given below.</Notice>
        )}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="g-override" label="Decision" hint="Override the result by hand.">
            <select
              id="g-override"
              value={override}
              onChange={(e) => { dirty.current = true; setOverride(e.target.value); }}
              style={{ colorScheme: 'dark' }}
              className={inputCls}
            >
              <option value="">Follow the numbers</option>
              <option value="credited">Free month given</option>
              <option value="waived">Waived</option>
            </select>
          </Field>
          <Field id="g-live" label="Went live on" hint="Set automatically when the engine is first turned on.">
            <input id="g-live" type="date" value={goLive} onChange={(e) => { dirty.current = true; setGoLive(e.target.value); }} style={{ colorScheme: 'dark' }} className={inputCls} />
          </Field>
        </div>
        <Button onClick={() => saveLocal({ guarantee_override: override || null, go_live_at: goLive ? `${goLive}T12:00:00Z` : null }, 'Saved')} disabled={busy === 'save'}>
          {busy === 'save' ? 'Saving…' : 'Save guarantee'}
        </Button>
      </Card>

      <Card title="Notes" hint="Private to the admin team. Not shown to the client.">
        <Field id="bn-notes" label="Billing notes">
          <textarea id="bn-notes" value={notes} onChange={(e) => { dirty.current = true; setNotes(e.target.value); }} rows={3} maxLength={1000} className={`${inputCls} h-auto py-3`} />
        </Field>
        <Button onClick={() => saveLocal({ notes: notes.trim() || null }, 'Saved')} disabled={busy === 'save'}>
          {busy === 'save' ? 'Saving…' : 'Save notes'}
        </Button>
      </Card>
    </div>
  );
};
