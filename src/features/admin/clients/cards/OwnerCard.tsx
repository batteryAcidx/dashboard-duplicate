import React, { useState } from 'react';
import { callAdmin } from '../../../../api';
import { ClientDetail, fmt } from '../../../../domain/accounts';
import { inputCls, labelCls, primaryBtn, Card, ReadRow, ErrorLine } from '../../shared';

export const OwnerCard: React.FC<{ detail: ClientDetail; onChanged: () => Promise<void>; onDenied: () => void }> = ({
  detail,
  onChanged,
  onDenied,
}) => {
  const [inviteEmail, setInviteEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const owner = detail.owner;

  const resend = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    const r = await callAdmin<{ owner_email: string }>('resend_invite', {
      account_id: detail.account.id,
      owner_email: inviteEmail,
    });
    setBusy(false);
    if (r.status === 403) return onDenied();
    if (r.error) return setError(r.error);
    setMsg(`Invite sent to ${r.data?.owner_email ?? 'the owner'}.`);
    setInviteEmail('');
    await onChanged();
  };

  return (
    <Card title="Owner">
      {owner ? (
        <>
          <ReadRow label="Name" value={owner.full_name || ''} />
          <ReadRow label="Email" value={owner.email || ''} />
          <ReadRow
            label="Login"
            value={owner.state === 'active' ? `Active · last sign-in ${fmt(owner.last_sign_in_at)}` : 'Invite not accepted yet'}
          />
        </>
      ) : (
        <p className="text-sm text-slate-300">No owner is linked to this account.</p>
      )}

      {(!owner || owner.state === 'pending') && (
        <div className="space-y-3 pt-1">
          <div>
            <label htmlFor="invite-email" className={labelCls}>
              {owner ? 'Send to a different email (optional)' : 'Owner email'}
            </label>
            <input
              id="invite-email"
              type="email"
              autoCapitalize="none"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder={owner?.email || 'owner@company.com'}
              className={inputCls}
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" onClick={resend} disabled={busy} className={primaryBtn}>
              {busy ? 'Sending…' : owner ? 'Resend invite' : 'Send invite'}
            </button>
            {msg && <span className="font-data text-xs text-[#ffc174]">{msg}</span>}
          </div>
          <ErrorLine text={error} />
          <p className="text-[11.5px] text-slate-500 leading-relaxed">
            This replaces the old, never-used login with a fresh one, so older invite links stop working.
          </p>
        </div>
      )}
    </Card>
  );
};

