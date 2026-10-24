import React from 'react';
import { needLine } from '../domain';
import type { ClientStep } from '../domain';

/**
 * "What we need from you": one short sentence per thing, in the client's words.
 * It says what we need and why, never just the name of a step.
 */
export const SetupNeeds: React.FC<{ steps: ClientStep[] }> = ({ steps }) => {
  const waiting = steps.filter((s) => s.status === 'waiting_on_you');
  if (waiting.length === 0) return null;
  return (
    <div className="mb-8 rounded-2xl border border-[#f59e0b]/35 bg-[#f59e0b]/[0.06] p-6">
      <p className="mb-4 text-sm font-semibold text-[#ffc174]">What we need from you</p>
      <ul className="space-y-3">
        {waiting.map((s) => (
          <li key={s.id} className="flex gap-3 text-[15px] leading-relaxed text-slate-100">
            <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffc174]" />
            <span>{needLine(s)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[13px] text-slate-400">Send it in the step below, or just reply to our email.</p>
    </div>
  );
};
