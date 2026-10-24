// Pure helpers for the Stripe webhook and the sync button. No network and no database in here,
// so everything can be tested on its own. Works in Deno (Edge Functions) and Node (tests).

const enc = new TextEncoder();

const toHex = (buf: ArrayBuffer): string =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function parseSignatureHeader(header: string): { t: number; v1: string[] } | null {
  let t = NaN;
  const v1: string[] = [];
  for (const part of header.split(',')) {
    const [k, ...rest] = part.trim().split('=');
    const v = rest.join('=');
    if (k === 't') t = Number(v);
    else if (k === 'v1' && v) v1.push(v);
  }
  return Number.isFinite(t) && v1.length > 0 ? { t, v1 } : null;
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Checks that a webhook really came from Stripe: the signature must match the exact body, and the
 * timestamp must be recent (default 5 minutes), so an old request cannot be replayed.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSec: number = Math.floor(Date.now() / 1000),
  toleranceSec = 300,
): Promise<boolean> {
  if (!header || !secret) return false;
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  if (Math.abs(nowSec - parsed.t) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${parsed.t}.${payload}`);
  return parsed.v1.some((sig) => safeEqual(sig, expected));
}

/* ---------------------------------------------------------------- turning Stripe objects into what we keep */

// deno-lint-ignore no-explicit-any
type Obj = Record<string, any>;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Only the fields we use, so we never store or send more of Stripe's data than needed. */
export function trimSubscription(sub: Obj): Obj {
  const item = sub.items?.data?.[0];
  return {
    id: sub.id,
    status: sub.status,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    current_period_end: num(sub.current_period_end),
    items: {
      data: item
        ? [{
            current_period_end: num(item.current_period_end),
            price: {
              unit_amount: num(item.price?.unit_amount),
              nickname: item.price?.nickname ?? null,
              recurring: { interval: item.price?.recurring?.interval ?? 'month' },
            },
          }]
        : [],
    },
  };
}

export function trimInvoice(inv: Obj): Obj {
  return {
    id: inv.id,
    number: inv.number ?? null,
    status: inv.status ?? 'open',
    amount_due: num(inv.amount_due) ?? 0,
    amount_paid: num(inv.amount_paid) ?? 0,
    currency: inv.currency ?? 'usd',
    hosted_invoice_url: inv.hosted_invoice_url ?? null,
    created: num(inv.created),
    period_start: num(inv.period_start),
    period_end: num(inv.period_end),
    status_transitions: { paid_at: num(inv.status_transitions?.paid_at) },
  };
}

export function cardLabel(card: Obj): string {
  const brand = String(card.brand || 'Card');
  const name = brand.charAt(0).toUpperCase() + brand.slice(1);
  return card.last4 ? `${name} ending ${card.last4}` : name;
}

export const customerIdOf = (o: Obj): string | null => {
  const c = o.customer;
  if (typeof c === 'string') return c;
  if (c && typeof c.id === 'string') return c.id;
  return null;
};

export interface StripeEvent {
  id: string;
  type: string;
  data: { object: Obj };
}

export type Plan =
  | { kind: 'subscription'; customerId: string; data: Obj }
  | { kind: 'invoice'; customerId: string; data: Obj }
  | { kind: 'payment_method'; customerId: string; label: string }
  | { kind: 'ignore'; reason: string };

const SUBSCRIPTION_EVENTS = new Set(['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']);
const INVOICE_EVENTS = new Set([
  'invoice.created', 'invoice.finalized', 'invoice.updated', 'invoice.paid', 'invoice.payment_succeeded',
  'invoice.payment_failed', 'invoice.voided', 'invoice.marked_uncollectible',
]);

/** Decides what to do with one Stripe event. */
export function planEvent(ev: StripeEvent): Plan {
  const o = ev?.data?.object;
  if (!ev?.id || !o) return { kind: 'ignore', reason: 'no object' };
  const customerId = customerIdOf(o);

  if (SUBSCRIPTION_EVENTS.has(ev.type)) {
    return customerId ? { kind: 'subscription', customerId, data: trimSubscription(o) } : { kind: 'ignore', reason: 'no customer' };
  }
  if (INVOICE_EVENTS.has(ev.type)) {
    return customerId && o.id ? { kind: 'invoice', customerId, data: trimInvoice(o) } : { kind: 'ignore', reason: 'no customer' };
  }
  if (ev.type === 'payment_method.attached') {
    return customerId && o.card ? { kind: 'payment_method', customerId, label: cardLabel(o.card) } : { kind: 'ignore', reason: 'not a card' };
  }
  return { kind: 'ignore', reason: 'not an event we use' };
}
