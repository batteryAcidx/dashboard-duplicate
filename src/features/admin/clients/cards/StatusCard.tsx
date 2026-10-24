import React, { useState } from 'react';
import { callAdmin } from '../../../../api';
import { ClientDetail } from '../../../../domain/accounts';
import { inputCls, labelCls, primaryBtn, ghostBtn, dangerBtn, Card, ErrorLine } from '../../shared';

export const StatusCard: React.FC<{ detail: ClientDetail; onChanged: () => Promise<void>; onDenied: () => void }> = ({
  detail,
  onChanged,
  onDenied,
}) => {
  const [pending, setPending] = useState<'pause' | 'reactivate' | 'cancel' | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = detail.account.status;

  const mustType = pending === 'cancel';
  const typedOk = !mustType || typed.trim().toLowerCase() === detail.account.name.toLowerCase();

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    const r = await callAdmin('set_status', { account_id: detail.account.id, to: pending });
    setBusy(false);
    if (r.status === 403) return onDenied();
    if (r.error) {
      setError(r.error);
      await onChanged();
      setPending(null);
      return;
    }
    setPending(null);
    setTyped('');
    await onChanged();
  };

  return (
    <Card
      title="Account status"
      hint="Pausing marks the account paused and stops all texting for this client."
    >
      <div className="flex items-center gap-3 flex-wrap">
        {(status === 'setup' || status === 'live') && (
          <button type="button" onClick={() => setPending('pause')} disabled={busy} className={ghostBtn}>Pause</button>
        )}
        {(status === 'paused' || status === 'cancelled') && (
          <button type="button" onClick={() => setPending('reactivate')} disabled={busy} className={primaryBtn}>Reactivate</button>
        )}
        {status === 'cancelled' && (
          <span className="text-xs text-slate-500">Territories were released when this account was cancelled. Lock them again if needed.</span>
        )}
      </div>

      {pending && pending !== 'cancel' && (
        <div className="p-3 rounded-lg bg-[#1a1710] border border-[#f59e0b]/40 space-y-3">
          <p className="text-xs text-slate-200 leading-relaxed">
            {pending === 'pause' ? 'Pause this account?' : 'Reactivate this account?'}
          </p>
          <div className="flex items-center gap-3">
            <button type="button" onClick={confirm} disabled={busy} className={primaryBtn}>
              {busy ? 'Working…' : 'Yes, continue'}
            </button>
            <button type="button" onClick={() => setPending(null)} disabled={busy} className={ghostBtn}>Go back</button>
          </div>
        </div>
      )}

      {status !== 'cancelled' && (
        <div className="mt-2 p-4 rounded-lg border border-red-900/40 bg-red-950/10 space-y-3">
          <div className="font-body text-[11px] tracking-wide text-red-400 font-semibold">
            Danger area
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Cancelling releases every territory this client holds, so anyone else can take them. All data is kept.
          </p>
          {pending === 'cancel' ? (
            <div className="space-y-3">
              <label htmlFor="cancel-confirm" className={labelCls}>
                Type “{detail.account.name}” to confirm
              </label>
              <input
                id="cancel-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className={inputCls}
              />
              <div className="flex items-center gap-3">
                <button type="button" onClick={confirm} disabled={busy || !typedOk} className={dangerBtn}>
                  {busy ? 'Working…' : 'Cancel this account'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPending(null);
                    setTyped('');
                  }}
                  disabled={busy}
                  className={ghostBtn}
                >
                  Go back
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setPending('cancel')} disabled={busy} className={dangerBtn}>
              Cancel account
            </button>
          )}
        </div>
      )}
      <ErrorLine text={error} />
    </Card>
  );
};

