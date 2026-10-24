import React, { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, Chip, PageTitle } from '../components/ui';
import { BACKEND_URL, APP_URL } from '../lib/config';
import { INTEGRATIONS } from './catalog';
import { GuideView } from './GuideView';
import { useIntegrations } from './IntegrationsContext';
import { KIND_LABEL, WAITING, waitingByKind } from './waiting';
import type { WaitKind } from './waiting';
import type { IntegrationState } from '../domain';

const STATE: Record<IntegrationState, { label: string; tone: 'ok' | 'gold' | 'danger' | 'plain' }> = {
  ready: { label: 'Plugged in', tone: 'ok' },
  not_configured: { label: 'Not plugged in', tone: 'gold' },
  manual: { label: 'Done by hand', tone: 'plain' },
  undecided: { label: 'To decide', tone: 'plain' },
  unknown: { label: 'Not checked', tone: 'plain' },
};

const KINDS: WaitKind[] = ['now', 'waiting', 'decide', 'build'];

/** Every pluggable service on one page: is it on, what does it need, and how to plug it in. */
export const IntegrationsPage: React.FC = () => {
  const { statuses, checked, checkFailed, recheck } = useIntegrations();
  const [openId, setOpenId] = useState<string | null>(typeof window !== 'undefined' ? window.location.hash.replace('#', '') || null : null);

  useEffect(() => {
    const onHash = () => setOpenId(window.location.hash.replace('#', '') || null);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const ctx = { backendUrl: BACKEND_URL, appUrl: APP_URL };

  return (
    <>
      <PageTitle
        eyebrow="Admin"
        title="Integrations"
        subtitle="Each service plugs in on its own, in any order. Nothing here is needed for the rest of the app to work, and a service you have not plugged in just says so."
      />

      {checked && checkFailed && (
        <div className="mb-8 rounded-2xl border border-[#f59e0b]/30 bg-[#f59e0b]/[0.06] p-5 text-[15px] leading-relaxed text-slate-200">
          The status check could not run, so nothing below shows as plugged in. Deploy the <span className="font-data">integration-status</span> function (it is in every guide), then{' '}
          <button type="button" onClick={() => recheck()} className="cursor-pointer text-[#ffc174] underline underline-offset-4">check again</button>.
        </div>
      )}

      <ul className="space-y-5">
        {INTEGRATIONS.map((info) => {
          const status = statuses?.[info.id];
          const state: IntegrationState = status?.state ?? 'unknown';
          const st = STATE[state];
          const open = openId === info.id;
          return (
            <li key={info.id} id={info.id} className="rounded-2xl border border-white/[0.07] bg-[#0f1424]">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : info.id)}
                aria-expanded={open}
                className="flex w-full cursor-pointer items-center gap-4 p-6 text-left sm:px-7"
              >
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
                <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && (
                <div className="space-y-8 border-t border-white/[0.06] p-6 sm:p-7">
                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                      <div className="mb-2 text-sm font-semibold text-slate-100">What it turns on</div>
                      <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-slate-300">
                        {info.unlocks.map((u) => (
                          <li key={u}>{u}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="mb-2 text-sm font-semibold text-slate-100">Without it</div>
                      <p className="text-[15px] leading-relaxed text-slate-300">{info.withoutIt}</p>
                    </div>
                  </div>
                  <GuideView guide={info.guide(ctx)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-14">
        <h2 className="mb-2 font-display text-2xl font-extrabold tracking-tight text-slate-100">What you are waiting for</h2>
        <p className="mb-8 max-w-2xl text-[15px] leading-relaxed text-slate-400">
          Some steps depend on someone else. This shows which ones, how long they usually take, and what you can do while you wait. {WAITING.length} items.
        </p>
        <div className="space-y-10">
          {KINDS.map((kind) => (
            <section key={kind}>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">{KIND_LABEL[kind]}</h3>
              <ul className="space-y-4">
                {waitingByKind(kind).map((w) => (
                  <li key={w.id}>
                    <Card title={w.title}>
                      <dl className="space-y-3 text-[15px] leading-relaxed">
                        <div className="grid gap-1 sm:grid-cols-[130px_1fr] sm:gap-4"><dt className="text-slate-500">Who</dt><dd className="text-slate-200">{w.who}</dd></div>
                        <div className="grid gap-1 sm:grid-cols-[130px_1fr] sm:gap-4"><dt className="text-slate-500">How long</dt><dd className="text-slate-200">{w.typical}</dd></div>
                        <div className="grid gap-1 sm:grid-cols-[130px_1fr] sm:gap-4"><dt className="text-slate-500">It blocks</dt><dd className="text-slate-200">{w.blocks}</dd></div>
                        <div className="grid gap-1 sm:grid-cols-[130px_1fr] sm:gap-4"><dt className="text-slate-500">Meanwhile</dt><dd className="text-slate-200">{w.meanwhile}</dd></div>
                      </dl>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </>
  );
};
