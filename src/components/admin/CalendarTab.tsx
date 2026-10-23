import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button, Card, Chip, Field, Notice, Row, inputCls } from '../ui';
import { adminErrorText } from '../../lib/adminTools';

export interface Cal {
  provider: string;
  status: string;
  calendar_label: string | null;
  external_calendar_id: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  sync_requested_at: string | null;
  busy_blocks: number;
  pending_writes: number;
  failed_writes: number;
  synced_appointments: number;
  upcoming_appointments: number;
}

const PROVIDERS: [string, string][] = [['none', 'None'], ['google', 'Google Calendar'], ['microsoft', 'Microsoft Outlook'], ['ics', 'Calendar feed (read only)']];
const STATUSES: [string, string][] = [['not_connected', 'Not connected'], ['active', 'Connected'], ['needs_reauth', 'Needs the owner to sign in again'], ['error', 'Error']];

const ago = (iso: string | null): string => {
  if (!iso) return 'Never';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

const tone = (status: string): 'ok' | 'gold' | 'danger' | 'plain' =>
  status === 'active' ? 'ok' : status === 'needs_reauth' ? 'gold' : status === 'error' ? 'danger' : 'plain';

export const CalendarTab: React.FC<{ accountId: string; onDenied: () => void; initial?: Cal }> = ({ accountId, onDenied, initial }) => {
  const [cal, setCal] = useState<Cal | null>(initial ?? null);
  const [provider, setProvider] = useState(initial?.provider ?? 'none');
  const [status, setStatus] = useState(initial?.status ?? 'not_connected');
  const [calId, setCalId] = useState(initial?.external_calendar_id ?? '');
  const [label, setLabel] = useState(initial?.calendar_label ?? '');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const apply = (c: Cal & { external_calendar_id: string | null }) => {
    setCal(c);
    setProvider(c.provider);
    setStatus(c.status);
    setCalId(c.external_calendar_id ?? '');
    setLabel(c.calendar_label ?? '');
  };

  const fail = (message: string) => {
    if (message.includes('forbidden')) return onDenied();
    setError(adminErrorText(message));
  };

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.rpc('admin_calendar_status', { p_account_id: accountId });
    if (err) return fail(err.message);
    setError(null);
    apply(data as Cal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (key: string, fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, ok: string) => {
    setBusy(key);
    setError(null);
    setNote(null);
    const { data, error: err } = await fn();
    setBusy(null);
    if (err) return fail(err.message);
    apply(data as Cal);
    setNote(ok);
    setTimeout(() => setNote(null), 4000);
  };

  const save = () =>
    run('save', () => supabase.rpc('admin_calendar_set', { p_account_id: accountId, p_provider: provider, p_calendar_id: calId.trim() || null, p_label: label.trim() || null, p_status: status }), 'Saved');

  const requestSync = () => run('sync', () => supabase.rpc('admin_calendar_request_sync', { p_account_id: accountId }), 'Sync requested');

  const disconnect = async () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 6000);
      return;
    }
    setConfirming(false);
    await run('disconnect', () => supabase.rpc('admin_calendar_disconnect', { p_account_id: accountId }), 'Disconnected');
  };

  if (!cal) return <p className="py-16 text-center text-sm text-slate-400">{error ?? 'Loading calendar…'}</p>;
  const active = cal.status === 'active';

  return (
    <div className="space-y-8">
      {error && <Notice tone="error">{error}</Notice>}

      <Card
        title="Calendar connection"
        hint="The owner's real calendar blocks times we would otherwise offer, and every booked inspection is written to it."
        action={<Chip tone={tone(cal.status)}>{STATUSES.find(([v]) => v === cal.status)?.[1] ?? cal.status}</Chip>}
      >
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="cal-provider" label="Calendar">
            <select id="cal-provider" value={provider} onChange={(e) => setProvider(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls}>
              {PROVIDERS.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
          <Field id="cal-status" label="Status">
            <select id="cal-status" value={status} onChange={(e) => setStatus(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls}>
              {STATUSES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
          <Field id="cal-id" label="Calendar ID or email" hint="Usually the owner's Google or Outlook address.">
            <input id="cal-id" value={calId} onChange={(e) => setCalId(e.target.value)} placeholder="owner@company.com" className={inputCls} />
          </Field>
          <Field id="cal-label" label="Label" hint="A name you will recognise, like the crew calendar.">
            <input id="cal-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} className={inputCls} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save connection'}</Button>
          <Button tone="quiet" onClick={requestSync} disabled={!active || busy === 'sync'}>{busy === 'sync' ? 'Requesting…' : 'Request sync'}</Button>
          <Button tone={confirming ? 'danger' : 'quiet'} onClick={disconnect} disabled={cal.provider === 'none' || busy === 'disconnect'}>
            {confirming ? 'Confirm: disconnect' : 'Disconnect'}
          </Button>
          {note && <Notice tone="ok">{note}</Notice>}
        </div>
        {cal.last_error && <Notice tone="error">Last error: {cal.last_error}</Notice>}
      </Card>

      <Card title="Sync status">
        <Row label="Last synced" value={ago(cal.last_synced_at)} />
        <Row label="Sync requested" value={cal.sync_requested_at ? ago(cal.sync_requested_at) : 'Not requested'} />
        <Row label="Blocked times imported" value={String(cal.busy_blocks)} />
        <Row label="Waiting to write to the calendar" value={String(cal.pending_writes)} />
        <Row label="Failed writes" value={String(cal.failed_writes)} />
        <Row label="Upcoming inspections" value={String(cal.upcoming_appointments)} />
        <Row label="Inspections on the calendar" value={String(cal.synced_appointments)} />
      </Card>

      <Card title="How this works">
        <p className="text-sm leading-relaxed text-slate-400">
          Marking a Google or Microsoft calendar as Connected makes every new booking, change and cancellation queue up for that calendar, with retries.
          The background sync service reads the queue and imports the owner's busy times, so the assistant never offers a time they are already busy.
          The sign-in step that gives us permission to read the calendar is the next piece to build. Until it is live, keep the calendar as Not connected,
          and availability comes from office hours and the owner's blocked times.
        </p>
      </Card>
    </div>
  );
};
