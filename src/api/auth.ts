// Signing in, signing out, passwords, and two-factor. The only place the app touches Supabase Auth.
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface AuthError {
  message: string;
  status?: number;
  code?: string;
  name?: string;
}
export interface AuthUser {
  id: string;
  email: string | null;
  lastSignInAt: string | null;
}
export interface AuthSession {
  user: AuthUser | null;
}
export interface Factor {
  id: string;
  friendly_name?: string | null;
  created_at?: string | null;
}
export interface Enrollment {
  factorId: string;
  qr: string;
  secret: string;
}

// deno-lint-ignore no-explicit-any
const toError = (e: any): AuthError | null => (e ? { message: e.message ?? '', status: e.status, code: e.code, name: e.name } : null);
// deno-lint-ignore no-explicit-any
const toUser = (u: any): AuthUser | null => (u ? { id: u.id, email: u.email ?? null, lastSignInAt: u.last_sign_in_at ?? null } : null);
// deno-lint-ignore no-explicit-any
const toSession = (s: any): AuthSession | null => (s ? { user: toUser(s.user) } : null);

export const authApi = {
  isConfigured: isSupabaseConfigured,

  async getSession(): Promise<{ session: AuthSession | null; error: AuthError | null }> {
    const { data, error } = await supabase.auth.getSession();
    return { session: toSession(data?.session), error: toError(error) };
  },

  /** Calls back whenever the sign-in state changes. Returns the function that stops listening. */
  onChange(cb: (event: string, session: AuthSession | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((event, s) => cb(event, toSession(s)));
    return () => data.subscription.unsubscribe();
  },

  async currentUser(): Promise<AuthUser | null> {
    const { data } = await supabase.auth.getUser();
    return toUser(data?.user);
  },

  async signIn(email: string, password: string): Promise<{ user: AuthUser | null; error: AuthError | null }> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { user: toUser(data?.user), error: toError(error) };
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut();
  },

  async signOutOtherDevices(): Promise<AuthError | null> {
    const { error } = await supabase.auth.signOut({ scope: 'others' });
    return toError(error);
  },

  async sendPasswordReset(email: string, redirectTo: string): Promise<AuthError | null> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    return toError(error);
  },

  async updatePassword(password: string): Promise<AuthError | null> {
    const { error } = await supabase.auth.updateUser({ password });
    return toError(error);
  },

  /** Two-factor sign-in (an authenticator app). */
  mfa: {
    /** "aal2" means the code has been entered in this session. */
    async level(): Promise<{ level: string | null; error: string | null }> {
      const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      return { level: data?.currentLevel ?? null, error: error ? error.message : null };
    },

    async factors(): Promise<{ verified: Factor[]; error: string | null }> {
      const { data, error } = await supabase.auth.mfa.listFactors();
      return { verified: ((data?.totp ?? []) as Factor[]).slice(), error: error ? error.message : null };
    },

    /** Starts adding an authenticator. Abandoned, unfinished attempts are cleared first. */
    async beginEnrollment(friendlyName: string): Promise<{ enrollment: Enrollment | null; error: string | null }> {
      const { data: all } = await supabase.auth.mfa.listFactors();
      for (const f of all?.all ?? []) {
        if (f.factor_type === 'totp' && f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName });
      if (error || !data) return { enrollment: null, error: error?.message ?? 'Could not start.' };
      return { enrollment: { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret }, error: null };
    },

    async verify(factorId: string, code: string): Promise<AuthError | null> {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      return toError(error);
    },

    async remove(factorId: string): Promise<string | null> {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      return error ? error.message : null;
    },
  },
};
