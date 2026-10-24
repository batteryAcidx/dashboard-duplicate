import { rpc } from '../http';
import type { Twilio } from '../../domain';

export const twilioApi = {
  get: (accountId: string) => rpc<Twilio>('admin_get_twilio', { p_account_id: accountId }),
  save: (accountId: string, patch: Record<string, string>) => rpc<Twilio>('admin_save_twilio', { p_account_id: accountId, p_patch: patch }),
  storeToken: (accountId: string, token: string) => rpc<Twilio>('admin_store_twilio_token', { p_account_id: accountId, p_token: token }),
};
