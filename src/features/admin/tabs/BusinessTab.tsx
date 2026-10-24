import React, { useCallback, useRef, useState } from 'react';
import { adminApi } from '../../../api';
import { Button, Card, Field, Notice, inputCls } from '../../../components/ui';
import { useSynced } from '../../../lib/sync';
import { adminErrorText } from '../../../domain/index';
import type { Business } from '../../../domain/index';

const FIELDS: { key: keyof Business; label: string; hint?: string; wide?: boolean; type?: string }[] = [
  { key: 'legal_name', label: 'Legal business name', hint: 'As it appears on their registration. Used for the texting registration.', wide: true },
  { key: 'website', label: 'Website', type: 'url' },
  { key: 'license_number', label: 'License number' },
  { key: 'address1', label: 'Street address', wide: true },
  { key: 'city', label: 'City' },
  { key: 'region', label: 'State' },
  { key: 'postal_code', label: 'ZIP code' },
  { key: 'public_phone', label: 'The number customers call', type: 'tel' },
];
const CONTACT: typeof FIELDS = [
  { key: 'contact_name', label: 'Contact name' },
  { key: 'contact_email', label: 'Contact email', type: 'email' },
  { key: 'contact_phone', label: 'Contact mobile', type: 'tel' },
];

const toForm = (b: Business): Record<string, string> => Object.fromEntries([...FIELDS, ...CONTACT, { key: 'notes' }].map((f) => [f.key, (b as Record<string, string | null | undefined>)[f.key as string] ?? '']));

export const BusinessTab: React.FC<{ accountId: string; onDenied: () => void; initial?: Business }> = ({ accountId, onDenied, initial }) => {
  const [form, setForm] = useState<Record<string, string> | null>(initial ? toForm(initial) : null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = useRef(false);

  const fail = (m: string) => {
    if (m.includes('forbidden')) return onDenied();
    setError(adminErrorText(m));
  };

  // refreshes quietly, but never over something being typed
  const load = useCallback(async () => {
    const r = await adminApi.business.get(accountId);
    if (r.error) return fail(r.error);
    setError(null);
    if (!dirty.current) setForm(toForm(r.data as Business));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  useSynced(load, accountId);

  const set = (k: string) => (v: string) => {
    dirty.current = true;
    setSaved(false);
    setForm((f) => ({ ...(f as Record<string, string>), [k]: v }));
  };

  const save = async () => {
    if (!form) return;
    setBusy(true);
    setError(null);
    const r = await adminApi.business.save(accountId, form);
    setBusy(false);
    if (r.error) return fail(r.error);
    dirty.current = false;
    setForm(toForm(r.data as Business));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  if (!form) return <p className="py-16 text-center text-sm text-slate-400">{error ?? 'Loading business details…'}</p>;

  const input = (f: (typeof FIELDS)[number]) => (
    <div key={f.key} className={f.wide ? 'sm:col-span-2' : ''}>
      <Field id={`b-${f.key}`} label={f.label} hint={f.hint}>
        <input id={`b-${f.key}`} type={f.type ?? 'text'} value={form[f.key as string] ?? ''} onChange={(e) => set(f.key as string)(e.target.value)} className={inputCls} />
      </Field>
    </div>
  );

  return (
    <div className="space-y-8">
      {error && <Notice tone="error">{error}</Notice>}

      <Card title="The business" hint="What carriers and customers see. Anything the client sends in a setup step can be copied here with one press.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{FIELDS.map(input)}</div>
      </Card>

      <Card title="Who to contact" hint="The person at the business we deal with day to day.">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{CONTACT.map(input)}</div>
      </Card>

      <Card title="Notes" hint="Private to the admin team. Not shown to the client.">
        <Field id="b-notes" label="Notes">
          <textarea id="b-notes" value={form.notes ?? ''} onChange={(e) => set('notes')(e.target.value)} rows={4} maxLength={1000} className={`${inputCls} h-auto py-3`} />
        </Field>
      </Card>

      <div className="flex items-center gap-4">
        <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save business info'}</Button>
        {saved && <Notice tone="ok">Saved</Notice>}
      </div>
    </div>
  );
};
