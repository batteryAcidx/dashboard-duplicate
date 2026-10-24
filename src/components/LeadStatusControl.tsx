import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ChoiceDialog, ChoiceRow } from './ChoiceDialog';

export type LeadStatus = 'booked' | 'following_up' | 'needs_you' | 'not_a_lead' | 'won' | 'lost';

export const STATUS_LABEL: Record<LeadStatus, string> = {
  booked: 'Booked',
  following_up: 'Following up',
  needs_you: 'Needs you',
  not_a_lead: 'Not a lead',
  won: 'Won',
  lost: 'Lost',
};

/** One short line under each choice, so nobody has to guess what it does. */
export const STATUS_HINT: Record<LeadStatus, string> = {
  booked: 'An inspection is on the calendar',
  following_up: 'We are still texting them',
  needs_you: 'Waiting for you to step in',
  won: 'You got the job',
  lost: 'It did not work out',
  not_a_lead: 'Wrong number, spam or a vendor',
};

const ORDER: LeadStatus[] = ['booked', 'following_up', 'needs_you', 'won', 'lost', 'not_a_lead'];

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

interface Props {
  status: LeadStatus;
  finalValue: number | null;
  changedBy: 'system' | 'owner' | 'support';
  changedAtLabel: string;
  // returns an error message, or null when saved
  onChange: (status: LeadStatus, finalValue: number | null) => Promise<string | null>;
  /** start with the dialog open, on the list or on the job-value step (used by tests) */
  initialOpen?: boolean | 'value';
}

export const LeadStatusControl: React.FC<Props> = ({ status, finalValue, changedBy, changedAtLabel, onChange, initialOpen = false }) => {
  const [open, setOpen] = useState(Boolean(initialOpen));
  const [view, setView] = useState<'list' | 'value'>(initialOpen === 'value' ? 'value' : 'list');
  const [valueText, setValueText] = useState(finalValue ? String(finalValue) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setView('list');
    setError(null);
  };

  const save = async (next: LeadStatus, value: number | null) => {
    setSaving(true);
    setError(null);
    const err = await onChange(next, value);
    setSaving(false);
    if (err) setError(err);
    else close();
  };

  const handlePick = (next: LeadStatus) => {
    if (next === 'won') {
      setValueText(finalValue ? String(finalValue) : '');
      setView('value');
      setError(null);
      return;
    }
    if (next === status) {
      close();
      return;
    }
    save(next, null);
  };

  const handleSaveValue = () => {
    const clean = valueText.replace(/[^0-9.]/g, '');
    const n = Number(clean);
    if (!clean || Number.isNaN(n) || n <= 0 || n > 1000000) {
      setError('Enter the job value in dollars, for example 12500.');
      return;
    }
    save('won', Math.round(n));
  };

  const chipTone =
    status === 'won' || status === 'needs_you'
      ? 'border-[#f59e0b]/45 bg-[#f59e0b]/10 text-[#ffc174]'
      : status === 'lost' || status === 'not_a_lead'
      ? 'border-white/[0.07] bg-transparent text-slate-500'
      : 'border-white/[0.1] bg-white/[0.03] text-slate-200';

  const who = changedBy === 'owner' ? 'Updated by you' : changedBy === 'support' ? 'Updated by WedgeScale support' : 'Updated automatically';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Status: ${STATUS_LABEL[status]}. Change it.`}
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors hover:bg-white/[0.06] ${chipTone}`}
      >
        <span>
          {STATUS_LABEL[status]}
          {status === 'won' && finalValue ? ` · ${money(finalValue)}` : ''}
        </span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>

      {open && (
        <ChoiceDialog title={view === 'list' ? 'Set status' : 'Final job value'} onClose={close} footer={view === 'list' ? `${who}${changedAtLabel ? ` · ${changedAtLabel}` : ''}` : undefined}>
          {view === 'list' ? (
            <>
              <div role="radiogroup" aria-label="Set status">
                {ORDER.map((s) => (
                  <ChoiceRow key={s} selected={s === status} label={STATUS_LABEL[s]} hint={STATUS_HINT[s]} disabled={saving} onClick={() => handlePick(s)} />
                ))}
              </div>
              {status === 'won' && (
                <button
                  type="button"
                  onClick={() => handlePick('won')}
                  className="mx-3 mb-2 mt-1 cursor-pointer text-[13px] font-semibold text-[#ffc174] underline-offset-4 hover:underline"
                >
                  {finalValue ? 'Edit job value' : 'Add job value'}
                </button>
              )}
              {error && (
                <p role="alert" className="px-3 pb-2 pt-1 text-[13px] text-red-400">
                  {error}
                </p>
              )}
            </>
          ) : (
            <div className="space-y-4 px-3 pb-3 pt-2">
              <p className="text-[13px] leading-snug text-slate-500">What did the job come to? It shows on your dashboard as money won.</p>
              <div className="flex items-center gap-2 rounded-xl border border-white/[0.1] bg-[#090d18] px-4 focus-within:border-[#f59e0b]">
                <span className="font-data text-lg text-slate-500">$</span>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  aria-label="Final job value in dollars"
                  value={valueText}
                  onChange={(e) => setValueText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveValue();
                  }}
                  placeholder="12,500"
                  className="h-14 min-w-0 flex-1 bg-transparent font-data text-xl text-slate-100 outline-none placeholder:text-slate-700"
                />
              </div>
              {error && (
                <p role="alert" className="text-[13px] text-red-400">
                  {error}
                </p>
              )}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleSaveValue}
                  disabled={saving}
                  className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl bg-[#f59e0b] px-6 font-display text-sm font-bold text-[#150f05] transition-colors hover:bg-[#fbbf24] disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setView('list');
                    setError(null);
                  }}
                  className="inline-flex h-11 cursor-pointer items-center px-3 text-sm font-semibold text-slate-400 transition-colors hover:text-slate-200"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </ChoiceDialog>
      )}
    </>
  );
};
