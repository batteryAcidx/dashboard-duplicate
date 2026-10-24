import React from 'react';
import { Chip, PageTitle } from '../components/ui';
import { INTEGRATIONS } from './catalog';
import { useIntegrations } from './IntegrationsContext';
import type { IntegrationState } from '../domain';

const STATE: Record<IntegrationState, { label: string; tone: 'ok' | 'gold' | 'danger' | 'plain' }> = {
  ready: { label: 'Plugged in', tone: 'ok' },
  not_configured: { label: 'Not plugged in', tone: 'gold' },
  manual: { label: 'Done by hand', tone: 'plain' },
  undecided: { label: 'To decide', tone: 'plain' },
  unknown: { label: 'Not checked', tone: 'plain' },
};

/** Is each service on, and what is missing? How to set it up is in the Wiki. */
export const IntegrationsPage: React.FC<{ goto?: (path: string) => void }> = ({ goto }) => {
  const { statuses, checked, checkFailed, recheck } = useIntegrations();
  const open = (path: string) => (goto ? goto(path) : window.location.assign(path));

  return (
    <>
      <PageTitle
        eyebrow="Admin"
        title="Integrations"
        subtitle="Which services are plugged in. Each one is independent and optional: one you have not plugged in simply says so where it would be used."
      />

      {checked && checkFailed && (
        <div className="mb-8 rounded-2xl border border-[#f59e0b]/30 bg-[#f59e0b]/[0.06] p-5 text-[15px] leading-relaxed text-slate-200">
          The status check could not run, so nothing below shows as plugged in. Deploy the <span className="font-data">integration-status</span> function, then{' '}
          <button type="button" onClick={() => recheck()} className="cursor-pointer text-[#ffc174] underline underline-offset-4">check again</button>.
        </div>
      )}

      <ul className="space-y-4">
        {INTEGRATIONS.map((info) => {
          const status = statuses?.[info.id];
          const st = STATE[status?.state ?? 'unknown'];
          return (
            <li key={info.id} id={info.id} className="rounded-2xl border border-white/[0.07] bg-[#0f1424] p-6 sm:px-7">
              <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-display text-lg font-bold tracking-tight text-slate-100">{info.name}</span>
                    <Chip tone={st.tone}>{st.label}</Chip>
                  </div>
                  <p className="mt-1.5 text-[15px] text-slate-400">{info.tagline}</p>
                  {status && status.missing.length > 0 && (
                    <p className="mt-2 text-[13px] text-slate-500">
                      Missing: <span className="font-data text-slate-300">{status.missing.join(', ')}</span>
                    </p>
                  )}
                  {status && status.warnings && status.warnings.length > 0 && (
                    <p className="mt-2 text-[13px] text-slate-500">
                      Recommended: <span className="font-data text-slate-300">{status.warnings.join(', ')}</span>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => open(`/admin/wiki#${info.id}`)}
                  className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 font-display text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.07]"
                >
                  How to set it up
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
};
