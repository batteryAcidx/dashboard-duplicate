import React, { useState } from 'react';
import { callAdmin } from '../../../api';
import { TIMEZONES } from '../../../domain/accounts';
import { inputCls, labelCls, primaryBtn, ghostBtn, ErrorLine } from '../shared';

export const CreateClientForm: React.FC<{
  onDone: (r: { account_id: string; owner_email: string; name: string }) => void;
  onCancel: () => void;
  onDenied: () => void;
}> = ({ onDone, onCancel, onDenied }) => {
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [territory, setTerritory] = useState('');
  const [country, setCountry] = useState('US');
  const [tz, setTz] = useState('America/Chicago');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const r = await callAdmin<{ account_id: string; owner_email: string }>('create_client', {
      company_name: company,
      owner_email: email,
      owner_name: ownerName,
      territory,
      territory_country: country,
      timezone: tz,
    });
    setSaving(false);
    if (r.status === 403) return onDenied();
    if (r.error || !r.data) return setError(r.error || 'Could not create the client.');
    onDone({ account_id: r.data.account_id, owner_email: r.data.owner_email, name: company.trim() });
  };

  return (
    <form onSubmit={submit} className="space-y-6 rounded-2xl border border-white/[0.07] bg-[#0f1424] p-6 sm:p-7">
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="c-company" className={labelCls}>Company name</label>
          <input id="c-company" required maxLength={100} value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} />
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">This appears in their texts ("Summit Roofing here..."), so use the name homeowners know.</p>
        </div>
        <div>
          <label htmlFor="c-email" className={labelCls}>Owner email</label>
          <input id="c-email" type="email" required autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="c-name" className={labelCls}>Owner name</label>
          <input id="c-name" maxLength={80} value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="c-territory" className={labelCls}>Territory (optional)</label>
          <input id="c-territory" maxLength={100} value={territory} onChange={(e) => setTerritory(e.target.value)} placeholder="214" className={inputCls} />
        </div>
        <div>
          <label htmlFor="c-country" className={labelCls}>Country</label>
          <select id="c-country" value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls}>
            <option value="US">United States</option>
            <option value="CA">Canada</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="c-tz" className={labelCls}>Time zone</label>
          <select id="c-tz" value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls}>
            {TIMEZONES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <ErrorLine text={error} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className={primaryBtn}>
          {saving ? 'Creating…' : 'Create and send invite'}
        </button>
        <button type="button" onClick={onCancel} className={ghostBtn}>Cancel</button>
      </div>
    </form>
  );
};

/* ---------- new client: its own page ---------- */

