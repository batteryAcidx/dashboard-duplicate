import { rpc } from '../http';
import { emailApi } from '../integrations/email';
import type { InfoField, SetupOverview } from '../../domain';

export interface StepRequestInput {
  prompt: string;
  fields: InfoField[];
  action: string | null;
  link?: string | null;
  linkLabel?: string | null;
}

export const setupApi = {
  overview: (accountId: string) => rpc<SetupOverview>('admin_setup_overview', { p_account_id: accountId }),
  setRequest: (accountId: string, stepKey: string, r: StepRequestInput) =>
    rpc<unknown>('admin_set_step_request', {
      p_account_id: accountId, p_step_key: stepKey, p_prompt: r.prompt, p_fields: r.fields, p_action: r.action,
      p_link: r.link ?? null, p_link_label: r.linkLabel ?? null,
    }),
  applyToBusiness: (accountId: string, stepKey: string) => rpc<unknown>('admin_apply_step_info_to_business', { p_account_id: accountId, p_step_key: stepKey }),
  sendEmail: emailApi.send,
};
