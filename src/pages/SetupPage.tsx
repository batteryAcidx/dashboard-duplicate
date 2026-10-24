import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { isConfigured, ownerApi } from '../api';
import { useSynced } from '../lib/sync';
import { getCachedCompany, setCachedCompany, setCachedSetup } from '../lib/accountCache';
import { AppHeader } from '../components/AppHeader';
import { PlatformFooter } from '../components/PlatformFooter';
import { SetupStepCard } from '../components/SetupStepCard';
import { SetupNeeds } from '../components/SetupNeeds';
import type { ClientStep } from '../domain/index';
import { Notice } from '../components/ui';
import { submitErrorText } from '../domain/setup';

interface SetupPageProps {
  onNavigate?: (path: string) => void;
  onSignOut?: () => void;
  userEmail?: string;
}

interface Calendar {
  status: string;
  label: string | null;
}

export const SetupPage: React.FC<SetupPageProps> = ({ onNavigate, onSignOut, userEmail = '' }) => {
  const [steps, setSteps] = useState<ClientStep[]>([]);
  const [companyName, setCompanyName] = useState(getCachedCompany(userEmail));
  const [accountId, setAccountId] = useState<string | null>(null);
  const [tz, setTz] = useState('America/Chicago');
  const [accountStatus, setAccountStatus] = useState('setup');
  const [calendar, setCalendar] = useState<Calendar | null>(null);
  const [registration, setRegistration] = useState<{ status: string; submitted_at: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!isConfigured) {
      setError('The dashboard is not connected to its database. Contact support.');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);

    const [acc, st, cal, reg] = await Promise.all([
      ownerApi.account.withId(),
      ownerApi.setup.steps(),
      ownerApi.setup.calendarConnection(),
      ownerApi.registration.get(),
    ]);

    if (acc.data) {
      setAccountId(acc.data.id);
      if (acc.data.name) {
        setCompanyName(acc.data.name);
        setCachedCompany(userEmail, acc.data.name);
      }
      if (acc.data.timezone) setTz(acc.data.timezone);
      if (acc.data.status) {
        setAccountStatus(acc.data.status);
        setCachedSetup(userEmail, acc.data.status === 'setup');
      }
    }
    setRegistration(reg.data?.status ? { status: reg.data.status, submitted_at: reg.data.submitted_at ?? null } : null);
    setCalendar(cal.data && cal.data.provider !== 'none' ? { status: cal.data.status, label: cal.data.calendar_label ?? null } : null);

    if (st.error) {
      if (!silent) setError(st.error.message || 'Failed to load setup progress.');
    } else {
      setError(null);
      setSteps((st.data as ClientStep[]) || []);
    }
    setLoading(false);
  }, [userEmail]);

  useEffect(() => {
    load();
  }, [load]);

  // the one main Sync keeps this page fresh
  useSynced(() => load(true), '', { initial: false });

  // Google sends the owner back here with ?calendar=connected or ?calendar=error
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('calendar');
    if (!result) return;
    url.searchParams.delete('calendar');
    window.history.replaceState({}, '', url.pathname + (url.search || ''));
    if (result === 'connected') {
      setBanner({ tone: 'ok', text: 'Your calendar is connected. Thank you.' });
      ownerApi.setup.syncCalendar(accountId).finally(() => load(true));
    } else {
      setBanner({ tone: 'error', text: 'The calendar was not connected. Please try again, and make sure the calendar box is ticked.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goto = (path: string) => {
    if (onNavigate) onNavigate(path);
    else window.location.assign(path);
  };

  const submitInfo = async (stepKey: string, values: Record<string, string>): Promise<string | null> => {
    const { error: err } = await ownerApi.setup.submitInfo(stepKey, values);
    if (err) return submitErrorText(err);
    await load(true);
    return null;
  };

  const connectCalendar = async (): Promise<string | null> => {
    if (!accountId) return 'Something went wrong. Please try again.';
    const { data, error: err } = await ownerApi.setup.connectCalendar(accountId);
    if (err || !data?.url) return 'We could not open Google right now. Please try again, or reply to our email and we will help.';
    window.location.assign(data.url);
    return null;
  };

  const total = steps.length;
  const done = steps.filter((s) => s.status === 'done').length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const isLive = accountStatus === 'live' || (total > 0 && done === total);

  return (
    <div className="min-h-screen w-full bg-[#090e1c] font-body text-[#dee1f7]">
      <AppHeader companyName={companyName} userEmail={userEmail} current="setup" showSetup onNavigate={goto} onSignOut={onSignOut} />

      <main className="mx-auto max-w-3xl px-5 pb-[max(5rem,env(safe-area-inset-bottom))] sm:px-8">

        {loading ? (
          <div role="status" aria-label="Loading setup progress" className="mt-6 animate-pulse space-y-4">
            <div className="h-4 w-16 rounded bg-white/[0.05]" />
            <div className="h-10 w-72 max-w-full rounded bg-white/[0.05]" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl border border-white/[0.06] bg-[#0f1424]" />
            ))}
          </div>
        ) : error ? (
          <div className="mx-auto max-w-md space-y-5 py-20 text-center">
            <p className="text-base text-slate-300">{error}</p>
            <button
              type="button"
              onClick={() => load()}
              className="inline-flex h-12 cursor-pointer items-center gap-2 rounded-xl bg-[#f59e0b] px-6 font-display text-sm font-bold text-[#150f05]"
            >
              <RotateCcw className="h-4 w-4" />
              Try again
            </button>
          </div>
        ) : total === 0 ? (
          <div className="mt-10 flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.09] p-10 text-center">
            <h2 className="mb-2 font-display text-xl font-bold tracking-tight text-slate-200">Your setup checklist is on its way</h2>
            <p className="max-w-xs text-[15px] leading-relaxed text-slate-400">
              It will appear here shortly. Questions? Email{' '}
              <a href="mailto:contact@wedgescale.com" className="text-[#ffc174] underline underline-offset-4">contact@wedgescale.com</a>.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-8 mt-6">
              <span className="mb-2 block text-sm font-semibold text-[#f59e0b]">Setup</span>
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-100 sm:text-4xl">
                {isLive ? "You're live." : 'Getting you live.'}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-300">
                {isLive
                  ? 'Every missed call gets a reply within minutes.'
                  : `${done} of ${total} steps complete. Carrier approval typically takes 2 to 3 weeks, and we keep working on everything else in the meantime.`}
              </p>
              {!isLive && (
                <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]" aria-hidden="true">
                  <div className="h-full rounded-full bg-[#f59e0b] transition-all duration-500" style={{ width: `${percent}%` }} />
                </div>
              )}
            </div>

            {banner && (
              <div className="mb-6">
                <Notice tone={banner.tone}>{banner.text}</Notice>
              </div>
            )}

            {!isLive && <SetupNeeds steps={steps} />}

            <ol className="space-y-4">
              {steps.map((s) => (
                <SetupStepCard key={`${s.id}:${s.status}:${s.info_submitted_at ?? ''}`} step={s} tz={tz} calendar={calendar} registration={registration} onOpenRegistration={() => goto('/registration')} onSubmit={submitInfo} onConnectCalendar={connectCalendar} />
              ))}
            </ol>

            <p className="mt-10 text-sm leading-relaxed text-slate-400">
              Questions? Email{' '}
              <a href="mailto:contact@wedgescale.com" className="text-[#ffc174] underline underline-offset-4">contact@wedgescale.com</a>.
            </p>
          </>
        )}
      </main>
      <PlatformFooter />
    </div>
  );
};
