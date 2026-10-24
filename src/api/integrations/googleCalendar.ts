import { invoke, rpc } from '../http';
import type { Cal } from '../../domain';

/** Google Calendar. Used by the admin Calendar tab and by the owner's Setup page. See src/integrations/googleCalendar. */
export const googleCalendarApi = {
  /** What the admin sees: connected as, last sync, what is waiting. */
  status: (accountId: string) => rpc<Cal>('admin_calendar_status', { p_account_id: accountId }),
  sync: (accountId: string) => invoke<{ ok: boolean }>('calendar-sync', { account_id: accountId }),
  /** Returns the Google address to send the person to. */
  start: (accountId: string, returnTo: 'admin' | 'client') =>
    invoke<{ url: string }>('calendar-oauth', { action: 'start', account_id: accountId, return_to: returnTo }),
  disconnect: (accountId: string) => invoke<{ ok: boolean }>('calendar-oauth', { action: 'disconnect', account_id: accountId }),
};
