// "Who is this person to us?" Used to decide where to send them.
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const accessApi = {
  /** Only admins can see their own row in the admins table. */
  async isAdmin(): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    const { data } = await supabase.from('admins').select('user_id').maybeSingle();
    return Boolean(data);
  },

  /** Does this login belong to a client business? An admin with no client account goes straight to /admin. */
  async hasClientAccount(): Promise<boolean> {
    if (!isSupabaseConfigured) return false;
    const { data } = await supabase.from('profiles').select('id').limit(1);
    return Boolean(data && data.length > 0);
  },
};
