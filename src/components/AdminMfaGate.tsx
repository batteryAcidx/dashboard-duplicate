import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type Phase = 'checking' | 'enroll' | 'verify' | 'ok' | 'error';

interface EnrollData {
  factorId: string;
  qr: string;
  secret: string;
}

const inputCls =
  "w-full h-16 rounded-xl bg-[#0a0f1d] border border-white/[0.1] focus:border-[#f59e0b]/70 focus:ring-2 focus:ring-[#f59e0b]/15 outline-none px-4 text-2xl text-center tracking-[0.5em] font-data text-slate-100 placeholder:text-slate-700";

const btn =
  "inline-flex h-12 w-full items-center justify-center rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] text-[#150f05] font-display font-bold text-sm cursor-pointer transition-colors disabled:opacity-50";

/** Before the code is entered this is ALL anyone sees: the name, a way out, and the check. No navigation. */
const Frame: React.FC<{ userEmail?: string; onSignOut?: () => void; children: React.ReactNode }> = ({ userEmail, onSignOut, children }) => (
  <div className="min-h-screen w-full bg-[#090e1c] font-body text-[#dee1f7]">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 pb-4 pt-5 sm:px-8">
      <span className="font-display text-lg font-extrabold tracking-tight text-slate-100">
        WEDGE<span className="text-[#ffc174]">SCALE</span>
      </span>
      {onSignOut && (
        <button
          type="button"
          onClick={onSignOut}
          className="cursor-pointer rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:text-slate-200"
        >
          Sign out
        </button>
      )}
    </header>
    <div className="mx-auto max-w-md px-5 pb-20 pt-10 sm:px-6">
      {userEmail && <p className="mb-5 truncate text-center text-sm text-slate-500">Signed in as {userEmail}</p>}
      {children}
    </div>
  </div>
);

const Shell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-6 rounded-2xl border border-white/[0.07] bg-[#0f1424] p-7">
    <div className="flex items-center gap-3">
      <ShieldCheck className="h-5 w-5 text-[#ffc174]" />
      <h1 className="font-display text-xl font-bold tracking-tight text-slate-100">{title}</h1>
    </div>
    {children}
  </section>
);

interface Props {
  children: React.ReactNode;
  onDenied: () => void;
  userEmail?: string;
  onSignOut?: () => void;
}

export const AdminMfaGate: React.FC<Props> = ({ children, onDenied, userEmail, onSignOut }) => {
  const [phase, setPhase] = useState<Phase>('checking');
  const [factorId, setFactorId] = useState('');
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEnroll = useCallback(async () => {
    setError(null);
    // clear any abandoned, unfinished setups first
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const f of factors?.all ?? []) {
      if (f.factor_type === 'totp' && f.status === 'unverified') {
        await supabase.auth.mfa.unenroll({ factorId: f.id });
      }
    }
    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'WedgeScale Admin',
    });
    if (err || !data) {
      setError('Could not start two-factor setup. Check that authenticator-app sign-in is enabled in Supabase.');
      setPhase('error');
      return;
    }
    setEnroll({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    setPhase('enroll');
  }, []);

  const check = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setError('The dashboard is not connected to its database.');
      setPhase('error');
      return;
    }
    setPhase('checking');
    setError(null);

    // 1. only admins ever see this screen; everyone else gets the not-found page
    const { data: adminRow } = await supabase.from('admins').select('user_id').maybeSingle();
    if (!adminRow) {
      onDenied();
      return;
    }

    // 2. already completed the second step in this session?
    const { data: aal, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr || !aal) {
      setError('Could not check your sign-in. Check your connection and try again.');
      setPhase('error');
      return;
    }
    if (aal.currentLevel === 'aal2') {
      setPhase('ok');
      return;
    }

    // 3. a finished setup exists: ask for the code. Otherwise: set it up.
    const { data: factors, error: fErr } = await supabase.auth.mfa.listFactors();
    if (fErr) {
      setError('Could not check your sign-in. Check your connection and try again.');
      setPhase('error');
      return;
    }
    const verified = factors?.totp?.[0];
    if (verified) {
      setFactorId(verified.id);
      setPhase('verify');
      return;
    }
    await startEnroll();
  }, [onDenied, startEnroll]);

  useEffect(() => {
    check();
  }, [check]);

  const submit = async (id: string) => {
    const clean = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code: clean });
    setBusy(false);
    setCode('');
    if (err) {
      const msg = (err.message || '').toLowerCase();
      const status = (err as { status?: number }).status;
      setError(
        status === 429 || msg.includes('rate')
          ? 'Too many attempts. Wait a minute and try again.'
          : "That code didn't work. Check your authenticator app and try again. Codes change every 30 seconds."
      );
      return;
    }
    setPhase('ok');
  };

  if (phase === 'ok') return <>{children}</>;

  const framed = (node: React.ReactNode) => (
    <Frame userEmail={userEmail} onSignOut={onSignOut}>
      {node}
    </Frame>
  );

  if (phase === 'checking') {
    return framed(<div className="py-16 text-center text-sm text-slate-400">Checking your sign-in…</div>);
  }

  if (phase === 'error') {
    return framed(
      <Shell title="Two-factor check">
        <p role="alert" className="text-sm text-slate-300 leading-relaxed">
          {error}
        </p>
        <button type="button" onClick={check} className={btn}>
          Try again
        </button>
      </Shell>
    );
  }

  if (phase === 'verify') {
    return framed(
      <Shell title="Enter your code">
        <p className="text-sm text-slate-400 leading-relaxed">
          Open your authenticator app and enter the 6-digit code for WedgeScale Admin.
        </p>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          aria-label="6-digit code"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit(factorId);
          }}
          placeholder="000000"
          className={inputCls}
        />
        {error && (
          <p role="alert" className="text-xs text-red-400 font-body leading-relaxed">
            {error}
          </p>
        )}
        <button type="button" onClick={() => submit(factorId)} disabled={busy} className={btn}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </Shell>
    );
  }

  // phase === 'enroll'
  return framed(
    <Shell title="Set up two-factor sign-in">
      <ol className="space-y-2 text-sm text-slate-300 leading-relaxed list-decimal pl-5">
        <li>Open an authenticator app (Google Authenticator, 1Password, Authy or similar).</li>
        <li>Scan the code below, or type the key in by hand.</li>
        <li>
          <strong className="text-[#ffc174]">Save the key in your password manager now.</strong> It is the only way to
          get back in if you lose your phone, and it is not shown again.
        </li>
        <li>Enter the 6-digit code the app shows.</li>
      </ol>

      {enroll && (
        <>
          <div className="flex justify-center p-3 rounded-lg bg-white w-fit mx-auto">
            <img src={enroll.qr} alt="Two-factor setup QR code" className="w-44 h-44" />
          </div>
          <div>
            <div className="font-body text-[11px] tracking-wide text-slate-400 font-semibold mb-1.5">
              Key (to type in by hand)
            </div>
            <code className="block p-3 rounded-lg bg-[#090d18] border border-[#232839] text-xs text-slate-200 break-all select-all font-data">
              {enroll.secret}
            </code>
          </div>

          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-label="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit(enroll.factorId);
            }}
            placeholder="000000"
            className={inputCls}
          />
          {error && (
            <p role="alert" className="text-xs text-red-400 font-body leading-relaxed">
              {error}
            </p>
          )}
          <button type="button" onClick={() => submit(enroll.factorId)} disabled={busy} className={btn}>
            {busy ? 'Checking…' : 'Turn on two-factor'}
          </button>
        </>
      )}
    </Shell>
  );
};