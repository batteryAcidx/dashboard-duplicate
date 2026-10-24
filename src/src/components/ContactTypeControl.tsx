import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ContactType, PICKABLE_TYPES, TYPE_HINT, TYPE_LABEL } from '../lib/leadView';
import { ChoiceDialog, ChoiceRow } from './ChoiceDialog';

interface Props {
  type: ContactType;
  needsReview: boolean;
  // returns an error message, or null when saved
  onChange: (type: ContactType) => Promise<string | null>;
  /** start with the dialog open (used by tests) */
  initialOpen?: boolean;
}

/** "Who is this?" One tap to confirm what the assistant guessed, or to correct it. */
export const ContactTypeControl: React.FC<Props> = ({ type, needsReview, onChange, initialOpen = false }) => {
  const [open, setOpen] = useState(initialOpen);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setError(null);
  };

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
  const chipTone = attention ? 'border-[#f59e0b]/45 bg-[#f59e0b]/10 text-[#ffc174]' : 'border-white/[0.1] bg-white/[0.03] text-slate-200';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Who is this? Currently ${TYPE_LABEL[type]}`}
        className={`inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors hover:bg-white/[0.06] ${chipTone}`}
      >
        <span>
          {TYPE_LABEL[type]}
          {needsReview ? ' · confirm' : ''}
        </span>
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>

      {open && (
        <ChoiceDialog
          title="Who is this?"
          onClose={close}
          footer={
            needsReview
              ? 'Sorted automatically. Tap a type to confirm it or change it.'
              : type === 'unknown'
              ? 'Not sorted yet. Pick the closest match.'
              : 'Vendors and crew are never texted or booked.'
          }
        >
          <div role="radiogroup" aria-label="Who is this?">
            {PICKABLE_TYPES.map((t) => (
              <ChoiceRow key={t} selected={t === type} label={TYPE_LABEL[t]} hint={TYPE_HINT[t]} disabled={saving} onClick={() => pick(t)} />
            ))}
          </div>
          {error && (
            <p role="alert" className="px-3 pb-2 pt-1 text-[13px] text-red-400">
              {error}
            </p>
          )}
        </ChoiceDialog>
      )}
    </>
  );
};
