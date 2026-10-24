import React from 'react';
import { Card, Chip } from '../components/ui';
import { integrationInfo } from './catalog';
import { useIntegration } from './IntegrationsContext';
import type { IntegrationId } from '../domain';

/** Shown in place of a screen when its service is not plugged in yet. A clear message instead of an error. */
export const NotPluggedIn: React.FC<{ id: IntegrationId; goto?: (path: string) => void }> = ({ id, goto }) => {
  const info = integrationInfo(id);
  const { status } = useIntegration(id);
  const open = () => (goto ? goto(`/admin/integrations#${id}`) : window.location.assign(`/admin/integrations#${id}`));
  return (
    <Card title={`${info.name} is not plugged in yet`} hint={info.tagline} action={<Chip>Off</Chip>}>
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-sm font-semibold text-slate-100">What it turns on</div>
          <ul className="list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-slate-300">
            {info.unlocks.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
        </div>
        <p className="text-[15px] leading-relaxed text-slate-400">{info.withoutIt}</p>
        {status && status.missing.length > 0 && (
          <p className="text-[13px] leading-relaxed text-slate-500">
            Missing: <span className="font-data text-slate-300">{status.missing.join(', ')}</span>
          </p>
        )}
        <button
          type="button"
          onClick={open}
          className="inline-flex h-11 cursor-pointer items-center justify-center rounded-xl bg-[#f59e0b] px-5 font-display text-sm font-bold text-[#150f05] transition-colors hover:bg-[#fbbf24]"
        >
          Open the set-up guide
        </button>
      </div>
    </Card>
  );
};
