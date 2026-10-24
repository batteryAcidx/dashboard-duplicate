import React, { useCallback, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { callAdmin } from '../../../api';
import { useSynced } from '../../../lib/sync';
import { AdminConversations } from '../tabs/AdminConversations';
import { AdminOverview } from '../tabs/AdminOverview';
import { ControlsTab } from '../tabs/ControlsTab';
import { CalendarTab } from '../tabs/CalendarTab';
import { BillingTab } from '../tabs/BillingTab';
import { ActivityTab } from '../tabs/ActivityTab';
import { HealthTab } from '../tabs/HealthTab';
import { LegacyGhlCard } from '../tabs/LegacyGhlCard';
import { SetupTab } from '../tabs/SetupTab';
import { BusinessTab } from '../tabs/BusinessTab';
import { TwilioTab } from '../tabs/TwilioTab';
import { ClientDetail, fmtDate } from '../../../domain/accounts';
import { StatusChip, Pill, TerritoryTag, Card, ReadRow, LoadingBlock, RetryBlock } from '../shared';
import { DetailsCard } from './cards/DetailsCard';
import { TerritoriesCard } from './cards/TerritoriesCard';
import { OwnerCard } from './cards/OwnerCard';
import { StatusCard } from './cards/StatusCard';
import { DeleteClientCard } from './cards/DeleteClientCard';
import type { StepStatus } from '../../../domain';

export type Tab = 'overview' | 'setup' | 'business' | 'twilio' | 'calendar' | 'billing' | 'controls' | 'health' | 'conversations' | 'activity' | 'account';

export const ClientDetailView: React.FC<{
  accountId: string;
  goto: (p: string) => void;
  onDenied: () => void;
}> = ({ accountId, goto, onDenied }) => {
  const [detail, setDetail] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // coming back from Google with ?calendar=... lands on the Calendar tab
  const [tab, setTab] = useState<Tab>(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('calendar') ? 'calendar' : 'overview'));

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      setError(null);
      const r = await callAdmin<ClientDetail>('get_client', { account_id: accountId });
      if (r.status === 403) return onDenied();
      if (r.error || !r.data) {
        setError(r.status === 404 ? 'Client not found.' : r.error || 'Could not load this client.');
        setLoading(false);
        return;
      }
      setDetail(r.data);
      setLoading(false);
    },
    [accountId, onDenied]
  );

  const reload = useCallback(() => load(true), [load]);
  useSynced(reload, accountId);

  const saveStep = async (key: string, status: StepStatus, note: string): Promise<string | null> => {
    const r = await callAdmin('update_step', { account_id: accountId, step_key: key, status, note });
    if (r.error) return r.error;
    await load(true);
    return null;
  };

  return (
    <>
      <button
        type="button"
        onClick={() => goto('/admin')}
        className="mt-6 inline-flex cursor-pointer items-center gap-2 py-2 pr-3 font-display text-sm font-semibold text-slate-400 transition-colors hover:text-[#ffc174]"
      >
        <ArrowLeft className="h-4 w-4 text-[#ffc174]" />
        All clients
      </button>

      {loading ? (
        <LoadingBlock text="Loading client…" />
      ) : error || !detail ? (
        <RetryBlock text={error || 'Could not load this client.'} onRetry={() => load()} />
      ) : (
        <>
          <div className="mb-8 mt-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-100 leading-none">
                {detail.account.name}
              </h1>
              <StatusChip status={detail.account.status} />
              {detail.owner?.state === 'pending' && <Pill>Invite pending</Pill>}
              {detail.steps.some((s) => s.status === 'waiting_on_you') && <Pill tone="gold">Waiting on client</Pill>}
            </div>
            <div className="mt-2.5 flex items-center gap-2 flex-wrap text-sm text-slate-400">
              {detail.territories.length ? (
                detail.territories.map((t) => <TerritoryTag key={t.id} name={t.name} />)
              ) : (
                <span className="text-slate-500">No territory</span>
              )}
              <span className="text-slate-600">·</span>
              <span>{detail.owner?.email || 'No owner'}</span>
            </div>
          </div>

          <div role="tablist" className="mb-8 flex items-center gap-1 overflow-x-auto border-b border-white/[0.06] [scrollbar-width:none]">
            {(
              [
                ['overview', 'Overview'],
                ['setup', `Setup ${detail.steps.filter((s) => s.status === 'done').length}/${detail.steps.length}`],
                ['business', 'Business'],
                ['twilio', 'Twilio'],
                ['calendar', 'Calendar'],
                ['billing', 'Billing'],
                ['controls', 'Engine'],
                ['health', 'Health'],
                ['conversations', 'Conversations'],
                ['activity', 'Activity'],
                ['account', 'Account'],
              ] as [Tab, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`-mb-px shrink-0 cursor-pointer border-b-2 px-4 py-3.5 font-display text-[15px] font-semibold transition-colors ${
                  tab === key
                    ? 'border-[#f59e0b] text-slate-100'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* these two stay mounted so an open conversation survives switching tabs */}
          <div className={tab === 'overview' ? 'block space-y-4' : 'hidden'}>
            <p className="font-data text-xs text-slate-400">
              {detail.counts.leads} leads · {detail.counts.unread} unread · {detail.counts.last7} in the last 7 days
            </p>
            <AdminOverview accountId={accountId} call={callAdmin} onDenied={onDenied} />
          </div>
          <div className={tab === 'conversations' ? 'block' : 'hidden'}>
            <AdminConversations accountId={accountId} call={callAdmin} onDenied={onDenied} />
          </div>

          {tab === 'setup' && <SetupTab accountId={accountId} onSaveStep={saveStep} onDenied={onDenied} />}
          {tab === 'business' && <BusinessTab accountId={accountId} onDenied={onDenied} />}
          {tab === 'twilio' && <TwilioTab accountId={accountId} onDenied={onDenied} />}

          {tab === 'health' && <HealthTab accountId={accountId} onDenied={onDenied} />}
          {tab === 'controls' && <ControlsTab accountId={accountId} onDenied={onDenied} />}
          {tab === 'calendar' && <CalendarTab accountId={accountId} onDenied={onDenied} />}
          {tab === 'billing' && <BillingTab accountId={accountId} onDenied={onDenied} />}

          {tab === 'account' && (
            <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-2">
              <div className="space-y-8">
                <DetailsCard detail={detail} onSaved={reload} onDenied={onDenied} />
                <TerritoriesCard detail={detail} onChanged={reload} onDenied={onDenied} />
              </div>
              <div className="space-y-8">
                <OwnerCard detail={detail} onChanged={reload} onDenied={onDenied} />
                <Card title="From their Settings" hint="The client edits these themselves. The Business tab holds the details we keep about the company.">
                  <ReadRow label="Service area" value={detail.account.service_area || ''} />
                  <ReadRow label="Services" value={detail.account.services || ''} />
                  <ReadRow label="Notification phone" value={detail.account.notification_phone || ''} />
                  <ReadRow label="Created" value={fmtDate(detail.account.created_at)} />
                </Card>
                <StatusCard detail={detail} onChanged={reload} onDenied={onDenied} />
                <DeleteClientCard detail={detail} goto={goto} onDenied={onDenied} />
                <LegacyGhlCard accountId={detail.account.id} current={detail.account.ghl_location_id ?? null} onDenied={onDenied} onChanged={reload} />
              </div>
            </div>
          )}

          {tab === 'activity' && <ActivityTab accountId={accountId} onDenied={onDenied} />}
        </>
      )}
    </>
  );
};

/* ---------- the page ---------- */

