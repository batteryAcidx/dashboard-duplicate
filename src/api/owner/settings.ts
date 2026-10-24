import { supabase } from '../../lib/supabase';

/** The owner's Settings page. */
export const settingsApi = {
  profile: (userId: string) => supabase.from('profiles').select('full_name, password_changed_at').eq('id', userId).maybeSingle(),
  updateProfile: (userId: string, fullName: string | null) => supabase.from('profiles').update({ full_name: fullName }).eq('id', userId).select('id'),
  jobValues: () => supabase.from('job_values').select('job_type, typical_value'),
  saveJobValues: (rows: unknown[]) => supabase.from('job_values').upsert(rows, { onConflict: 'account_id,job_type' }),
  calendarStep: () => supabase.from('setup_steps').select('status').eq('step_key', 'calendar_connected').maybeSingle(),
  engine: () => supabase.from('account_engine_settings').select('book_existing_customers').maybeSingle(),
  setBookExisting: (value: boolean) => supabase.rpc('owner_set_book_existing', { p_value: value }),
  blocks: () =>
    supabase
      .from('availability_blocks')
      .select('id, starts_at, ends_at, reason')
      .gte('ends_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(50),
  addBlock: (row: { account_id: string; starts_at: string; ends_at: string; reason: string | null }) =>
    supabase.from('availability_blocks').insert(row).select('id, starts_at, ends_at, reason'),
  removeBlock: (id: string) => supabase.from('availability_blocks').delete().eq('id', id),
};
