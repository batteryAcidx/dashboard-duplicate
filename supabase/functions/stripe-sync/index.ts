// "Sync now" for one client: pulls their current subscription, invoices and card from Stripe.
// Used right after linking a Stripe customer, so nothing has to wait for the next webhook.
// Called from the admin Billing tab. Only admins signed in with their authenticator code may use it.
//   npx supabase functions deploy stripe-sync
// Secrets needed: STRIPE_SECRET_KEY (a restricted key with read access to Customers, Subscriptions and Invoices is enough).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { cardLabel, trimInvoice, trimSubscription } from '../_shared/stripe.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// the sign-in level is a claim inside the token. The token itself is verified by Supabase below.
function aalOf(jwt: string): string {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return String(payload.aal || '');
  } catch {
    return '';
  }
}

async function stripeGet(path: string, key: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Stripe ${res.status}`);
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
  const url = Deno.env.get('SUPABASE_URL')!;
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const { data: auth } = await db.auth.getUser(jwt);
  const userId = auth?.user?.id;
  if (!userId || aalOf(jwt) !== 'aal2') return json({ error: 'Forbidden' }, 403);
  const { data: admin } = await db.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (!admin) return json({ error: 'Forbidden' }, 403);

  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) return json({ error: 'STRIPE_SECRET_KEY is not set for this function.' }, 500);

  let accountId = '';
  try {
    accountId = String((await req.json()).account_id || '');
  } catch {
    /* handled below */
  }
  if (!accountId) return json({ error: 'account_id is required.' }, 400);

  const { data: billing } = await db.from('account_billing').select('stripe_customer_id').eq('account_id', accountId).maybeSingle();
  const customerId = billing?.stripe_customer_id as string | undefined;
  if (!customerId) return json({ error: 'This client is not linked to a Stripe customer yet.' }, 400);

  try {
    const stamp = Date.now();
    const customer = await stripeGet(`customers/${customerId}?expand[]=invoice_settings.default_payment_method`, key);
    const subs = await stripeGet(`subscriptions?customer=${customerId}&status=all&limit=1`, key);
    const invoices = await stripeGet(`invoices?customer=${customerId}&limit=12`, key);

    let recorded = 0;
    const sub = subs.data?.[0];
    if (sub) {
      const { error } = await db.rpc('engine_stripe_record_subscription', {
        p_event_id: `sync:${sub.id}:${stamp}`, p_type: 'sync', p_customer_id: customerId, p_data: trimSubscription(sub),
      });
      if (error) throw new Error(error.message);
      recorded++;
    }
    for (const inv of invoices.data ?? []) {
      const { error } = await db.rpc('engine_stripe_record_invoice', {
        p_event_id: `sync:${inv.id}:${stamp}`, p_type: 'sync', p_customer_id: customerId, p_data: trimInvoice(inv),
      });
      if (error) throw new Error(error.message);
      recorded++;
    }
    const card = customer.invoice_settings?.default_payment_method?.card;
    if (card) {
      await db.rpc('engine_stripe_record_payment_method', {
        p_event_id: `sync:pm:${customerId}:${stamp}`, p_type: 'sync', p_customer_id: customerId, p_label: cardLabel(card),
      });
    }
    return json({ ok: true, subscription: Boolean(sub), invoices: invoices.data?.length ?? 0, recorded });
  } catch (e) {
    console.error('stripe-sync failed', (e as Error).message);
    return json({ error: 'Could not read from Stripe. Check the secret key and try again.' }, 502);
  }
});
