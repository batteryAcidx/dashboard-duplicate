import { rpc } from '../http';
import type { RegistrationSaved } from '../../domain';

/** The owner's business registration form. The EIN travels once, to be stored encrypted, and never comes back. */
export const registrationOwnerApi = {
  get: () => rpc<RegistrationSaved>('owner_get_registration'),
  submit: (data: Record<string, unknown>, ein: string | null) => rpc<{ ok: boolean; path: string }>('owner_submit_registration', { p_data: data, p_ein: ein }),
};
