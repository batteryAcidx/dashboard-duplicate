import React, { useState } from 'react';
import type { ChartData } from '../lib/chart';

export const OverviewChart: React.FC<{ chart: ChartData }> = ({ chart }) => {
  const [active, setActive] = useState<number | null>(null);
  const { buckets, top, unit, totalCaptured, totalBooked } = chart;
  const gap = buckets.length > 12 ? 'gap-[2px]' : 'gap-1.5 sm:gap-2';
  const sel = active !== null && buckets[active] ? buckets[active] : null;
  const pct = (n: number) => (n / top) * 100;

  return (
    <section aria-label="Missed calls and bookings" className="rounded-xl bg-[#0e1322] border border-[#252939] p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-['Space_Grotesk'] text-base font-bold text-slate-100 tracking-tight">
            Missed calls and bookings
          </h3>
          <p className="mt-0.5 text-xs text-slate-400">{unit === 'hour' ? 'By hour' : 'By day'}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-300 font-['JetBrains_Mono']">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#3a4766]" />
            Missed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#f59e0b]" />
            Booked
          </span>
        </div>
      </div>

      {totalCaptured === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No missed calls in this period.</p>
      ) : (
        <>
          <div className="mt-5 flex gap-2">
            <div
              className="relative w-6 shrink-0 h-40 sm:h-48 text-right font-['JetBrains_Mono'] text-xs text-slate-500"
              aria-hidden="true"
            >
              <span className="absolute right-0 top-0 -translate-y-1/2">{top}</span>
              <span className="absolute right-0 top-1/2 -translate-y-1/2">{top / 2}</span>
              <span className="absolute right-0 bottom-0 translate-y-1/2">0</span>
            </div>

            <div className="flex-1 min-w-0" onMouseLeave={() => setActive(null)}>
              <div className="relative h-40 sm:h-48">
                <div className="absolute inset-x-0 top-0 border-t border-[#1b2336]" aria-hidden="true" />
                <div className="absolute inset-x-0 top-1/2 border-t border-[#1b2336]" aria-hidden="true" />
                <div className="absolute inset-x-0 bottom-0 border-t border-[#2b354d]" aria-hidden="true" />

                <div role="group" aria-label="Bars by period" className={`absolute inset-0 flex items-end ${gap}`}>
                  {buckets.map((b, i) => (
                    <button
                      key={b.key}
                      type="button"
                      aria-label={`${b.title}: ${b.captured} missed, ${b.booked} booked`}
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onClick={() => setActive(i)}
                      className={`flex-1 min-w-0 h-full flex items-end justify-center rounded-sm outline-none cursor-pointer ${
                        active === i ? 'bg-white/[0.05]' : ''
                      }`}
                    >
                      {b.captured > 0 && (
                        <span
                          className={`relative block w-full max-w-[32px] rounded-t-[3px] bg-[#3a4766] overflow-hidden transition-opacity ${
                            active !== null && active !== i ? 'opacity-50' : ''
                          }`}
                          style={{ height: `${pct(b.captured)}%`, minHeight: 4 }}
                        >
                          {b.booked > 0 && (
                            <span
                              className="absolute inset-x-0 bottom-0 bg-[#f59e0b]"
                              style={{ height: `${(b.booked / b.captured) * 100}%` }}
                            />
                          )}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className={`mt-2 flex ${gap}`} aria-hidden="true">
                {buckets.map((b) => (
                  <div key={b.key} className="relative flex-1 min-w-0 h-5">
                    {b.showLabel && (
                      <span className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-['JetBrains_Mono'] text-xs text-slate-400">
                        {b.label}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p aria-live="polite" className="mt-3 min-h-[20px] text-sm text-slate-300 font-['JetBrains_Mono']">
            {sel
              ? `${sel.title} · ${sel.captured} missed · ${sel.booked} booked`
              : `${totalCaptured} missed · ${totalBooked} booked`}
          </p>
        </>
      )}
    </section>
  );
};