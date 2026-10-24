import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  cardLabel, customerIdOf, parseSignatureHeader, planEvent, trimInvoice, trimSubscription, verifyStripeSignature,
} from '../supabase/functions/_shared/stripe.ts';

const SECRET = 'whsec_test_secret';
const NOW = 1_790_000_000;
const sign = (payload: string, t = NOW, secret = SECRET) => `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;

describe('stripe signature', () => {
  const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });

  test('a genuine, recent request passes', async () => {
    assert.equal(await verifyStripeSignature(body, sign(body), SECRET, NOW), true);
  });
  test('the wrong secret, a changed body, or no header all fail', async () => {
    assert.equal(await verifyStripeSignature(body, sign(body, NOW, 'whsec_other'), SECRET, NOW), false);
    assert.equal(await verifyStripeSignature(body + ' ', sign(body), SECRET, NOW), false);
    assert.equal(await verifyStripeSignature(body, null, SECRET, NOW), false);
    assert.equal(await verifyStripeSignature(body, sign(body), '', NOW), false);
  });
  test('an old request cannot be replayed', async () => {
    assert.equal(await verifyStripeSignature(body, sign(body, NOW - 301), SECRET, NOW), false);
    assert.equal(await verifyStripeSignature(body, sign(body, NOW - 299), SECRET, NOW), true);
    assert.equal(await verifyStripeSignature(body, sign(body, NOW + 400), SECRET, NOW), false, 'a timestamp from the future is refused too');
  });
  test('Stripe may send more than one signature while rotating secrets', async () => {
    const good = sign(body).split(',')[1];
    assert.equal(await verifyStripeSignature(body, `t=${NOW},v1=deadbeef,${good}`, SECRET, NOW), true);
  });
  test('a garbled header is refused', async () => {
    assert.equal(parseSignatureHeader('nonsense'), null);
    assert.equal(parseSignatureHeader('t=abc,v1=x'), null);
    assert.equal(await verifyStripeSignature(body, 'v1=abc', SECRET, NOW), false);
    assert.deepEqual(parseSignatureHeader('t=5, v1=aa, v1=bb'), { t: 5, v1: ['aa', 'bb'] });
  });
});

const subscription = {
  id: 'sub_1', status: 'active', cancel_at_period_end: false, current_period_end: 1798000000, customer: 'cus_abc123456',
  collection_method: 'charge_automatically', metadata: { secret: 'do not keep' },
  items: { data: [{ id: 'si_1', current_period_end: 1798000000, price: { id: 'price_1', unit_amount: 69700, nickname: 'Standard', recurring: { interval: 'month' }, metadata: { x: 1 } } }] },
};
const invoice = {
  id: 'in_1', number: 'A-0001', status: 'paid', amount_due: 69700, amount_paid: 69700, currency: 'usd', customer: 'cus_abc123456',
  hosted_invoice_url: 'https://invoice.stripe.com/i/x', created: 1797000000, period_start: 1797000000, period_end: 1799600000,
  status_transitions: { paid_at: 1797000100 }, customer_email: 'private@example.com', lines: { data: [] },
};

describe('stripe events', () => {
  test('a subscription event keeps only what we use', () => {
    const plan = planEvent({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: subscription } });
    assert.equal(plan.kind, 'subscription');
    if (plan.kind !== 'subscription') return;
    assert.equal(plan.customerId, 'cus_abc123456');
    assert.deepEqual(plan.data, {
      id: 'sub_1', status: 'active', cancel_at_period_end: false, current_period_end: 1798000000,
      items: { data: [{ current_period_end: 1798000000, price: { unit_amount: 69700, nickname: 'Standard', recurring: { interval: 'month' } } }] },
    });
    assert.doesNotMatch(JSON.stringify(plan.data), /do not keep|metadata/);
  });

  test('created, updated and deleted subscriptions are all followed', () => {
    for (const type of ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']) {
      assert.equal(planEvent({ id: 'e', type, data: { object: subscription } }).kind, 'subscription');
    }
  });

  test('an invoice event keeps only what we use, and never the customer email', () => {
    const plan = planEvent({ id: 'evt_2', type: 'invoice.paid', data: { object: invoice } });
    assert.equal(plan.kind, 'invoice');
    if (plan.kind !== 'invoice') return;
    assert.equal(plan.data.amount_paid, 69700);
    assert.equal(plan.data.hosted_invoice_url, 'https://invoice.stripe.com/i/x');
    assert.equal(plan.data.status_transitions.paid_at, 1797000100);
    assert.doesNotMatch(JSON.stringify(plan.data), /private@example\.com/);
    for (const type of ['invoice.created', 'invoice.finalized', 'invoice.payment_failed', 'invoice.voided', 'invoice.payment_succeeded']) {
      assert.equal(planEvent({ id: 'e', type, data: { object: invoice } }).kind, 'invoice');
    }
  });

  test('a card added to a customer becomes a short label', () => {
    const plan = planEvent({ id: 'evt_3', type: 'payment_method.attached', data: { object: { customer: 'cus_abc123456', card: { brand: 'visa', last4: '4242' } } } });
    assert.deepEqual(plan, { kind: 'payment_method', customerId: 'cus_abc123456', label: 'Visa ending 4242' });
    assert.equal(cardLabel({ brand: 'amex' }), 'Amex');
    assert.equal(planEvent({ id: 'e', type: 'payment_method.attached', data: { object: { customer: 'cus_abc123456', type: 'us_bank_account' } } }).kind, 'ignore');
  });

  test('events we do not use, or that have no customer, are ignored safely', () => {
    assert.equal(planEvent({ id: 'e', type: 'charge.succeeded', data: { object: { customer: 'cus_abc123456' } } }).kind, 'ignore');
    assert.equal(planEvent({ id: 'e', type: 'invoice.paid', data: { object: { id: 'in_x' } } }).kind, 'ignore');
    assert.equal(planEvent({ id: 'e', type: 'customer.subscription.updated', data: { object: { id: 'sub_x', status: 'active' } } }).kind, 'ignore');
    assert.equal(planEvent({ id: '', type: 'invoice.paid', data: { object: invoice } }).kind, 'ignore');
    assert.equal(planEvent({ id: 'e', type: 'invoice.paid' } as never).kind, 'ignore');
  });

  test('an expanded customer object still gives the id', () => {
    assert.equal(customerIdOf({ customer: { id: 'cus_zzz999999', email: 'x' } }), 'cus_zzz999999');
    assert.equal(customerIdOf({ customer: null }), null);
  });

  test('newer Stripe versions put the period end on the item, and it is still found', () => {
    const t = trimSubscription({ id: 's', status: 'active', items: { data: [{ current_period_end: 1800000000, price: { unit_amount: 100, recurring: { interval: 'month' } } }] } });
    assert.equal(t.current_period_end, null);
    assert.equal(t.items.data[0].current_period_end, 1800000000);
    assert.equal(trimSubscription({ id: 's', status: 'canceled', items: { data: [] } }).items.data.length, 0);
    assert.equal(trimInvoice({ id: 'i' }).status, 'open');
  });
});
