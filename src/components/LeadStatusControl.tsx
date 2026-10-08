import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export type LeadStatus = 'booked' | 'following_up' | 'needs_you' | 'not_a_lead' | 'won' | 'lost';

export const STATUS_LABEL: Record<LeadStatus, string> = {
  booked: 'Booked',
  following_up: 'Following up',
  needs_you: 'Needs you',
  not_a_lead: 'Not a lead',
  won: 'Won',
  lost: 'Lost',
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
}

export const LeadStatusControl: React.FC<Props> = ({
  status,
  finalValue,
  changedBy,
  changedAtLabel,
  onChange,
}) => {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'list' | 'value'>('list');
  const [valueText, setValueText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setView('list');
    setError(null);
  };

  // close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

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
      ? 'text-[#ffc174] bg-[#261d10] border-[#f59e0b]/50'
      : status === 'lost' || status === 'not_a_lead'
      ? 'text-slate-400 bg-[#0a0e19] border-[#232a3f]'
      : 'text-slate-200 bg-[#141a29]/80 border-white/[0.12]';

  return (
    <div className="relative inline-block" ref={ref}>
      {/* The chip */}
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-['Space_Grotesk'] text-xs sm:text-[13px] font-bold cursor-pointer transition-colors ${chipTone}`}
      >
        <span>
          {STATUS_LABEL[status]}
          {status === 'won' && finalValue ? ` · ${money(finalValue)}` : ''}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* dim backdrop, phones only */}
          <div className="fixed inset-0 z-40 bg-black/50 sm:hidden" onClick={close} aria-hidden="true" />

          {/* bottom sheet on phones, dropdown on larger screens */}
          <div
            role="menu"
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-[#222c42] bg-[#0f1422] p-2 pb-6 shadow-[0_-12px_32px_rgba(0,0,0,0.6)] sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2 sm:w-64 sm:rounded-xl sm:border sm:p-1.5 sm:pb-1.5 sm:shadow-[0_12px_32px_rgba(0,0,0,0.65)]"
          >
            {view === 'list' ? (
              <>
                <div className="px-3 pt-2 pb-1.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                  Set status
                </div>

                {ORDER.map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="menuitem"
                    disabled={saving}
                    onClick={() => handlePick(s)}
                    className="w-full flex items-center justify-between gap-3 px-3 py-3 sm:py-2 rounded-lg text-left text-sm font-['Space_Grotesk'] font-bold text-slate-200 hover:bg-[#192236] cursor-pointer disabled:opacity-50"
                  >
                    <span>{STATUS_LABEL[s]}</span>
                    {s === status && <Check className="w-4 h-4 text-[#ffc174]" />}
                  </button>
                ))}

                {status === 'won' && (
                  <button
                    type="button"
                    onClick={() => handlePick('won')}
                    className="w-full px-3 py-2 text-left font-['JetBrains_Mono'] text-xs text-slate-400 hover:text-[#ffc174] cursor-pointer"
                  >
                    {finalValue ? 'Edit job value' : 'Add job value'}
                  </button>
                )}

                {error && (
                  <p role="alert" className="px-3 py-1.5 text-xs text-red-400 font-['Inter']">
                    {error}
                  </p>
                )}

                {/* who changed it, and when */}
                <div className="mt-1 border-t border-[#1b2336] px-3 pt-2.5 pb-1 font-['JetBrains_Mono'] text-[11px] text-slate-500">
                    {changedBy === 'owner'
                    ? 'Updated by you'
                    : changedBy === 'support'
                    ? 'Updated by WedgeScale support'
                    : 'Updated automatically'}
                  {changedAtLabel ? ` · ${changedAtLabel}` : ''}
                </div>
              </>
            ) : (
              <div className="p-3 space-y-3">
                <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                  Final job value
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-['JetBrains_Mono'] text-sm text-slate-400">$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    value={valueText}
                    onChange={(e) => setValueText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveValue();
                    }}
                    placeholder="12500"
                    className="flex-1 min-w-0 bg-[#090d18] border border-[#232839] focus:border-[#f59e0b] focus:outline-none rounded-lg px-3 py-2 text-sm font-['JetBrains_Mono'] text-slate-100 placeholder:text-slate-600"
                  />
                </div>
                {error && (
                  <p role="alert" className="text-xs text-red-400 font-['Inter']">
                    {error}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveValue}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-[#f59e0b] hover:bg-[#fbbf24] text-[#150f05] font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setView('list');
                      setError(null);
                    }}
                    className="px-3 py-2 font-['JetBrains_Mono'] text-xs uppercase tracking-wider text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};