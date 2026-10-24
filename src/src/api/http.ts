// The two ways the app talks to the backend, in one place:
//   rpc    a database function (the data layer: supabase/sql)
//   invoke a server function (the backend: supabase/functions)
// Everything comes back as a Result, so no screen ever has to know what Supabase's own answers look like.
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface Result<T> {
  data: T | null;
  /** plain text. Our database functions raise short codes such as "forbidden" or "not_found". */
  error: string | null;
  status: number;
}

export const isConfigured = isSupabaseConfigured;

const done = <T>(data: T | null, error: string | null, status: number): Result<T> => ({ data, error, status });
export const notConfigured = <T>(): Result<T> => done<T>(null, 'The dashboard is not connected to its database.', 500);

export async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<Result<T>> {
  if (!isSupabaseConfigured) return notConfigured<T>();
  const { data, error } = await supabase.rpc(name, args);
  if (error) return done<T>(null, error.message, error.message.includes('forbidden') ? 403 : 400);
  return done<T>(data as T, null, 200);
}

export async function invoke<T>(fn: string, body: Record<string, unknown> = {}): Promise<Result<T>> {
  if (!isSupabaseConfigured) return notConfigured<T>();
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let message = 'Something went wrong. Check your connection and try again.';
    let status = 500;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      status = ctx.status || 500;
      try {
        const j = await ctx.json();
        if (j && typeof j.error === 'string') message = j.error;
      } catch {
        /* keep the generic message */
      }
    }
    return done<T>(null, message, status);
  }
  if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
    return done<T>(null, String((data as { error: string }).error), 400);
  }
  return done<T>(data as T, null, 200);
}
