import React from 'react';
import { URGENCY_LABEL } from '../lib/leadView';
import type { Urgency } from '../lib/leadView';

interface Props {
  urgency: Urgency;
  size?: 'row' | 'header' | 'phone';
  /** the lead was flagged, but it is closed now (won, lost, or the visit is over): shown quietly, as history */
  muted?: boolean;
}

/** EMERGENCY (red) or HIGH PRIORITY (gold), the same words everywhere. Nothing at all for a routine lead. */
export const UrgencyBadge: React.FC<Props> = ({ urgency, size = 'row', muted = false }) => {
  if (urgency === 'normal') return null;
  const emergency = urgency === 'emergency';
  const label = URGENCY_LABEL[urgency].toUpperCase();
  const tone = muted
    ? 'bg-transparent border-white/[0.08] text-slate-500'
    : emergency
    ? 'bg-red-500/10 border-red-400/40 text-red-300'
    : 'bg-[#141a29]/80 border-white/[0.09] text-[#ffc174] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]';
  const sizing = size === 'header' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-0.5 text-[11px]';
  return (
    <span
      title={muted ? `${URGENCY_LABEL[urgency]}, no longer active` : undefined}
      className={`inline-flex items-center rounded-md border font-body tracking-wide font-semibold shrink-0 whitespace-nowrap ${tone} ${sizing}`}
    >
      {label}
    </span>
  );
};
