// Google sends the person back here after they say yes. We swap the one-time code for a refresh token,
// keep it encrypted, mark the calendar connected, and send them back to the dashboard.
//   npx supabase functions deploy calendar-callback --no-verify-jwt
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_STATE_SECRET, APP_URL (like https://dashboard.wedgescale.com)
// In Google Cloud, add this exact address as an authorised redirect URI:
//   https://<project-ref>.supabase.co/functions/v1/calendar-callback
import { createClient } from 'npm:@supabase/supabase-js@2';
import { TOKEN_ENDPOINT, emailFromIdToken, hasCalendarScope, returnUrl, verifyState } from '../_shared/google.ts';

Deno.serve(async (req) => {
  const appUrl = Deno.env.get('APP_URL') || '';
  const url = new URL(req.url);
  const state = await verifyState(url.searchParams.get('state') || '', Deno.env.get('OAUTH_STATE_SECRET') || '');
  if (!state) return new Response('This link has expired. Go back to the dashboard and try again.', { status: 400 });

  const back = (result: 'connected' | 'error') => Response.redirect(returnUrl(appUrl, state, result), 302);

  const code = url.searchParams.get('code');
  if (url.searchParams.get('error') || !code) return back('error');

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  try {
    const res = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: Deno.env.get('GOOGLE_CLIENT_ID')!,
        client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
        redirect_uri: `${Deno.env.get('SUPABASE_URL')}/functions/v1/calendar-callback`,
        grant_type: 'authorization_code',
      }),
    });
    const tokens = await res.json();
    if (!res.ok || !tokens.refresh_token || !hasCalendarScope(tokens.scope)) {
      console.error('calendar-callback: no usable token', res.status, tokens.error, Boolean(tokens.refresh_token), tokens.scope);
      await db.rpc('engine_calendar_failed', { p_account: state.a, p_status: 'error', p_error: tokens.refresh_token ? 'Calendar access was not allowed on the Google screen.' : 'Google did not return a long-lived sign-in.' });
      return back('error');
    }

    await db.rpc('engine_store_calendar_token', { p_account: state.a, p_token: tokens.refresh_token });
    await db.rpc('engine_calendar_connected', {
      p_account: state.a, p_provider: 'google', p_calendar_id: 'primary', p_label: emailFromIdToken(tokens.id_token) ?? 'Google Calendar',
    });
    return back('connected');
  } catch (e) {
    console.error('calendar-callback failed', (e as Error).message);
    return back('error');
  }
});
