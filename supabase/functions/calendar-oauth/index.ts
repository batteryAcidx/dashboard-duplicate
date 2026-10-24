// Starts a Google Calendar connection, or ends one. Called from the admin Calendar tab and the client's Setup page.
//   npx supabase functions deploy calendar-oauth
// Secrets: GOOGLE_CLIENT_ID, OAUTH_STATE_SECRET (any long random string)
// body: { action: 'start' | 'disconnect', account_id, return_to?: 'admin' | 'client' }
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authorize } from '../_shared/authz.ts';
import { REVOKE_ENDPOINT, buildAuthUrl, randomNonce, signState } from '../_shared/google.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { action?: string; account_id?: string; return_to?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const accountId = String(body.account_id || '');
  if (!accountId) return json({ error: 'account_id is required.' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const caller = await authorize(db, req.headers.get('authorization'), accountId);
  if (!caller) return json({ error: 'Forbidden' }, 403);

  if (body.action === 'start') {
    const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
    const secret = Deno.env.get('OAUTH_STATE_SECRET');
    if (!clientId || !secret) return json({ error: 'Google is not set up yet. Add GOOGLE_CLIENT_ID and OAUTH_STATE_SECRET.' }, 500);
    const state = await signState(
      { a: accountId, u: caller.userId, r: caller.role === 'admin' && body.return_to !== 'client' ? 'admin' : 'client', exp: Math.floor(Date.now() / 1000) + 600, n: randomNonce() },
      secret,
    );
    const redirectUri = `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-callback`;
    return json({ url: buildAuthUrl({ clientId, redirectUri, state }) });
  }

  if (body.action === 'disconnect') {
    // take the permission back at Google, then forget the token and every blocked time we copied
    const { data: token } = await db.rpc('engine_get_calendar_token', { p_account: accountId });
    if (token) {
      try {
        await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token as string)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      } catch {
        /* if Google cannot be reached, we still forget the token on our side */
      }
    }
    await db.rpc('engine_delete_calendar_token', { p_account: accountId });
    await db.from('calendar_busy').delete().eq('account_id', accountId);
    await db.from('calendar_outbox').update({ status: 'failed', last_error: 'Calendar disconnected', locked_at: null }).eq('account_id', accountId).in('status', ['pending', 'sending']);
    await db.from('calendar_connections').update({
      provider: 'none', status: 'not_connected', external_calendar_id: null, calendar_label: null, sync_cursor: null, sync_requested_at: null, last_error: null,
    }).eq('account_id', accountId);
    return json({ ok: true });
  }

  return json({ error: 'Unknown action' }, 400);
});
