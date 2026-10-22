import React from 'react';
import type { DetailRow, Urgency } from '../lib/leadView';

interface Props {
  rows: DetailRow[];
  why?: string;
  urgency?: Urgency;
  urgencyReason?: string;
}

/** What the assistant learned, and why this one is with the owner. Shows nothing when there is nothing to say. */
export const LeadDetailsCard: React.FC<Props> = ({ rows, why, urgency = 'normal', urgencyReason }) => {
  const flagged = urgency !== 'normal' && Boolean(urgencyReason);
  if (rows.length === 0 && !why && !flagged) return null;

  return (
    <div className="mb-5 rounded-xl bg-[#0e1322] border border-[#252939] p-4 space-y-3" aria-label="What we know">
      {flagged && (
        <div
          className={`flex items-start gap-2 text-sm font-['Space_Grotesk'] font-bold ${
            urgency === 'emergency' ? 'text-red-300' : 'text-[#ffc174]'
          }`}
        >
          <span
            className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${urgency === 'emergency' ? 'bg-red-400' : 'bg-[#ffc174]'}`}
            aria-hidden="true"
          />
          <span>
            {urgency === 'emergency' ? 'Emergency' : 'Priority'}: {urgencyReason}
          </span>
        </div>
      )}

      {why && (
        <div className="flex items-start gap-2 text-sm text-slate-200 font-['Inter']">
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-slate-500 mr-2">With you</span>
            {why}
          </span>
        </div>
      )}

      {rows.length > 0 && (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
          {rows.map((r) => (
            <div key={r.label} className="min-w-0">
              <dt className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                {r.label}
              </dt>
              <dd className="text-sm text-slate-100 font-['Inter'] break-words">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};
