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
  "w-full bg-[#090d18] border border-[#232839] focus:border-[#f59e0b] focus:outline-none rounded-lg px-3 py-3 text-lg text-center tracking-[0.4em] font-['JetBrains_Mono'] text-slate-100 placeholder:text-slate-600";

const btn =
  "px-4 py-2.5 rounded-lg bg-[#f59e0b] hover:bg-[#fbbf24] text-[#150f05] font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50";

const Shell: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="mx-auto max-w-md px-4 sm:px-6 pt-10 pb-20">
    <section className="p-5 sm:p-6 rounded-xl bg-[#111625] border border-[#22283a] space-y-4">
      <div className="flex items-center gap-2.5">
        <ShieldCheck className="w-5 h-5 text-[#ffc174]" />
        <h1 className="font-['Space_Grotesk'] text-lg font-bold text-slate-100 tracking-tight">{title}</h1>
      </div>
      {children}
    </section>
  </div>
);

interface Props {
  children: React.ReactNode;
  onDenied: () => void;
}

export const AdminMfaGate: React.FC<Props> = ({ children, onDenied }) => {
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

  if (phase === 'checking') {
    return (
      <div className="py-24 text-center font-['JetBrains_Mono'] text-xs uppercase tracking-wider text-slate-400">
        Checking your sign-in…
      </div>
    );
  }

  if (phase === 'error') {
    return (
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
    return (
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
          <p role="alert" className="text-xs text-red-400 font-['Inter'] leading-relaxed">
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
  return (
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
            <div className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-widest text-slate-400 font-semibold mb-1.5">
              Key (to type in by hand)
            </div>
            <code className="block p-3 rounded-lg bg-[#090d18] border border-[#232839] text-xs text-slate-200 break-all select-all font-['JetBrains_Mono']">
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
            <p role="alert" className="text-xs text-red-400 font-['Inter'] leading-relaxed">
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