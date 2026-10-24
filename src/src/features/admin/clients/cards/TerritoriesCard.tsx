import React, { useState } from 'react';
import { callAdmin } from '../../../../api';
import { ClientDetail, fmtDate } from '../../../../domain/accounts';
import { inputCls, labelCls, primaryBtn, ghostBtn, Card, ErrorLine } from '../../shared';

export const TerritoriesCard: React.FC<{ detail: ClientDetail; onChanged: () => Promise<void>; onDenied: () => void }> = ({
  detail,
  onChanged,
  onDenied,
}) => {
  const [name, setName] = useState('');
  const [country, setCountry] = useState('US');
  const [region, setRegion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const cancelled = detail.account.status === 'cancelled';

  const run = async (action: string, payload: Record<string, unknown>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const r = await callAdmin(action, payload);
    setBusy(false);
    if (r.status === 403) {
      onDenied();
      return false;
    }
    if (r.error) {
      setError(r.error);
      return false;
    }
    await onChanged();
    return true;
  };

  const assign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run('assign_territory', { account_id: detail.account.id, name, country, region })) {
      setName('');
      setRegion('');
    }
  };

  return (
    <Card
      title="Territories"
      hint="A territory can be locked by one client at a time. Use one naming scheme (for example area codes), so two names can never cover the same ground."
    >
      {detail.territories.length === 0 ? (
        <p className="text-sm text-slate-400">No territory locked yet.</p>
      ) : (
        <ul className="space-y-2">
          {detail.territories.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-[#0e1322] border border-[#252939]">
              <div className="min-w-0">
                <span className="font-display text-sm font-bold text-slate-100">{t.name}</span>
                <span className="ml-2 text-[11px] text-slate-500 font-data">
                  {t.country}
                  {t.region ? ` · ${t.region}` : ''} · since {fmtDate(t.locked_at)}
                </span>
              </div>
              {pending === t.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-300">Release it?</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      if (await run('release_territory', { territory_id: t.id })) setPending(null);
                    }}
                    className={primaryBtn}
                  >
                    Yes
                  </button>
                  <button type="button" disabled={busy} onClick={() => setPending(null)} className={ghostBtn}>No</button>
                </div>
              ) : (
                <button type="button" disabled={busy} onClick={() => setPending(t.id)} className={ghostBtn}>Release</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {cancelled ? (
        <p className="text-xs text-slate-500">This client is cancelled. Reactivate it before locking a territory.</p>
      ) : (
        <form onSubmit={assign} className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_auto] gap-3 items-end pt-1">
          <div>
            <label htmlFor="a-name" className={labelCls}>Lock a territory</label>
            <input id="a-name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="214" className={inputCls} />
          </div>
          <div>
            <label htmlFor="a-country" className={labelCls}>Country</label>
            <select id="a-country" value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls}>
              <option value="US">US</option>
              <option value="CA">CA</option>
            </select>
          </div>
          <div>
            <label htmlFor="a-region" className={labelCls}>State</label>
            <input id="a-region" maxLength={10} value={region} onChange={(e) => setRegion(e.target.value)} placeholder="TX" className={inputCls} />
          </div>
          <button type="submit" disabled={busy} className={primaryBtn}>Lock</button>
        </form>
      )}
      <ErrorLine text={error} />
    </Card>
  );
};

