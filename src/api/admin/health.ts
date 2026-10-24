import { rpc } from '../http';
import type { Health } from '../../domain';

export const healthApi = {
  get: (accountId: string, days: number) => rpc<Health>('admin_client_health', { p_account_id: accountId, p_days: days }),
};
