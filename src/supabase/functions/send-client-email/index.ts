// Sends an email to a client's owner from the admin, and keeps a record of it.
//   npx supabase functions deploy send-client-email
// Secrets: RESEND_API_KEY, EMAIL_FROM (like  WedgeScale <contact@wedgescale.com>, a domain verified in Resend),
//          EMAIL_REPLY_TO (optional, defaults to the from address)
// body: { account_id, step_key?, subject, body }. The recipient is always the client's owner, looked up here, never typed.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { authorize } from '../_shared/authz.ts';
import { isEmail, textToHtml, validateEmailInput } from '../_shared/email.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let input: { account_id?: string; step_key?: string; subject?: unknown; body?: unknown } = {};
  try {
    input = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const accountId = String(input.account_id || '');
  if (!accountId) return json({ error: 'account_id is required.' }, 400);

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const caller = await authorize(db, req.headers.get('authorization'), accountId, { adminOnly: true });
  if (!caller) return json({ error: 'Forbidden' }, 403);

  const v = validateEmailInput(input.subject, input.body);
  if (!v.ok) return json({ error: v.error }, 400);

  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!key || !from) return json({ error: 'Email sending is not set up yet. Use "Open in my email app" for now.' }, 500);

  // the owner of this client, found here so the message can never be sent anywhere else
  const { data: profile } = await db.from('profiles').select('id').eq('account_id', accountId).limit(1).maybeSingle();
  const { data: owner } = profile ? await db.auth.admin.getUserById(profile.id) : { data: null };
  const to = owner?.user?.email as string | undefined;
  if (!to || !isEmail(to)) return json({ error: 'This client has no owner email yet.' }, 400);

  let status: 'sent' | 'failed' = 'sent';
  let providerId: string | null = null;
  let errorText: string | null = null;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], reply_to: Deno.env.get('EMAIL_REPLY_TO') || from, subject: v.subject, text: v.body, html: textToHtml(v.body) }),
    });
    const out = await res.json().catch(() => ({}));
    if (res.ok) providerId = (out.id as string) ?? null;
    else {
      status = 'failed';
      errorText = `Resend said ${res.status}: ${String(out.message || out.name || '').slice(0, 200)}`;
    }
  } catch (e) {
    status = 'failed';
    errorText = `Could not reach the email service: ${(e as Error).message}`.slice(0, 300);
  }

  await db.rpc('engine_log_setup_email', {
    p_account: accountId, p_step_key: input.step_key || null, p_to: to, p_subject: v.subject, p_body: v.body,
    p_sent_by: caller.userId, p_status: status, p_provider_id: providerId, p_error: errorText,
  });

  return status === 'sent' ? json({ ok: true, to }) : json({ error: 'The email could not be sent. It is saved in the log as failed.', detail: errorText }, 502);
});
