import { supabase } from '../../lib/supabase';
import { rpc } from '../http';
import { googleCalendarApi } from '../integrations/googleCalendar';

/** The owner's Setup page: their steps, what we asked for, and sending it. */
export const setupOwnerApi = {
  steps: () => supabase.from('setup_steps').select('*').order('sort_order', { ascending: true }),
  calendarConnection: () => supabase.from('calendar_connections').select('provider, status, calendar_label').maybeSingle(),
  submitInfo: (stepKey: string, values: Record<string, string>) => rpc<{ ok: boolean }>('owner_submit_step_info', { p_step_key: stepKey, p_response: values }),
  connectCalendar: (accountId: string) => googleCalendarApi.start(accountId, 'client'),
  syncCalendar: (accountId: string | null) => (accountId ? googleCalendarApi.sync(accountId) : Promise.resolve(null)),
};
