// Keeps a client's calendar and ours in step, both ways:
//   1. copies the owner's busy times in, so we never offer a time they are busy
//   2. writes every booked, moved or cancelled inspection out to their calendar
// Runs when an admin or owner presses "Sync now", and on a schedule for everyone.
//   npx supabase functions deploy calendar-sync --no-verify-jwt
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CRON_SECRET (any long random string)
// body: { account_id } with a signed-in admin or owner token, OR {} with the header  x-cron-secret: <CRON_SECRET>
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authorize } from '../_shared/authz.ts';
import { CALENDAR_API, TOKEN_ENDPOINT, appointmentToEvent, eventsToBusy, failureKind } from '../_shared/google.ts';
import type { CalendarAppointment, GEvent } from '../_shared/google.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type Db = any;

async function accessTokenFor(refresh: string) {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json().catch(() => ({}));
  return res.ok && body.access_token
    ? { ok: true as const, token: body.access_token as string }
    : { ok: false as const, kind: failureKind(res.status, body), message: String(body.error_description || body.error || res.status) };
}

async function google(path: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${CALENDAR_API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const body = res.status === 204 ? null : await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, body };
}

async function syncAccount(db: Db, accountId: string) {
  const { data: refresh } = await db.rpc('engine_get_calendar_token', { p_account: accountId });
  if (!refresh) {
    await db.rpc('engine_calendar_failed', { p_account: accountId, p_status: 'needs_reauth', p_error: 'No saved sign-in. Connect the calendar again.' });
    return { ok: false, error: 'not_connected' };
  }
  const access = await accessTokenFor(refresh as string);
  if (!access.ok) {
    await db.rpc('engine_calendar_failed', { p_account: accountId, p_status: access.kind === 'needs_reauth' ? 'needs_reauth' : 'error', p_error: access.message });
    return { ok: false, error: access.message };
  }

  const { data: acct } = await db.from('accounts').select('timezone').eq('id', accountId).maybeSingle();
  const tz = (acct?.timezone as string) || 'America/Chicago';

  // 1. busy times in (the next 30 days)
  const from = new Date();
  const to = new Date(Date.now() + 30 * 86400_000);
  const items: GEvent[] = [];
  let pageToken = '';
  for (let page = 0; page < 8; page++) {
    const q = new URLSearchParams({
      timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
      fields: 'nextPageToken,items(id,status,transparency,start,end,extendedProperties/private)',
    });
    if (pageToken) q.set('pageToken', pageToken);
    const r = await google(`/calendars/primary/events?${q}`, access.token);
    if (!r.ok) {
      const kind = failureKind(r.status, r.body);
      await db.rpc('engine_calendar_failed', { p_account: accountId, p_status: kind === 'needs_reauth' ? 'needs_reauth' : 'error', p_error: `Google said ${r.status} while reading the calendar.` });
      return { ok: false, error: `read ${r.status}` };
    }
    items.push(...((r.body?.items as GEvent[]) ?? []));
    pageToken = (r.body?.nextPageToken as string) || '';
    if (!pageToken) break;
  }
  const busy = eventsToBusy(items, tz);
  const { error: busyErr } = await db.rpc('engine_replace_busy', { p_account: accountId, p_from: from.toISOString(), p_to: to.toISOString(), p_rows: busy });
  if (busyErr) return { ok: false, error: busyErr.message };

  // 2. inspections out
  let written = 0;
  for (let batch = 0; batch < 3; batch++) {
    const { data: rows } = await db.rpc('engine_claim_calendar_outbox_for', { p_account: accountId, p_limit: 10 });
    if (!rows || rows.length === 0) break;
    for (const row of rows as { id: string; appointment_id: string; action: string }[]) {
      const { data: appt } = await db.rpc('engine_calendar_appointment', { p_appointment_id: row.appointment_id });
      if (!appt) {
        await db.rpc('engine_finish_calendar_outbox', { p_id: row.id, p_ok: true });
        continue;
      }
      const a = appt as CalendarAppointment & { external_id: string | null };
      let r;
      if (row.action === 'delete') {
        r = a.external_id ? await google(`/calendars/primary/events/${a.external_id}?sendUpdates=none`, access.token, { method: 'DELETE' }) : { ok: true, status: 204, body: null };
      } else if (a.external_id) {
        r = await google(`/calendars/primary/events/${a.external_id}?sendUpdates=none`, access.token, { method: 'PATCH', body: JSON.stringify(appointmentToEvent(a)) });
      } else {
        r = await google('/calendars/primary/events?sendUpdates=none', access.token, { method: 'POST', body: JSON.stringify(appointmentToEvent(a)) });
      }
      const kind = r.ok ? 'ok' : failureKind(r.status, r.body);
      if (r.ok || (row.action === 'delete' && kind === 'gone')) {
        await db.rpc('engine_finish_calendar_outbox', { p_id: row.id, p_ok: true, p_error: null, p_external_id: (r.body?.id as string) ?? a.external_id ?? null, p_etag: (r.body?.etag as string) ?? null });
        written++;
      } else {
        await db.rpc('engine_finish_calendar_outbox', { p_id: row.id, p_ok: false, p_error: `Google said ${r.status}` });
        if (kind === 'needs_reauth') {
          await db.rpc('engine_calendar_failed', { p_account: accountId, p_status: 'needs_reauth', p_error: `Google said ${r.status} while writing.` });
          return { ok: false, error: 'needs_reauth', imported: busy.length, written };
        }
      }
    }
  }
  return { ok: true, imported: busy.length, written };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  let body: { account_id?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* an empty body is fine for the scheduled run */
  }

  // the scheduled run: every connected client that is due
  const cron = req.headers.get('x-cron-secret');
  if (cron && cron === Deno.env.get('CRON_SECRET')) {
    const { data: due } = await db.rpc('engine_calendar_accounts_due');
    const results: Record<string, unknown> = {};
    for (const id of ((due as string[]) ?? []).slice(0, 25)) results[id] = await syncAccount(db, id);
    return json({ ok: true, synced: Object.keys(results).length });
  }

  const accountId = String(body.account_id || '');
  if (!accountId) return json({ error: 'account_id is required.' }, 400);
  const caller = await authorize(db, req.headers.get('authorization'), accountId);
  if (!caller) return json({ error: 'Forbidden' }, 403);

  const r = await syncAccount(db, accountId);
  return r.ok ? json(r) : json({ error: 'The sync did not complete. The Calendar tab shows why.', detail: r.error }, 502);
});
