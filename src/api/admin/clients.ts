import { invoke, rpc } from '../http';
import type { Result } from '../http';
import { isConfigured } from '../http';

/** The admin server function: list, create, edit and look up clients, territories and setup steps. */
export function callAdmin<T>(action: string, payload: Record<string, unknown> = {}): Promise<Result<T>> {
  return invoke<T>('admin-api', { action, ...payload });
}

export const clientsApi = {
  isConfigured,
  call: callAdmin,
  /** Permanent. Only works for a cancelled client, and only with the right name typed. */
  remove: (accountId: string, confirmName: string) => rpc<boolean>('admin_delete_client', { p_account_id: accountId, p_confirm: confirmName }),
  setLegacyGhl: (accountId: string, locationId: string) => rpc<string | null>('admin_set_legacy_ghl', { p_account_id: accountId, p_location_id: locationId }),
};
