import React, { useState } from 'react';
import { callAdmin } from '../../../../api';
import { ClientDetail, TIMEZONES } from '../../../../domain/accounts';
import { inputCls, labelCls, primaryBtn, Card, ErrorLine } from '../../shared';

export const DetailsCard: React.FC<{ detail: ClientDetail; onSaved: () => Promise<void>; onDenied: () => void }> = ({
  detail,
  onSaved,
  onDenied,
}) => {
  const [name, setName] = useState(detail.account.name);
  const [tz, setTz] = useState(detail.account.timezone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const dirty = name.trim() !== detail.account.name || tz !== detail.account.timezone;
  const tzKnown = TIMEZONES.some(([v]) => v === tz);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    const r = await callAdmin('update_client', { account_id: detail.account.id, name, timezone: tz });
    setSaving(false);
    if (r.status === 403) return onDenied();
    if (r.error) return setError(r.error);
    await onSaved();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card
      title="Details"
      hint="The company name appears in this client's texts (“Summit Roofing here…”), so change it only when it is really changing."
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="d-name" className={labelCls}>Company name</label>
          <input id="d-name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label htmlFor="d-tz" className={labelCls}>Time zone</label>
          <select id="d-tz" value={tz} onChange={(e) => setTz(e.target.value)} className={inputCls}>
            {!tzKnown && <option value={tz}>{tz}</option>}
            {TIMEZONES.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={save} disabled={!dirty || saving} className={primaryBtn}>
          {saving ? 'Saving…' : 'Save details'}
        </button>
        {saved && <span className="font-data text-xs text-[#ffc174]">Saved</span>}
        <ErrorLine text={error} />
      </div>
    </Card>
  );
};

