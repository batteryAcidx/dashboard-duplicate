// Receives events from Stripe and mirrors them into the dashboard database.
// Deploy with JWT verification OFF (Stripe does not send a Supabase token):
//   npx supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets needed: STRIPE_WEBHOOK_SECRET (Stripe > Developers > Webhooks > the endpoint > Signing secret).
// In Stripe, point a webhook endpoint at https://<project-ref>.supabase.co/functions/v1/stripe-webhook and send:
//   customer.subscription.created, customer.subscription.updated, customer.subscription.deleted,
//   invoice.created, invoice.finalized, invoice.paid, invoice.payment_failed, invoice.voided, payment_method.attached
import { createClient } from 'npm:@supabase/supabase-js@2';
import { planEvent, verifyStripeSignature } from '../_shared/stripe.ts';
import type { StripeEvent } from '../_shared/stripe.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  // the signature is checked against the exact bytes Stripe sent, so read the raw body first
  const payload = await req.text();
  const valid = await verifyStripeSignature(payload, req.headers.get('stripe-signature'), Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '');
  if (!valid) return new Response('Invalid signature', { status: 400 });

  let event: StripeEvent;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  const plan = planEvent(event);
  if (plan.kind === 'ignore') return json({ received: true, ignored: plan.reason });

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { error } =
    plan.kind === 'subscription'
      ? await db.rpc('engine_stripe_record_subscription', { p_event_id: event.id, p_type: event.type, p_customer_id: plan.customerId, p_data: plan.data })
      : plan.kind === 'invoice'
      ? await db.rpc('engine_stripe_record_invoice', { p_event_id: event.id, p_type: event.type, p_customer_id: plan.customerId, p_data: plan.data })
      : await db.rpc('engine_stripe_record_payment_method', { p_event_id: event.id, p_type: event.type, p_customer_id: plan.customerId, p_label: plan.label });

  if (error) {
    console.error('stripe-webhook: could not record', event.type, event.id, error.message);
    return new Response('Could not record the event', { status: 500 }); // Stripe will try again
  }
  return json({ received: true });
});
