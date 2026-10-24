import React, { useState } from 'react';
import { adminApi } from '../../../../api';
import { ClientDetail } from '../../../../domain/accounts';
import { inputCls, labelCls, dangerBtn, ErrorLine } from '../../shared';
import { Card as UiCard } from '../../../../components/ui';

export const DeleteClientCard: React.FC<{ detail: ClientDetail; goto: (p: string) => void; onDenied: () => void }> = ({ detail, goto, onDenied }) => {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancelled = detail.account.status === 'cancelled';
  const ok = typed.trim().toLowerCase() === detail.account.name.trim().toLowerCase();

  const remove = async () => {
    setBusy(true);
    setError(null);
    const { error: err, status } = await adminApi.clients.remove(detail.account.id, typed);
    setBusy(false);
    if (err) {
      if (status === 403) return onDenied();
      setError(
        err.includes('has_related_data')
          ? "Other records still belong to this client (for example the owner's login), so it could not be deleted. Remove those first."
          : err.includes('name_mismatch')
          ? 'The name does not match.'
          : err.includes('must_cancel_first')
          ? 'Cancel the account first.'
          : 'Could not delete this client. Try again.'
      );
      return;
    }
    goto('/admin');
  };

  return (
    <UiCard title="Delete this client" hint="Removes the client and everything that belongs to them, permanently. It cannot be undone.">
      {!cancelled ? (
        <p className="text-sm leading-relaxed text-slate-400">A client can only be deleted once it is cancelled. Cancel the account first, then come back here.</p>
      ) : (
        <div className="space-y-4 rounded-xl border border-red-400/20 bg-red-500/[0.05] p-5">
          <label htmlFor="del-confirm" className={labelCls}>Type “{detail.account.name}” to confirm</label>
          <input id="del-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" className={inputCls} />
          <ErrorLine text={error} />
          <button type="button" onClick={remove} disabled={busy || !ok} className={dangerBtn}>
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      )}
    </UiCard>
  );
};

/* ---------- client detail ---------- */

