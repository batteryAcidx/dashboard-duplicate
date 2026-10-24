import { rpc } from '../http';
import type { RegistrationSaved } from '../../domain';

export const registrationAdminApi = {
  get: (accountId: string) => rpc<RegistrationSaved>('admin_get_registration', { p_account_id: accountId }),
  /** Shows the full EIN. Every call is written to the activity log. */
  revealEin: (accountId: string) => rpc<string>('admin_reveal_ein', { p_account_id: accountId }),
  setStatus: (accountId: string, status: string, notes: string | null) =>
    rpc<RegistrationSaved>('admin_set_registration_status', { p_account_id: accountId, p_status: status, p_notes: notes }),
};
