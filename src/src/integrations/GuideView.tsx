import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { CopyField } from './CopyField';
import type { Guide, GuideStep } from './guide';
import { getGuideProgress, setGuideProgress } from '../lib/preferences';

const StepBody: React.FC<{ step: GuideStep }> = ({ step }) => (
  <div className="space-y-4">
    {step.body.map((p) => (
      <p key={p} className="text-[15px] leading-relaxed text-slate-300">{p}</p>
    ))}
    {step.copy?.map((c) => (
      <CopyField key={c.label} item={c} />
    ))}
    {step.link && (
      <a href={step.link.href} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-semibold text-[#ffc174] underline-offset-4 hover:underline">
        {step.link.label}
      </a>
    )}
    {step.note && <p className="rounded-xl border border-[#f59e0b]/25 bg-[#f59e0b]/[0.06] p-4 text-[14px] leading-relaxed text-slate-200">{step.note}</p>}
  </div>
);

/** A guide as a checklist. Ticks are remembered in this browser, so you can stop and come back. */
export const GuideView: React.FC<{ guide: Guide; initialDone?: number[] }> = ({ guide, initialDone }) => {
  const [done, setDone] = useState<number[]>(() => initialDone ?? getGuideProgress(guide.id));
  const toggle = (i: number) => {
    const next = done.includes(i) ? done.filter((n) => n !== i) : [...done, i];
    setDone(next);
    setGuideProgress(guide.id, next);
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <p className="text-[15px] leading-relaxed text-slate-300">{guide.intro}</p>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">How long</dt><dd className="mt-0.5 text-slate-200">{guide.time}</dd></div>
          <div><dt className="text-slate-500">What it costs</dt><dd className="mt-0.5 text-slate-200">{guide.cost}</dd></div>
        </dl>
      </div>

      <div className="text-sm text-slate-400">{done.length} of {guide.steps.length} steps ticked</div>

      <ol className="space-y-6">
        {guide.steps.map((step, i) => {
          const isDone = done.includes(i);
          return (
            <li key={step.title} className="flex gap-4">
              <button
                type="button"
                role="checkbox"
                aria-checked={isDone}
                aria-label={`Mark step ${i + 1} as done`}
                onClick={() => toggle(i)}
                className={`mt-0.5 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors ${
                  isDone ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-300' : 'border-white/[0.15] text-slate-400 hover:border-[#f59e0b]/60'
                }`}
              >
                {isDone ? <Check className="h-4 w-4" /> : <span className="text-sm font-semibold">{i + 1}</span>}
              </button>
              <div className="min-w-0 flex-1 space-y-3">
                <h3 className={`font-display text-base font-bold tracking-tight ${isDone ? 'text-slate-500 line-through decoration-slate-600' : 'text-slate-100'}`}>{step.title}</h3>
                <StepBody step={step} />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="rounded-2xl border border-white/[0.07] bg-[#0a0f1d] p-6">
        <div className="mb-3 text-sm font-semibold text-slate-100">How to know it works</div>
        <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-slate-300">
          {guide.checks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>

      {guide.later && guide.later.length > 0 && (
        <div className="space-y-6 border-t border-white/[0.06] pt-8">
          <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">Later, not needed yet</div>
          {guide.later.map((step) => (
            <div key={step.title} className="space-y-3">
              <h3 className="font-display text-base font-bold tracking-tight text-slate-100">{step.title}</h3>
              <StepBody step={step} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
