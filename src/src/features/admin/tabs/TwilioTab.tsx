import React, { useCallback, useRef, useState } from 'react';
import { adminApi } from '../../../api';
import { Button, Card, Chip, Field, Notice, Row, inputCls } from '../../../components/ui';
import { useSynced } from '../../../lib/sync';
import { RegistrationCard } from './RegistrationCard';
import { adminErrorText, readiness } from '../../../domain/index';
import type { Twilio } from '../../../domain/index';

const REG: [string, string][] = [['not_submitted', 'Not submitted'], ['pending', 'Waiting for the carriers'], ['approved', 'Approved'], ['rejected', 'Rejected']];
const FWD: [string, string][] = [['not_set', 'Not set'], ['pending', 'Waiting for the owner'], ['verified', 'Verified']];

const Select: React.FC<{ id: string; value: string; onChange: (v: string) => void; options: [string, string][] }> = ({ id, value, onChange, options }) => (
  <select id={id} value={value} onChange={(e) => onChange(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls}>
    {options.map(([v, l]) => (
      <option key={v} value={v}>{l}</option>
    ))}
  </select>
);

const toForm = (t: Twilio): Record<string, string> => ({
  twilio_subaccount_sid: t.twilio_subaccount_sid ?? '',
  messaging_service_sid: t.messaging_service_sid ?? '',
  phone_number: t.phone_number ?? '',
  phone_number_sid: t.phone_number_sid ?? '',
  brand_sid: t.brand_sid ?? '',
  campaign_sid: t.campaign_sid ?? '',
  forwarding_status: t.forwarding_status || 'not_set',
  registration_status: t.registration_status || 'not_submitted',
});

const STEPS = [
  'Create a subaccount for this client in Twilio.',
  'Buy a local number in their area code, in the client\'s name.',
  'Create a Messaging Service and add the number to it.',
  'Get their business details through the registration form above (it holds the EIN), then register the business (brand) and the texting campaign in Twilio. A business with an EIN registers as a standard brand, one without as a sole proprietor.',
  'Paste the ids below and save. Add the subaccount auth token (encrypted).',
  'Set the registration to Approved when the carriers approve it, then verify call forwarding.',
];

export const TwilioTab: React.FC<{ accountId: string; onDenied: () => void; initial?: Twilio }> = ({ accountId, onDenied, initial }) => {
  const [t, setT] = useState<Twilio | null>(initial ?? null);
  const [form, setForm] = useState<Record<string, string>>(initial ? toForm(initial) : {});
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const dirty = useRef(false);

  const fail = (m: string) => {
    if (m.includes('forbidden')) return onDenied();
    setError(m.includes('bad_token') ? 'A Twilio auth token is 32 letters and numbers.' : adminErrorText(m));
  };

  const load = useCallback(async () => {
    const r = await adminApi.twilio.get(accountId);
    if (r.error) return fail(r.error);
    setError(null);
    setT(r.data);
    if (!dirty.current) setForm(toForm(r.data as Twilio));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useSynced(load, accountId);

  const set = (k: string) => (v: string) => {
    dirty.current = true;
    setForm((f) => ({ ...f, [k]: v }));
  };
  const flash = (m: string) => {
    setNote(m);
    setTimeout(() => setNote(null), 4000);
  };

  const save = async () => {
    setBusy('save');
    setError(null);
    const r = await adminApi.twilio.save(accountId, form);
    setBusy(null);
    if (r.error) return fail(r.error);
    dirty.current = false;
    setT(r.data);
    setForm(toForm(r.data as Twilio));
    flash('Saved');
  };

  const saveToken = async () => {
    setBusy('token');
    setError(null);
    const r = await adminApi.twilio.storeToken(accountId, token.trim());
    setBusy(null);
    setToken('');
    if (r.error) return fail(r.error);
    setT(r.data);
    flash('Token saved, encrypted. It will not be shown again.');
  };

  if (!t) return <p className="py-16 text-center text-sm text-slate-400">{error ?? 'Loading Twilio details…'}</p>;

  const ready = readiness({
    account_status: t.account_status,
    registration_status: t.registration_status,
    phone_number: t.phone_number,
    twilio_ready: Boolean(t.twilio_subaccount_sid && t.messaging_service_sid && t.phone_number && t.has_token),
    forwarding_status: t.forwarding_status,
  });
  const check = (ok: boolean) => <Chip tone={ok ? 'ok' : 'plain'}>{ok ? 'Done' : 'Missing'}</Chip>;

  return (
    <div className="space-y-8">
      {error && <Notice tone="error">{error}</Notice>}
      {note && <Notice tone="ok">{note}</Notice>}

      <RegistrationCard accountId={accountId} onDenied={onDenied} />

      <Card title="Where this client stands" hint="Everything has to be done before the texting engine can be turned on.">
        <Row label="Subaccount, number and Messaging Service" value={check(Boolean(t.twilio_subaccount_sid && t.messaging_service_sid && t.phone_number))} />
        <Row label="Auth token saved" value={check(t.has_token)} />
        <Row label="Registration approved" value={check(ready.registrationApproved)} />
        <Row label="Call forwarding verified" value={check(ready.forwardingVerified)} />
        <Row label="Account is live" value={check(ready.accountLive)} />
      </Card>

      <Card title="Twilio details" hint="Copy these from the client's subaccount in the Twilio console.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field id="tw-sub" label="Subaccount SID" hint="Starts with AC.">
            <input id="tw-sub" value={form.twilio_subaccount_sid ?? ''} onChange={(e) => set('twilio_subaccount_sid')(e.target.value)} autoCapitalize="off" autoCorrect="off" className={`${inputCls} font-data text-sm`} />
          </Field>
          <Field id="tw-mg" label="Messaging Service SID" hint="Starts with MG.">
            <input id="tw-mg" value={form.messaging_service_sid ?? ''} onChange={(e) => set('messaging_service_sid')(e.target.value)} autoCapitalize="off" autoCorrect="off" className={`${inputCls} font-data text-sm`} />
          </Field>
          <Field id="tw-num" label="Texting number" hint="Like +12145550100.">
            <input id="tw-num" value={form.phone_number ?? ''} onChange={(e) => set('phone_number')(e.target.value)} className={inputCls} />
          </Field>
          <Field id="tw-numsid" label="Number SID" hint="Starts with PN.">
            <input id="tw-numsid" value={form.phone_number_sid ?? ''} onChange={(e) => set('phone_number_sid')(e.target.value)} autoCapitalize="off" autoCorrect="off" className={`${inputCls} font-data text-sm`} />
          </Field>
          <Field id="tw-brand" label="Brand SID">
            <input id="tw-brand" value={form.brand_sid ?? ''} onChange={(e) => set('brand_sid')(e.target.value)} autoCapitalize="off" autoCorrect="off" className={`${inputCls} font-data text-sm`} />
          </Field>
          <Field id="tw-camp" label="Campaign SID">
            <input id="tw-camp" value={form.campaign_sid ?? ''} onChange={(e) => set('campaign_sid')(e.target.value)} autoCapitalize="off" autoCorrect="off" className={`${inputCls} font-data text-sm`} />
          </Field>
          <Field id="tw-reg" label="Registration">
            <Select id="tw-reg" value={form.registration_status ?? 'not_submitted'} onChange={set('registration_status')} options={REG} />
          </Field>
          <Field id="tw-fwd" label="Call forwarding" hint="Set by hand for now. How we do it for real is still to be decided: see the Wiki.">
            <Select id="tw-fwd" value={form.forwarding_status ?? 'not_set'} onChange={set('forwarding_status')} options={FWD} />
          </Field>
        </div>
        <Button onClick={save} disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save Twilio details'}</Button>
      </Card>

      <Card title="Auth token" hint="The subaccount's secret. It is encrypted the moment you save it and is never shown again.">
        <Row label="Saved" value={check(t.has_token)} />
        <Field id="tw-token" label={t.has_token ? 'Replace the token' : 'Paste the token'}>
          <input id="tw-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="32 letters and numbers" className={`${inputCls} font-data text-sm`} />
        </Field>
        <Button tone="quiet" onClick={saveToken} disabled={busy === 'token' || !token.trim()}>{busy === 'token' ? 'Saving…' : 'Save token'}</Button>
      </Card>

      <Card title="Setting up a client's number" hint="Done by hand in the Twilio console for now. Doing it automatically is the next thing to build.">
        <ol className="list-decimal space-y-3 pl-5 text-[15px] leading-relaxed text-slate-300">
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
      </Card>
    </div>
  );
};
