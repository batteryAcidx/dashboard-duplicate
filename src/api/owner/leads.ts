import { supabase } from '../../lib/supabase';

/** The owner's conversations. */
export const leadsApi = {
  list: () => supabase.from('leads').select('*, appointments(starts_at, status), attachments(id), messages(sent_at)'),
  states: () => supabase.from('lead_state').select('lead_id, stage, collected, handoff_reason'),
  numbersToConfirm: () => supabase.from('contacts').select('phone_e164').eq('needs_review', true),
  messages: (leadId: string) => supabase.from('messages').select('id, sender, body, sent_at').eq('lead_id', leadId).order('sent_at', { ascending: true }),
  attachments: (leadId: string) => supabase.from('attachments').select('id, message_id, file_name, size_bytes').eq('lead_id', leadId),
  events: (leadId: string) => supabase.from('lead_events').select('id, event_type, detail, actor, created_at').eq('lead_id', leadId).order('created_at', { ascending: true }),
  markRead: (leadId: string) => supabase.from('leads').update({ unread: false }).eq('id', leadId),
  changeStatus: (leadId: string, status: string, finalValue: number | null) =>
    supabase.rpc('change_lead_status', { p_lead_id: leadId, p_status: status, p_final_value: finalValue }),
  setType: (leadId: string, type: string) => supabase.rpc('owner_set_lead_type', { p_lead_id: leadId, p_type: type }),
};
