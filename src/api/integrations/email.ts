import { invoke } from '../http';

/** Sending an email to a client's owner from the admin (see src/integrations/email). */
export const emailApi = {
  send: (accountId: string, stepKey: string | null, subject: string, body: string) =>
    invoke<{ ok: boolean; to: string }>('send-client-email', { account_id: accountId, step_key: stepKey, subject, body }),
};
