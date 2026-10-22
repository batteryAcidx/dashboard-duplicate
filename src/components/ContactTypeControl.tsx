import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { ContactType, PICKABLE_TYPES, TYPE_HINT, TYPE_LABEL } from '../lib/leadView';

interface Props {
  type: ContactType;
  needsReview: boolean;
  // returns an error message, or null when saved
  onChange: (type: ContactType) => Promise<string | null>;
}

/** "Who is this?" One tap to confirm what the assistant guessed, or to correct it. Same look as the status control. */
export const ContactTypeControl: React.FC<Props> = ({ type, needsReview, onChange }) => {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setError(null);
  };

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

  const pick = async (next: ContactType) => {
    // tapping the current type only matters when it is waiting to be confirmed
    if (next === type && !needsReview) {
      close();
      return;
    }
    setSaving(true);
    setError(null);
    const err = await onChange(next);
    setSaving(false);
    if (err) setError(err);
    else close();
  };

  const attention = type === 'unknown' || needsReview;
  const chipTone = attention
    ? 'text-[#ffc174] bg-[#261d10] border-[#f59e0b]/50'
    : 'text-slate-200 bg-[#141a29]/80 border-white/[0.12]';

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Who is this? Currently ${TYPE_LABEL[type]}`}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-['Space_Grotesk'] text-xs sm:text-[13px] font-bold cursor-pointer transition-colors ${chipTone}`}
      >
        <span>
          {TYPE_LABEL[type]}
          {needsReview ? ' · confirm' : ''}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50 sm:hidden" onClick={close} aria-hidden="true" />
          <div
            role="menu"
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-[#222c42] bg-[#0f1422] p-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:w-72 sm:rounded-xl sm:border sm:p-1.5 sm:pb-1.5 sm:shadow-[0_12px_32px_rgba(0,0,0,0.65)]"
          >
            <div className="px-3 pt-2 pb-1.5 font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
              Who is this?
            </div>

            {PICKABLE_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                role="menuitem"
                disabled={saving}
                onClick={() => pick(t)}
                className="w-full flex items-center justify-between gap-3 px-3 py-3 sm:py-2 rounded-lg text-left hover:bg-[#192236] cursor-pointer disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-['Space_Grotesk'] font-bold text-slate-200">{TYPE_LABEL[t]}</span>
                  <span className="block text-[11px] font-['JetBrains_Mono'] text-slate-500">{TYPE_HINT[t]}</span>
                </span>
                {t === type && <Check className="w-4 h-4 text-[#ffc174] shrink-0" />}
              </button>
            ))}

            {error && (
              <p role="alert" className="px-3 py-1.5 text-xs text-red-400 font-['Inter']">
                {error}
              </p>
            )}

            <div className="mt-1 border-t border-[#1b2336] px-3 pt-2.5 pb-1 font-['JetBrains_Mono'] text-[11px] text-slate-500 leading-snug">
              {needsReview
                ? 'Sorted automatically. Tap a type to confirm it or change it.'
                : type === 'unknown'
                ? 'Not sorted yet. Pick the closest match.'
                : 'Vendors and crew are never texted or booked.'}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
