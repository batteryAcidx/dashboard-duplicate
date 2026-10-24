import React, { useState } from 'react';
import type { CopyItem } from './guide';

/** A value you are meant to paste somewhere else, with one press to copy it. */
export const CopyField: React.FC<{ item: CopyItem }> = ({ item }) => {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.value);
      setState('copied');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2500);
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-slate-400">{item.label}</span>
        <button type="button" onClick={copy} className="cursor-pointer text-[13px] font-semibold text-[#ffc174] transition-colors hover:text-[#fbbf24]">
          {state === 'copied' ? 'Copied' : state === 'failed' ? 'Select and copy by hand' : 'Copy'}
        </button>
      </div>
      <pre className="font-data overflow-x-auto whitespace-pre-wrap break-all rounded-xl border border-white/[0.08] bg-[#090d18] p-3.5 text-[13px] leading-relaxed text-slate-200 select-all">{item.value}</pre>
    </div>
  );
};
