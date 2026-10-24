import { invoke, rpc } from '../http';
import type { Billing } from '../../domain';

/** Stripe. Payments happen in Stripe; this only links a client to their Stripe customer and reads what Stripe says. */
export const stripeApi = {
  link: (accountId: string, customerId: string | null) => rpc<Billing>('admin_billing_link_stripe', { p_account_id: accountId, p_customer_id: customerId }),
  sync: (accountId: string) => invoke<{ ok: boolean }>('stripe-sync', { account_id: accountId }),
};
