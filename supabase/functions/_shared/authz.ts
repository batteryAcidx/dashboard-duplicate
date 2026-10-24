// Who is calling? Used by the functions an admin or an owner can press a button for.
// The token is verified by Supabase itself. The sign-in level (two-factor) is read from inside that verified token.

// deno-lint-ignore no-explicit-any
type Db = any;

export interface Caller {
  userId: string;
  role: 'admin' | 'owner';
}

function aalOf(jwt: string): string {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return String(payload.aal || '');
  } catch {
    return '';
  }
}

/** An admin (signed in with their authenticator code) may act on any client. An owner only on their own. */
export async function authorize(db: Db, authHeader: string | null, accountId: string, opts: { adminOnly?: boolean } = {}): Promise<Caller | null> {
  const jwt = (authHeader || '').replace(/^Bearer /i, '');
  if (!jwt) return null;
  const { data } = await db.auth.getUser(jwt);
  const userId = data?.user?.id as string | undefined;
  if (!userId) return null;

  const { data: admin } = await db.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  if (admin) return aalOf(jwt) === 'aal2' ? { userId, role: 'admin' } : null;
  if (opts.adminOnly) return null;

  const { data: profile } = await db.from('profiles').select('account_id').eq('id', userId).maybeSingle();
  return profile?.account_id === accountId ? { userId, role: 'owner' } : null;
}

/** For screens that are not about one client (such as the integrations page): any admin signed in with their authenticator code. */
export async function authorizeAdmin(db: Db, authHeader: string | null): Promise<boolean> {
  const jwt = (authHeader || '').replace(/^Bearer /i, '');
  if (!jwt) return false;
  const { data } = await db.auth.getUser(jwt);
  const userId = data?.user?.id as string | undefined;
  if (!userId || aalOf(jwt) !== 'aal2') return false;
  const { data: admin } = await db.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
  return Boolean(admin);
}
