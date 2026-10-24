import { rpc } from '../http';
import type { Controls } from '../../domain';

export const controlsApi = {
  get: (accountId: string) => rpc<Controls>('admin_get_controls', { p_account_id: accountId }),
  update: (accountId: string, patch: Record<string, unknown>) => rpc<Controls>('admin_update_controls', { p_account_id: accountId, p_patch: patch }),
  setEngine: (accountId: string, enabled: boolean) => rpc<unknown>('admin_set_engine_enabled', { p_account_id: accountId, p_enabled: enabled }),
  retryFailed: (accountId: string) => rpc<number>('admin_retry_failed_events', { p_account_id: accountId }),
};
