import { rpc } from '../http';
import type { Business } from '../../domain';

export const businessApi = {
  get: (accountId: string) => rpc<Business>('admin_get_business', { p_account_id: accountId }),
  save: (accountId: string, patch: Record<string, string>) => rpc<Business>('admin_save_business', { p_account_id: accountId, p_patch: patch }),
};
