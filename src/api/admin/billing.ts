import { rpc } from '../http';
import { stripeApi } from '../integrations/stripe';
import type { Billing } from '../../domain';

/** Billing is read from Stripe (see src/integrations/stripe). Only the guarantee and notes are typed in by hand. */
export const billingApi = {
  get: (accountId: string) => rpc<Billing>('admin_billing_get', { p_account_id: accountId }),
  save: (accountId: string, patch: Record<string, unknown>) => rpc<Billing>('admin_billing_save', { p_account_id: accountId, p_patch: patch }),
  linkStripe: stripeApi.link,
  syncStripe: stripeApi.sync,
};
