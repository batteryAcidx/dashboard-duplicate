import React, { useCallback, useEffect, useState } from 'react';
import { authApi } from '../../../api';
import type { Enrollment, Factor } from '../../../api';
import { Button, Card, Chip, Field, Notice, PageTitle, Row, inputCls } from '../../../components/ui';
import { relativeTime } from '../../../domain/index';
import { REFRESH_CHOICES, getRefreshSeconds, setRefreshSeconds } from '../../../lib/preferences';

const MIN_PASSWORD = 10;

/** The admin's own account: sign-in security, two-factor, sessions and how screens refresh. */
export const AdminSettings: React.FC<{
  userEmail: string;
  onSignOut?: () => void;
  initial?: { factors: Factor[]; level: string; signedInAt: string | null };
}> = ({ userEmail, onSignOut, initial }) => {
  const [factors, setFactors] = useState<Factor[]>(initial?.factors ?? []);
  const [level, setLevel] = useState(initial?.level ?? '');
  const [signedInAt, setSignedInAt] = useState<string | null>(initial?.signedInAt ?? null);
  const [refresh, setRefresh] = useState(getRefreshSeconds());

  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [enroll, setEnroll] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaMsg, setMfaMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const [sessionMsg, setSessionMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [u, f, a] = await Promise.all([authApi.currentUser(), authApi.mfa.factors(), authApi.mfa.level()]);
    setSignedInAt(u?.lastSignInAt ?? null);
    setFactors(f.verified);
    setLevel(a.level ?? '');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const changePassword = async () => {
    setPwMsg(null);
    if (pw.length < MIN_PASSWORD) return setPwMsg({ ok: false, text: `Use at least ${MIN_PASSWORD} characters.` });
    if (pw !== pw2) return setPwMsg({ ok: false, text: 'The two passwords do not match.' });
    setPwBusy(true);
    const error = await authApi.updatePassword(pw);
    setPwBusy(false);
    if (error) {
      const m = (error.message || '').toLowerCase();
      return setPwMsg({
        ok: false,
        text: m.includes('same') ? 'That is the same as your current password.' : m.includes('reauth') || m.includes('recent') ? 'For safety, sign out and back in, then change it.' : 'Could not change the password. Try again.',
      });
    }
    setPw('');
    setPw2('');
    setPwMsg({ ok: true, text: 'Password changed.' });
  };

  const startEnroll = async () => {
    setMfaMsg(null);
    setMfaBusy(true);
    const { enrollment, error } = await authApi.mfa.beginEnrollment(`WedgeScale Admin ${new Date().toLocaleDateString('en-US')}`);
    setMfaBusy(false);
    if (error || !enrollment) return setMfaMsg({ ok: false, text: 'Could not start the setup. Try again.' });
    setEnroll(enrollment);
  };

  const verifyEnroll = async () => {
    if (!enroll) return;
    const clean = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) return setMfaMsg({ ok: false, text: 'Enter the 6-digit code from the new authenticator.' });
    setMfaBusy(true);
    const error = await authApi.mfa.verify(enroll.factorId, clean);
    setMfaBusy(false);
    setCode('');
    if (error) return setMfaMsg({ ok: false, text: "That code didn't work. Codes change every 30 seconds." });
    setEnroll(null);
    setMfaMsg({ ok: true, text: 'New authenticator added.' });
    await load();
  };

  const cancelEnroll = async () => {
    if (enroll) await authApi.mfa.remove(enroll.factorId);
    setEnroll(null);
    setCode('');
    setMfaMsg(null);
  };

  const removeFactor = async (id: string) => {
    if (removing !== id) {
      setRemoving(id);
      setTimeout(() => setRemoving((r) => (r === id ? null : r)), 6000);
      return;
    }
    setRemoving(null);
    setMfaBusy(true);
    const error = await authApi.mfa.remove(id);
    setMfaBusy(false);
    if (error) return setMfaMsg({ ok: false, text: 'Could not remove it. Sign in again with your code and retry.' });
    setMfaMsg({ ok: true, text: 'Authenticator removed.' });
    await load();
  };

  const signOutOthers = async () => {
    setSessionMsg(null);
    const error = await authApi.signOutOtherDevices();
    setSessionMsg(error ? 'Could not sign out the other devices. Try again.' : 'Every other device has been signed out.');
  };

  return (
    <>
      <PageTitle eyebrow="Your account" title="Settings" subtitle="Your own sign-in, two-factor and how the admin screens behave. Changes here only affect you." />

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          <Card title="Account">
            <Row label="Email" value={userEmail} />
            <Row label="Last signed in" value={signedInAt ? relativeTime(signedInAt) : ''} />
            <Row label="This session" value={level === 'aal2' ? <Chip tone="ok">Two-factor verified</Chip> : <Chip tone="plain">Not verified</Chip>} />
          </Card>

          <Card title="Password" hint={`At least ${MIN_PASSWORD} characters. Use a password you do not use anywhere else.`}>
            <Field id="as-pw" label="New password">
              <input id="as-pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className={inputCls} />
            </Field>
            <Field id="as-pw2" label="Type it again">
              <input id="as-pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} className={inputCls} />
            </Field>
            {pwMsg && <Notice tone={pwMsg.ok ? 'ok' : 'error'}>{pwMsg.text}</Notice>}
            <Button onClick={changePassword} disabled={pwBusy || !pw}>{pwBusy ? 'Saving…' : 'Change password'}</Button>
          </Card>

          <Card title="Screens" hint="How often the admin screens update on their own while you have them open.">
            <Field id="as-refresh" label="Refresh automatically">
              <select
                id="as-refresh"
                value={String(refresh)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setRefresh(n);
                  setRefreshSeconds(n);
                }}
                style={{ colorScheme: 'dark' }}
                className={inputCls}
              >
                {REFRESH_CHOICES.map(([v, l]) => (
                  <option key={v} value={String(v)}>{l}</option>
                ))}
              </select>
            </Field>
            <p className="text-[13px] leading-relaxed text-slate-500">Applies to screens you open next. Every screen also updates the moment you come back to the tab.</p>
          </Card>
        </div>

        <div className="space-y-8">
          <Card title="Two-factor sign-in" hint="Your authenticator app. Keep at least one added so you can always get in.">
            {factors.length === 0 ? (
              <p className="text-sm text-slate-400">No authenticator is set up for this account.</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {factors.map((f) => (
                  <li key={f.id} className="flex items-center justify-between gap-4 py-4">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-semibold text-slate-100">{f.friendly_name || 'Authenticator'}</div>
                      <div className="text-[13px] text-slate-500">{f.created_at ? `Added ${new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Active'}</div>
                    </div>
                    <Button
                      tone={removing === f.id ? 'danger' : 'quiet'}
                      className="!h-10 !px-4"
                      disabled={mfaBusy || factors.length < 2}
                      onClick={() => removeFactor(f.id)}
                      ariaLabel={`Remove ${f.friendly_name || 'authenticator'}`}
                    >
                      {removing === f.id ? 'Confirm' : 'Remove'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {factors.length === 1 && <p className="text-[13px] leading-relaxed text-slate-500">Add a second authenticator before you can remove this one.</p>}

            {enroll ? (
              <div className="space-y-5 rounded-xl border border-white/[0.06] bg-[#0a0f1d] p-5">
                <p className="text-sm leading-relaxed text-slate-300">Scan this with the new authenticator app, then enter the 6-digit code it shows. Save the key in your password manager.</p>
                <div className="mx-auto flex w-fit justify-center rounded-lg bg-white p-3">
                  <img src={enroll.qr} alt="Two-factor setup QR code" className="h-40 w-40" />
                </div>
                <code className="font-data block select-all break-all rounded-lg border border-white/[0.08] bg-[#090d18] p-3 text-xs text-slate-200">{enroll.secret}</code>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  aria-label="6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className={`${inputCls} text-center font-data text-xl tracking-[0.4em]`}
                />
                <div className="flex gap-3">
                  <Button onClick={verifyEnroll} disabled={mfaBusy}>{mfaBusy ? 'Checking…' : 'Add authenticator'}</Button>
                  <Button tone="quiet" onClick={cancelEnroll}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div>
                <Button tone="quiet" onClick={startEnroll} disabled={mfaBusy}>{mfaBusy ? 'Starting…' : 'Add an authenticator'}</Button>
              </div>
            )}
            {mfaMsg && <Notice tone={mfaMsg.ok ? 'ok' : 'error'}>{mfaMsg.text}</Notice>}
          </Card>

          <Card title="Devices and staying signed in">
            <p className="text-sm leading-relaxed text-slate-400">
              Once you enter your code you stay verified on this device until you sign out or the session ends, so you are not asked again the next time you open the admin.
              To make a session last 30 days, set it in Supabase: Authentication, then Sessions, then a 30-day time limit (a paid-plan setting).
            </p>
            <p className="text-sm leading-relaxed text-slate-400">
              There is no "remember this device" switch for the code itself. Building one would let a stolen browser skip two-factor, so it is deliberately not offered.
            </p>
            {sessionMsg && <Notice tone="ok">{sessionMsg}</Notice>}
            <div className="flex flex-wrap gap-3">
              <Button tone="quiet" onClick={signOutOthers}>Sign out other devices</Button>
              <Button tone="quiet" onClick={() => onSignOut?.()}>Sign out here</Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};
