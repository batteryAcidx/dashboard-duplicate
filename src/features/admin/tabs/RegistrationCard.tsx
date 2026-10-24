import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi } from '../../../api';
import { useSynced } from '../../../lib/sync';
import { Button, Card, Chip, Field, Notice, Row, inputCls } from '../../../components/ui';
import { BUSINESS_TYPES, PATH_LABEL, REGISTRATION_STATUS, adminErrorText, maskEin, registrationPath, relativeTime } from '../../../domain';
import type { RegistrationSaved } from '../../../domain';

const typeLabel = (v: string | null | undefined) => BUSINESS_TYPES.find(([k]) => k === v)?.[1] ?? v ?? '';
const REVEAL_SECONDS = 30;

/** The business registration the client sent: review it, reveal the EIN deliberately, and move it along. */
export const RegistrationCard: React.FC<{ accountId: string; onDenied: () => void; initial?: RegistrationSaved }> = ({ accountId, onDenied, initial }) => {
  const [reg, setReg] = useState<RegistrationSaved | null>(initial ?? null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [sendingBack, setSendingBack] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fail = (message: string, status?: number) => {
    if (status === 403) return onDenied();
    setError(adminErrorText(message));
  };

  const load = useCallback(async () => {
    const r = await adminApi.registration.get(accountId);
    if (r.error) return fail(r.error, r.status);
    setError(null);
    setReg(r.data);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useSynced(load, accountId);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const reveal = async () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 6000);
      return;
    }
    setConfirming(false);
    setBusy('reveal');
    const r = await adminApi.registration.revealEin(accountId);
    setBusy(null);
    if (r.error) return fail(r.error, r.status);
    setRevealed(r.data);
    timer.current = setTimeout(() => setRevealed(null), REVEAL_SECONDS * 1000);
  };

  const setStatus = async (status: string, withNotes: string | null) => {
    setBusy(status);
    setError(null);
    const r = await adminApi.registration.setStatus(accountId, status, withNotes);
    setBusy(null);
    if (r.error) return fail(r.error, r.status);
    setReg(r.data);
    setSendingBack(false);
    setNotes('');
  };

  if (!reg) return <p className="py-6 text-center text-sm text-slate-400">{error ?? 'Loading registration…'}</p>;

  const status = reg.status ?? 'not_started';
  const info = REGISTRATION_STATUS[status] ?? REGISTRATION_STATUS.not_started;
  const sent = status !== 'not_started' && status !== 'draft';
  const path = reg.has_ein === undefined ? null : registrationPath(reg.has_ein);

  return (
    <Card
      title="Business registration"
      hint="What the carriers need before this client's number can be registered. The client fills in one form; you review it here."
      action={<Chip tone={info.tone}>{info.label}</Chip>}
    >
      {error && <Notice tone="error">{error}</Notice>}

      {!sent ? (
        <p className="text-[15px] leading-relaxed text-slate-300">
          The client has not sent it yet. On the Setup tab, open the registration step and choose "Send them to our registration form", then email them the link.
        </p>
      ) : (
        <>
          <Row label="Registers as" value={path ? PATH_LABEL[path] : ''} />
          <Row label="Business type" value={typeLabel(reg.business_type)} />
          <Row label="Legal name" value={reg.legal_name ?? ''} />
          {reg.dba && <Row label="Known as" value={reg.dba} />}
          <Row
            label="EIN"
            value={
              revealed ? (
                <span className="font-data text-[15px] text-[#ffc174]">{revealed}</span>
              ) : (
                <span className="font-data">{reg.has_ein ? maskEin(reg.ein_last4) : 'None (sole proprietor)'}</span>
              )
            }
          />
          <Row label="Address" value={[reg.address1, reg.address2, reg.city, reg.region, reg.postal_code].filter(Boolean).join(', ')} />
          <Row label="Website" value={reg.website ?? ''} />
          <Row label="Contact" value={[reg.contact_name, reg.contact_title].filter(Boolean).join(', ')} />
          <Row label="Contact email" value={reg.contact_email ?? ''} />
          <Row label="Contact phone" value={reg.contact_phone ?? ''} />
          <Row label="Received" value={reg.submitted_at ? relativeTime(reg.submitted_at) : ''} />
          {reg.admin_notes && <Notice tone="info">Sent back with: {reg.admin_notes}</Notice>}

          {revealed && <p className="text-[13px] text-slate-500">Hidden again in {REVEAL_SECONDS} seconds. This was recorded in the activity log.</p>}

          <div className="flex flex-wrap items-center gap-3">
            {reg.has_ein && reg.ein_last4 && !revealed && (
              <Button tone={confirming ? 'danger' : 'quiet'} onClick={reveal} disabled={busy === 'reveal'}>
                {confirming ? 'Confirm: show the full EIN' : 'Reveal EIN'}
              </Button>
            )}
            {revealed && <Button tone="quiet" onClick={() => setRevealed(null)}>Hide now</Button>}
          </div>

          {sendingBack ? (
            <div className="space-y-4 rounded-xl border border-white/[0.06] bg-[#0a0f1d] p-5">
              <Field id="reg-notes" label="What does the client need to fix?" hint="They see this, so write it kindly and specifically.">
                <textarea id="reg-notes" rows={3} maxLength={600} value={notes} onChange={(e) => setNotes(e.target.value)} className={`${inputCls} h-auto py-3`} />
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => setStatus('needs_changes', notes)} disabled={busy !== null || !notes.trim()}>Send it back</Button>
                <Button tone="quiet" onClick={() => setSendingBack(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 border-t border-white/[0.06] pt-5">
              {status !== 'ready' && status !== 'sent_to_twilio' && (
                <Button onClick={() => setStatus('ready', null)} disabled={busy !== null}>{busy === 'ready' ? 'Saving…' : 'Mark ready to file'}</Button>
              )}
              {status === 'ready' && <Button onClick={() => setStatus('sent_to_twilio', null)} disabled={busy !== null}>{busy === 'sent_to_twilio' ? 'Saving…' : 'Mark filed with the carriers'}</Button>}
              {status !== 'sent_to_twilio' && <Button tone="quiet" onClick={() => setSendingBack(true)}>Send back to the client</Button>}
              {(status === 'ready' || status === 'sent_to_twilio') && <span className="text-sm text-slate-500">The client can no longer change this.</span>}
            </div>
          )}
        </>
      )}
    </Card>
  );
};
