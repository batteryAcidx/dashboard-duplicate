import { supabase } from '../../lib/supabase';

export const contactsApi = {
  list: () =>
    supabase
      .from('contacts')
      .select('phone_e164, contact_type, name, company, address, last_job, notes, auto_reply, source, needs_review, created_at')
      .order('created_at', { ascending: false }),
  set: (args: Record<string, unknown>) => supabase.rpc('owner_set_contact', args),
  import: (rows: unknown[], type: string) => supabase.rpc('owner_import_contacts', { p_rows: rows, p_type: type }),
  remove: (phone: string) => supabase.from('contacts').delete().eq('phone_e164', phone),
};
