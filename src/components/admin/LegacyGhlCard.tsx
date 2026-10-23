import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button, Field, Notice, inputCls } from '../ui';

/**
 * GoHighLevel is no longer how clients are connected. This stays, folded away, in case a client ever needs it:
 * the location id can still be set or cleared here.
 */
export const LegacyGhlCard: React.FC<{ accountId: string; current: string | null; onDenied: () => void; onChanged?: () => void }> = ({
  accountId,
  current,
  onDenied,
  onChanged,
}) => {
  const [value, setValue] = useState(current ?? '');
  const [saved, setSaved] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const save = async (next: string) => {
    setBusy(true);
    setError(null);
    setNote(null);
    const { data, error: err } = await supabase.rpc('admin_set_legacy_ghl', { p_account_id: accountId, p_location_id: next });
    setBusy(false);
    if (err) {
      if (err.message.includes('forbidden')) return onDenied();
      setError(err.message.includes('bad_ghl_location') ? 'Use only letters, numbers, dashes and underscores.' : 'Could not save. Check your connection and try again.');
      return;
    }
    setSaved((data as string | null) ?? null);
    setValue((data as string | null) ?? '');
    setNote(data ? 'Saved' : 'Cleared');
    onChanged?.();
  };

  return (
    <details className="group rounded-2xl border border-white/[0.07] bg-[#0f1424]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-6 text-left sm:px-7">
        <span>
          <span className="block font-display text-lg font-semibold tracking-tight text-slate-100">Legacy connection</span>
          <span className="mt-1 block text-sm text-slate-400">
            GoHighLevel. {saved ? 'A location is set.' : 'Not used.'} No longer the main connection.
          </span>
        </span>
        <ChevronDown className="h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-5 border-t border-white/[0.06] p-6 sm:px-7">
        <p className="text-sm leading-relaxed text-slate-400">
          Texting runs through the WedgeScale engine now. Keep this only if a client ever has to be set up through GoHighLevel again.
        </p>
        <Field id="ghl-loc" label="GHL location id">
          <input id="ghl-loc" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Not set" autoCapitalize="off" autoCorrect="off" className={inputCls} />
        </Field>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => save(value)} disabled={busy || value.trim() === (saved ?? '')}>
            {busy ? 'Saving…' : 'Save'}
          </Button>
          <Button tone="quiet" onClick={() => save('')} disabled={busy || !saved}>
            Clear
          </Button>
          {note && <Notice tone="ok">{note}</Notice>}
        </div>
      </div>
    </details>
  );
};
