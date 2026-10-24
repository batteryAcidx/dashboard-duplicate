// The 30-day guarantee and how Stripe's words are shown. Pure: no network, no browser.

export interface Guarantee {
  status: string;
  required?: number;
  booked?: number;
  missed_calls?: number;
  calls_per_week?: number;
  days_left?: number;
}

export interface GuaranteeView {
  label: string;
  tone: 'ok' | 'gold' | 'plain' | 'danger';
  detail: string;
}

/** The plain-words state of the 30-day guarantee. */
export function guaranteeView(g: Guarantee): GuaranteeView {
  const booked = g.booked ?? 0;
  const required = g.required ?? 2;
  const perWeek = g.calls_per_week ?? 0;
  switch (g.status) {
    case 'met':
      return { label: 'Met', tone: 'ok', detail: `${booked} inspections booked in the first 30 days.` };
    case 'in_progress':
      return {
        label: 'In progress',
        tone: 'gold',
        detail: `${booked} of ${required} booked, ${g.days_left ?? 0} day${g.days_left === 1 ? '' : 's'} left in the window.`,
      };
    case 'credit_due':
      return {
        label: 'Credit due',
        tone: 'danger',
        detail: `Only ${booked} booked with ${perWeek} missed calls a week. The next month is free.`,
      };
    case 'not_eligible':
      return {
        label: 'Does not apply',
        tone: 'plain',
        detail: `Only ${perWeek} missed calls a week, under the 6 the guarantee needs.`,
      };
    case 'waived':
      return { label: 'Waived', tone: 'plain', detail: 'You marked the guarantee as waived for this client.' };
    case 'credited':
      return { label: 'Credited', tone: 'ok', detail: 'The free month has been given.' };
    default:
      return { label: 'Not started', tone: 'plain', detail: 'The 30 days start when the texting engine is first turned on.' };
  }
}

export const stripeCustomerUrl = (id: string) => `https://dashboard.stripe.com/customers/${id}`;

export const isStripeCustomerId = (id: string) => /^cus_[A-Za-z0-9]{6,60}$/.test(id.trim());

export const SUBSCRIPTION_LABEL: Record<string, string> = {
  active: 'Active', trialing: 'Trial', past_due: 'Past due', unpaid: 'Unpaid', canceled: 'Canceled', paused: 'Paused',
  incomplete: 'Incomplete', incomplete_expired: 'Expired',
};

export const INVOICE_LABEL: Record<string, string> = { paid: 'Paid', open: 'Waiting', draft: 'Draft', void: 'Void', uncollectible: 'Uncollectible' };

