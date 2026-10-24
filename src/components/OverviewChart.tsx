import React, { useState } from 'react';
import type { ChartData, LabelAlign } from '../lib/chart';

const ALIGN: Record<LabelAlign, string> = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
};

const Stat: React.FC<{ value: number; label: string; accent?: boolean }> = ({ value, label, accent }) => (
  <span className="inline-flex items-baseline gap-1.5">
    <span className={`font-display text-3xl font-extrabold tracking-tight ${accent ? 'text-[#ffc174]' : 'text-slate-100'}`}>{value}</span>
    <span className="text-sm text-slate-400">{label}</span>
  </span>
);

/**
 * Missed calls and bookings. The numbers lead; the bars are the detail.
 * Press or hover a bar and the numbers above change to that day or hour.
 * Date labels are placed so the first and last never run off the edge on a narrow screen.
 */
export const OverviewChart: React.FC<{ chart: ChartData }> = ({ chart }) => {
  const [active, setActive] = useState<number | null>(null);
  const { buckets, top, unit, totalCaptured, totalBooked } = chart;
  const gap = buckets.length > 12 ? 'gap-[2px]' : 'gap-1.5 sm:gap-2';
  const sel = active !== null && buckets[active] ? buckets[active] : null;
  const pct = (n: number) => (n / top) * 100;
  const period = unit === 'hour' ? 'Last 24 hours, by hour' : `Last ${buckets.length} days, by day`;

  return (
    <section aria-label="Missed calls and bookings" className="rounded-2xl border border-white/[0.07] bg-[#0f1424] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-400">Missed calls and bookings</h3>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <Stat value={sel ? sel.captured : totalCaptured} label="missed" />
            <Stat value={sel ? sel.booked : totalBooked} label="booked" accent />
          </div>
          <p className="mt-1.5 min-h-[20px] text-[13px] text-slate-500">{sel ? sel.title : period}</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#3a4766]" />
            Missed
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#f59e0b]" />
            Booked
          </span>
        </div>
      </div>

      {totalCaptured === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No missed calls in this period.</p>
      ) : (
        <div className="mt-6 flex gap-2.5">
          <div className="relative h-36 w-5 shrink-0 text-right font-data text-[11px] text-slate-600 sm:h-48" aria-hidden="true">
            <span className="absolute right-0 top-0 -translate-y-1/2">{top}</span>
            <span className="absolute right-0 top-1/2 -translate-y-1/2">{top / 2}</span>
            <span className="absolute bottom-0 right-0 translate-y-1/2">0</span>
          </div>

          <div className="min-w-0 flex-1" onMouseLeave={() => setActive(null)}>
            <div className="relative h-36 sm:h-48">
              <div className="absolute inset-x-0 top-0 border-t border-dashed border-white/[0.06]" aria-hidden="true" />
              <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-white/[0.06]" aria-hidden="true" />
              <div className="absolute inset-x-0 bottom-0 border-t border-white/[0.1]" aria-hidden="true" />

              <div role="group" aria-label="Bars by period" className={`absolute inset-0 flex items-end ${gap}`}>
                {buckets.map((b, i) => (
                  <button
                    key={b.key}
                    type="button"
                    aria-label={`${b.title}: ${b.captured} missed, ${b.booked} booked`}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onClick={() => setActive(active === i ? null : i)}
                    className={`flex h-full min-w-0 flex-1 cursor-pointer items-end justify-center rounded-md outline-none transition-colors ${active === i ? 'bg-white/[0.05]' : ''}`}
                  >
                    {b.captured > 0 && (
                      <span
                        className={`relative block w-full max-w-[32px] overflow-hidden rounded-t-[5px] bg-[#3a4766] transition-opacity ${active !== null && active !== i ? 'opacity-40' : ''}`}
                        style={{ height: `${pct(b.captured)}%`, minHeight: 4 }}
                      >
                        {b.booked > 0 && <span className="absolute inset-x-0 bottom-0 bg-[#f59e0b]" style={{ height: `${(b.booked / b.captured) * 100}%` }} />}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className={`mt-2.5 flex ${gap}`} aria-hidden="true">
              {buckets.map((b) => (
                <div key={b.key} className="relative h-5 min-w-0 flex-1">
                  {b.showLabel && <span className={`absolute whitespace-nowrap font-data text-[11px] text-slate-500 sm:text-xs ${ALIGN[b.align]}`}>{b.label}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {sel ? `${sel.title}: ${sel.captured} missed, ${sel.booked} booked` : `${totalCaptured} missed, ${totalBooked} booked. ${period}`}
      </p>
    </section>
  );
};
