import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AppHeader } from '../components/AppHeader';
import { PlatformFooter } from '../components/PlatformFooter';
import { Chip, Notice, PageTitle } from '../components/ui';
import { RegistrationFormView } from '../features/registration/RegistrationFormView';
import { isConfigured, ownerApi } from '../api';
import { getCachedCompany, setCachedCompany, getCachedSetup } from '../lib/accountCache';
import {
  EMPTY_REGISTRATION, PATH_LABEL, REGISTRATION_STATUS, formFromSaved, registrationErrorText, registrationLocked, registrationPath, registrationPayload, validateRegistration,
} from '../domain';
import type { RegistrationErrors, RegistrationForm, RegistrationSaved } from '../domain';

interface Props {
  onNavigate?: (path: string) => void;
  onSignOut?: () => void;
  userEmail?: string;
}

/** The business registration form. Opened from the setup step that asks for it, or from the link in our email. */
export const RegistrationPage: React.FC<Props> = ({ onNavigate, onSignOut, userEmail = '' }) => {
  const [company, setCompany] = useState(getCachedCompany(userEmail));
  const [saved, setSaved] = useState<RegistrationSaved | null>(null);
  const [form, setForm] = useState<RegistrationForm>(EMPTY_REGISTRATION);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [thanks, setThanks] = useState(false);

  const goto = (path: string) => (onNavigate ? onNavigate(path) : window.location.assign(path));

  const load = useCallback(async () => {
    if (!isConfigured) return setLoading(false);
    const [acc, reg] = await Promise.all([ownerApi.account.nameOnly(), ownerApi.registration.get()]);
    if (acc.data?.name) {
      setCompany(acc.data.name);
      setCachedCompany(userEmail, acc.data.name);
    }
    const s = reg.data ?? {};
    setSaved(s);
    setForm(formFromSaved(s as never));
    setLoading(false);
  }, [userEmail]);

  useEffect(() => {
    load();
  }, [load]);

  const change = (patch: Partial<RegistrationForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      for (const k of Object.keys(patch) as (keyof RegistrationForm)[]) delete next[k];
      return next;
    });
  };

  const submit = async () => {
    setSubmitError(null);
    const found = validateRegistration(form, { hasSavedEin: Boolean(saved?.ein_last4) });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    const { data, ein } = registrationPayload(form);
    const r = await ownerApi.registration.submit(data, ein);
    setBusy(false);
    if (r.error) return setSubmitError(registrationErrorText(r.error));
    setThanks(true);
    window.scrollTo?.({ top: 0 });
    await load();
  };

  const status = saved?.status ?? 'draft';
  const locked = registrationLocked(status);
  const info = REGISTRATION_STATUS[status] ?? REGISTRATION_STATUS.draft;
  const sent = status !== 'draft' && Boolean(saved?.submitted_at);

  return (
    <div className="min-h-screen w-full bg-[#090e1c] font-body text-[#dee1f7]">
      <AppHeader companyName={company} userEmail={userEmail} current="registration" showSetup={getCachedSetup(userEmail)} onNavigate={goto} onSignOut={onSignOut} />
      <main className="mx-auto max-w-3xl px-5 pb-[max(5rem,env(safe-area-inset-bottom))] sm:px-8">
        <button
          type="button"
          onClick={() => goto('/setup')}
          className="mt-4 -ml-1 inline-flex cursor-pointer items-center gap-2 py-2.5 pl-1 pr-3 font-display text-sm font-semibold text-slate-400 transition-colors hover:text-[#ffc174]"
        >
          <ArrowLeft className="h-4 w-4" />
          Setup
        </button>

        <PageTitle
          eyebrow="Setup"
          title="Business registration"
          subtitle="Carriers require every business that sends texts to be registered first. This takes about 5 minutes, and it is the one form we need from you for it."
        />

        {loading ? (
          <div role="status" className="animate-pulse space-y-4">
            <div className="h-56 rounded-2xl border border-white/[0.06] bg-[#0f1424]" />
            <div className="h-40 rounded-2xl border border-white/[0.06] bg-[#0f1424]" />
          </div>
        ) : (
          <>
            {sent && (
              <div className="mb-8 space-y-3 rounded-2xl border border-white/[0.07] bg-[#0f1424] p-6">
                <div className="flex flex-wrap items-center gap-3">
                  <Chip tone={info.tone}>{info.label}</Chip>
                  <span className="text-[15px] text-slate-300">{info.clientLine}</span>
                </div>
                {saved?.note && <Notice tone="error">{saved.note}</Notice>}
                {thanks && <Notice tone="ok">Thank you. We have your details.</Notice>}
                {saved?.has_ein !== undefined && <p className="text-sm text-slate-500">Registering as: {PATH_LABEL[registrationPath(saved.has_ein)]}</p>}
              </div>
            )}

            {locked ? (
              <p className="rounded-2xl border border-dashed border-white/[0.09] p-8 text-center text-[15px] leading-relaxed text-slate-400">
                Your details are approved and being filed, so they cannot be changed here. If something is wrong, email{' '}
                <a href="mailto:contact@wedgescale.com" className="text-[#ffc174] underline underline-offset-4">contact@wedgescale.com</a>.
              </p>
            ) : (
              <RegistrationFormView
                value={form}
                errors={errors}
                onChange={change}
                onSubmit={submit}
                busy={busy}
                savedEinLast4={saved?.ein_last4}
                submitError={submitError}
                submitLabel={sent ? 'Send the update' : 'Send registration details'}
              />
            )}
          </>
        )}
      </main>
      <PlatformFooter />
    </div>
  );
};
