import React from 'react';
import type { Urgency } from '../lib/leadView';

interface Props {
  urgency: Urgency;
  size?: 'row' | 'header' | 'phone';
}

/** EMERGENCY (red) or PRIORITY (gold). Nothing at all for a routine lead. */
export const UrgencyBadge: React.FC<Props> = ({ urgency, size = 'row' }) => {
  if (urgency === 'normal') return null;
  const emergency = urgency === 'emergency';
  const label = emergency ? 'EMERGENCY' : size === 'header' ? 'HIGH PRIORITY' : 'PRIORITY';
  const tone = emergency
    ? 'bg-red-500/10 border-red-400/40 text-red-300'
    : 'bg-[#141a29]/80 border-white/[0.09] text-[#ffc174] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]';
  const sizing =
    size === 'row'
      ? 'px-1.5 py-0.5 text-[11px] lg:text-[11px]'
      : size === 'header'
      ? 'px-2 py-0.5 text-[11px]'
      : 'px-1.5 py-0.5 text-[11px]';
  return (
    <span
      className={`inline-flex items-center rounded-md border font-body tracking-wide font-semibold shrink-0 ${tone} ${sizing}`}
    >
      {label}
    </span>
  );
};
