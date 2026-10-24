import React, { useEffect, useState } from 'react';
import { Chip, PageTitle } from '../components/ui';
import { APP_URL, BACKEND_URL } from '../lib/config';
import { INTEGRATIONS, integrationInfo } from './catalog';
import { GuideView } from './GuideView';
import { useIntegrations } from './IntegrationsContext';
import { START_HERE, WIKI_TOPICS, isWikiTopic } from './wiki';
import type { IntegrationId, IntegrationState } from '../domain';

const STATE_LABEL: Record<IntegrationState, { label: string; tone: 'ok' | 'gold' | 'plain' }> = {
  ready: { label: 'Plugged in', tone: 'ok' },
  not_configured: { label: 'Not plugged in', tone: 'gold' },
  manual: { label: 'Done by hand', tone: 'plain' },
  undecided: { label: 'To decide', tone: 'plain' },
  unknown: { label: 'Not checked', tone: 'plain' },
};

const readTopic = (): string => {
  if (typeof window === 'undefined') return 'start';
  const id = window.location.hash.replace('#', '');
  return isWikiTopic(id) ? id : 'start';
};

/** For you, not for clients: how to set things up. Reached from the footer. */
export const WikiPage: React.FC<{ initialTopic?: string }> = ({ initialTopic }) => {
  const [topic, setTopic] = useState<string>(initialTopic && isWikiTopic(initialTopic) ? initialTopic : readTopic());
  const { statuses } = useIntegrations();

  useEffect(() => {
    const onHash = () => setTopic(readTopic());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const ctx = { backendUrl: BACKEND_URL, appUrl: APP_URL };
  const info = INTEGRATIONS.find((i) => i.id === topic);
  const status = info ? statuses?.[info.id as IntegrationId] : undefined;
  const st = STATE_LABEL[status?.state ?? 'unknown'];

  return (
    <>
      <PageTitle eyebrow="Admin" title="Wiki" subtitle="How to set things up. This is for you, not for clients." />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[230px_minmax(0,1fr)] lg:gap-12">
        <nav aria-label="Wiki topics" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] lg:sticky lg:top-6 lg:mx-0 lg:block lg:space-y-1 lg:self-start lg:overflow-visible lg:px-0">
          {WIKI_TOPICS.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              aria-current={topic === t.id ? 'page' : undefined}
              className={`block shrink-0 whitespace-nowrap rounded-xl px-4 py-2.5 text-[15px] font-semibold transition-colors lg:whitespace-normal ${
                topic === t.id ? 'bg-white/[0.07] text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.label}
            </a>
          ))}
        </nav>

        <section aria-live="polite" className="min-w-0">
          {topic === 'start' && (
            <div className="space-y-10">
              <p className="max-w-2xl text-[15px] leading-relaxed text-slate-300">
                The order to do things in. You do not need a client for most of it, and each service is optional.
              </p>
              <ol className="space-y-8">
                {START_HERE.map((p, i) => (
                  <li key={p.title} className="flex gap-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.15] text-sm font-semibold text-slate-300">{i + 1}</span>
                    <div className="min-w-0 space-y-3">
                      <h2 className="font-display text-lg font-bold tracking-tight text-slate-100">{p.title}</h2>
                      <p className="text-[15px] leading-relaxed text-slate-400">{p.why}</p>
                      <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-slate-300">
                        {p.items.map((it) => (
                          <li key={it}>{it}</li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {info && (
            <div className="space-y-8">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-display text-2xl font-extrabold tracking-tight text-slate-100">{info.name}</h2>
                  <Chip tone={st.tone}>{st.label}</Chip>
                </div>
                <p className="mt-2 text-[15px] text-slate-400">{info.tagline}</p>
              </div>
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
              <GuideView key={info.id} guide={integrationInfo(info.id).guide(ctx)} />
            </div>
          )}

        </section>
      </div>
    </>
  );
};
