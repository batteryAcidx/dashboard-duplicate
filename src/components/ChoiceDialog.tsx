import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** small print at the bottom: who changed it and when, or a reminder */
  footer?: React.ReactNode;
}

/**
 * A small dialog in the middle of the screen, on a phone and on a computer, with the page dimmed behind it.
 * Press outside it, press Escape, or press the x to close. Used for the "Who is this?" and "Set status" choices.
 */
export const ChoiceDialog: React.FC<DialogProps> = ({ title, onClose, children, footer }) => {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = `dialog-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    // the page behind does not scroll while the dialog is open
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const node = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-5">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl border border-white/[0.09] bg-[#0f1424] shadow-[0_24px_64px_rgba(0,0,0,0.6)] outline-none"
      >
        <div className="flex items-center justify-between gap-4 px-5 pb-1 pt-5">
          <h2 id={titleId} className="font-display text-lg font-bold tracking-tight text-slate-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-2 pb-2 pt-1">{children}</div>
        {footer && <div className="border-t border-white/[0.06] px-5 py-3.5 text-[13px] leading-snug text-slate-500">{footer}</div>}
      </div>
    </div>
  );

  // a portal keeps it centered on the screen whatever it is placed inside; there is no document when rendered on a server
  return typeof document === 'undefined' ? node : createPortal(node, document.body);
};

/** One choice: a round marker, a name, and a short line of help. The chosen one is filled in gold. */
export const ChoiceRow: React.FC<{ selected: boolean; label: string; hint?: string; disabled?: boolean; onClick: () => void }> = ({ selected, label, hint, disabled, onClick }) => (
  <button
    type="button"
    role="radio"
    aria-checked={selected}
    disabled={disabled}
    onClick={onClick}
    className="flex w-full cursor-pointer items-center gap-3.5 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/[0.04] disabled:cursor-default disabled:opacity-50"
  >
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${selected ? 'border-[#f59e0b]' : 'border-slate-600'}`}
    >
      {selected && <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />}
    </span>
    <span className="min-w-0">
      <span className={`block text-[15px] font-semibold ${selected ? 'text-slate-100' : 'text-slate-200'}`}>{label}</span>
      {hint && <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">{hint}</span>}
    </span>
  </button>
);
