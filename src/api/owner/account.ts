import { supabase } from '../../lib/supabase';

/** The signed-in owner's own business. Row-level security returns only their own account, so none of these take an id to read. */
export const accountApi = {
  summary: () => supabase.from('accounts').select('name, timezone, status').maybeSingle(),
  withId: () => supabase.from('accounts').select('id, name, timezone, status').maybeSingle(),
  nameOnly: () => supabase.from('accounts').select('name').maybeSingle(),
  settings: () =>
    supabase
      .from('accounts')
      .select('id, name, territory, timezone, service_area, services, office_open, office_close, works_weekends, notification_phone, quiet_start, quiet_end')
      .maybeSingle(),
  update: (id: string, values: Record<string, unknown>) => supabase.from('accounts').update(values).eq('id', id).select('id'),
};
