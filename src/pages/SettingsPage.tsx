import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown, LogOut, RotateCcw } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Keep in sync with Supabase: Authentication > Sign In / Providers > Email > Minimum password length
const MIN_PASSWORD_LENGTH = 10;

const JOB_TYPES = [
  { key: 'repair', label: 'Repair', hint: 'Leaks, flashing, a few shingles' },
  { key: 'storm_damage', label: 'Storm damage', hint: 'Hail, wind and tree damage, often insurance' },
  { key: 'full_reroof', label: 'Full reroof', hint: 'Complete replacement' },
  { key: 'commercial', label: 'Commercial', hint: 'Flat roofs and larger buildings' },
];

/* ---------- small helpers ---------- */

function toE164(input: string): string | null {
  let d = input.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return d.length === 10 ? `+1${d}` : null;
}

function formatPhone(e164: string | null): string {
  if (!e164) return '';
  const d = e164.replace(/^\+1/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

const hhmm = (t: string | null | undefined, fallback: string) => (t || fallback).slice(0, 5);

interface SaveState {
  saving: boolean;
  error: string | null;
  saved: boolean;
}

function useSave() {
  const [state, setState] = useState<SaveState>({ saving: false, error: null, saved: false });
  const run = async (fn: () => Promise<string | null>) => {
    setState({ saving: true, error: null, saved: false });
    const err = await fn();
    setState({ saving: false, error: err, saved: !err });
    if (!err) setTimeout(() => setState((s) => ({ ...s, saved: false })), 3000);
  };
  return [state, run] as const;
}

const inputCls =
  "w-full bg-[#090d18] border border-[#232839] focus:border-[#f59e0b] focus:outline-none rounded-lg px-3 py-2.5 text-sm font-['Inter'] text-slate-100 placeholder:text-slate-600 disabled:opacity-60";

/* ---------- small building blocks ---------- */

const Card: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="p-5 sm:p-6 rounded-xl bg-[#111625] border border-[#22283a]">
    <h2 className="font-['Space_Grotesk'] text-base sm:text-lg font-bold text-slate-100 tracking-tight">{title}</h2>
    {hint && <p className="mt-1 text-xs sm:text-[13px] text-slate-400 leading-relaxed">{hint}</p>}
    <div className="mt-4 space-y-4">{children}</div>
  </section>
);

const Field: React.FC<{ id: string; label: string; hint?: string; children: React.ReactNode }> = ({
  id,
  label,
  hint,
  children,
}) => (
  <div className="space-y-1.5">
    <label
      htmlFor={id}
      className="block font-['JetBrains_Mono'] text-[11px] uppercase tracking-widest text-slate-400 font-semibold"
    >
      {label}
    </label>
    {children}
    {hint && <p className="text-[11.5px] text-slate-500 leading-relaxed">{hint}</p>}
  </div>
);

const ReadRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-4 text-sm">
    <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-widest text-slate-500 font-semibold pt-0.5">
      {label}
    </span>
    <span className="text-slate-200 text-right break-words min-w-0">{value || '—'}</span>
  </div>
);

const SaveRow: React.FC<{ state: SaveState; onSave: () => void; label?: string }> = ({
  state,
  onSave,
  label = 'Save changes',
}) => (
  <div className="pt-1 flex items-center gap-3 flex-wrap">
    <button
      type="button"
      onClick={onSave}
      disabled={state.saving}
      className="px-4 py-2 rounded-lg bg-[#f59e0b] hover:bg-[#fbbf24] text-[#150f05] font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider cursor-pointer disabled:opacity-50"
    >
      {state.saving ? 'Saving…' : label}
    </button>
    {state.saved && <span className="font-['JetBrains_Mono'] text-xs text-[#ffc174]">Saved</span>}
    {state.error && (
      <span role="alert" className="text-xs text-red-400 font-['Inter']">
        {state.error}
      </span>
    )}
  </div>
);

/* ---------- the page ---------- */

interface SettingsPageProps {
  onNavigate?: (path: string) => void;
  onSignOut?: () => void;
  userEmail?: string;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onNavigate, onSignOut, userEmail = '' }) => {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [userId, setUserId] = useState('');
  const [loginEmail, setLoginEmail] = useState(userEmail);
  const [accountId, setAccountId] = useState('');

  // read-only
  const [companyName, setCompanyName] = useState('');
  const [territory, setTerritory] = useState('');
  const [tz, setTz] = useState('');
  const [calendarStatus, setCalendarStatus] = useState<string | null>(null);

  // editable
  const [fullName, setFullName] = useState('');
  const [phoneText, setPhoneText] = useState('');
  const [quietOn, setQuietOn] = useState(false);
  const [quietStart, setQuietStart] = useState('22:00');
  const [quietEnd, setQuietEnd] = useState('07:00');
  const [serviceArea, setServiceArea] = useState('');
  const [services, setServices] = useState('');
  const [officeOpen, setOfficeOpen] = useState('08:00');
  const [officeClose, setOfficeClose] = useState('17:00');
  const [weekends, setWeekends] = useState(false);
  const [jobInputs, setJobInputs] = useState<Record<string, string>>({});
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [profileState, runProfile] = useSave();
  const [notifyState, runNotify] = useSave();
  const [businessState, runBusiness] = useSave();
  const [jobsState, runJobs] = useSave();
  const [passwordState, runPassword] = useSave();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const goto = (path: string) => {
    if (onNavigate) onNavigate(path);
    else window.location.assign(path);
  };

  const load = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoadError('The dashboard is not connected to its database. Contact support.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) {
      setLoadError('Please sign in again.');
      setLoading(false);
      return;
    }
    setUserId(user.id);
    setLoginEmail(user.email || userEmail);

    const [acc, prof, jv, cal] = await Promise.all([
      supabase
        .from('accounts')
        .select(
          'id, name, territory, timezone, service_area, services, office_open, office_close, works_weekends, notification_phone, quiet_start, quiet_end'
        )
        .maybeSingle(),
      supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
      supabase.from('job_values').select('job_type, typical_value'),
      supabase.from('setup_steps').select('status').eq('step_key', 'calendar_connected').maybeSingle(),
    ]);

    if (acc.error || !acc.data) {
      setLoadError(acc.error?.message || 'Could not load your settings.');
      setLoading(false);
      return;
    }

    const a = acc.data;
    setAccountId(a.id);
    setCompanyName(a.name || '');
    setTerritory(a.territory || '');
    setTz(a.timezone || '');
    setServiceArea(a.service_area || '');
    setServices(a.services || '');
    setOfficeOpen(hhmm(a.office_open, '08:00'));
    setOfficeClose(hhmm(a.office_close, '17:00'));
    setWeekends(Boolean(a.works_weekends));
    setPhoneText(formatPhone(a.notification_phone));
    setQuietOn(Boolean(a.quiet_start && a.quiet_end));
    setQuietStart(hhmm(a.quiet_start, '22:00'));
    setQuietEnd(hhmm(a.quiet_end, '07:00'));
    setFullName(prof.data?.full_name || '');
    setCalendarStatus(cal.data?.status || null);

    const inputs: Record<string, string> = {};
    JOB_TYPES.forEach((j) => (inputs[j.key] = ''));
    (jv.data || []).forEach((r: { job_type: string; typical_value: number }) => {
      inputs[r.job_type] = String(Math.round(Number(r.typical_value)));
    });
    setJobInputs(inputs);

    setLoading(false);
  }, [userEmail]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------- saving ---------- */

  const updateAccount = async (values: Record<string, unknown>): Promise<string | null> => {
    const { data, error } = await supabase.from('accounts').update(values).eq('id', accountId).select('id');
    if (error) return 'Could not save. Check your connection and try again.';
    if (!data || data.length !== 1) return 'Could not save. Please sign in again and retry.';
    return null;
  };

  const saveProfile = () =>
    runProfile(async () => {
      const name = fullName.trim();
      if (name.length > 80) return 'That name is too long.';
      const { data, error } = await supabase
        .from('profiles')
        .update({ full_name: name || null })
        .eq('id', userId)
        .select('id');
      if (error || !data || data.length !== 1) return 'Could not save. Try again.';
      return null;
    });

  const saveNotifications = () =>
    runNotify(async () => {
      const trimmed = phoneText.trim();
      let phone: string | null = null;
      if (trimmed) {
        phone = toE164(trimmed);
        if (!phone) return 'Enter a 10-digit US or Canadian number, for example (214) 555-0100.';
      }
      if (quietOn) {
        if (!quietStart || !quietEnd) return 'Choose both quiet hours times.';
        if (quietStart === quietEnd) return 'The start and end of quiet hours cannot be the same.';
      }
      const err = await updateAccount({
        notification_phone: phone,
        quiet_start: quietOn ? quietStart : null,
        quiet_end: quietOn ? quietEnd : null,
      });
      if (!err) setPhoneText(formatPhone(phone));
      return err;
    });

  const saveBusiness = () =>
    runBusiness(async () => {
      if (serviceArea.trim().length > 200) return 'Service area is too long (200 characters at most).';
      if (services.trim().length > 300) return 'Services is too long (300 characters at most).';
      if (!officeOpen || !officeClose) return 'Choose both office hours times.';
      if (officeClose <= officeOpen) return 'Closing time must be after opening time.';
      return updateAccount({
        service_area: serviceArea.trim() || null,
        services: services.trim() || null,
        office_open: officeOpen,
        office_close: officeClose,
        works_weekends: weekends,
      });
    });

  const saveJobValues = () =>
    runJobs(async () => {
      const rows: { account_id: string; job_type: string; typical_value: number }[] = [];
      for (const j of JOB_TYPES) {
        const raw = (jobInputs[j.key] || '').replace(/[^0-9.]/g, '');
        if (!raw) continue;
        const n = Number(raw);
        if (Number.isNaN(n) || n <= 0 || n > 1000000) {
          return `Enter a value in dollars for ${j.label}, for example 9500.`;
        }
        rows.push({ account_id: accountId, job_type: j.key, typical_value: Math.round(n) });
      }
      if (rows.length === 0) return 'Enter at least one value.';
      const { error } = await supabase.from('job_values').upsert(rows, { onConflict: 'account_id,job_type' });
      if (error) return 'Could not save. Check your connection and try again.';
      setJobInputs((prev) => {
        const next = { ...prev };
        rows.forEach((r) => (next[r.job_type] = String(r.typical_value)));
        return next;
      });
      return null;
    });

  const changePassword = () =>
    runPassword(async () => {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      }
      if (newPassword !== confirmPassword) return 'Passwords do not match.';

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        const msg = (error.message || '').toLowerCase();
        const code = (error as { code?: string }).code;
        if (code === 'reauthentication_needed' || msg.includes('reauth') || msg.includes('recently')) {
          return 'For security, sign out and sign in again, then change your password.';
        }
        if (code === 'same_password' || msg.includes('different from the old')) {
          return 'Choose a password you have not used before.';
        }
        if (code === 'weak_password' || msg.includes('weak')) {
          return 'That password is too easy to guess. Try a longer one with letters and numbers.';
        }
        return 'Could not change your password. Try again.';
      }
      setNewPassword('');
      setConfirmPassword('');
      return null;
    });

  /* ---------- render ---------- */

  return (
    <div className="min-h-screen w-full bg-[#090e1c] text-[#dee1f7] font-['Inter']">
      {/* compact header */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6 pt-5 pb-3 flex items-center justify-between gap-4">
        <span className="font-['Space_Grotesk'] text-lg font-bold text-slate-100 tracking-tight truncate">
          {companyName}
        </span>
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111728] border border-[#212b42] text-slate-300 text-xs"
            aria-expanded={menuOpen}
          >
            <span className="max-w-[140px] truncate hidden sm:inline">{loginEmail}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 mt-2 w-52 rounded-xl bg-[#0f1422] border border-[#222c42] py-1.5 z-50">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onSignOut?.();
                }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-red-400 hover:bg-[#192236] text-left"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 pb-20">
        <button
          type="button"
          onClick={() => goto('/queue')}
          className="inline-flex items-center gap-1.5 mt-4 text-xs font-['Space_Grotesk'] font-bold text-slate-300 hover:text-[#ffc174] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#ffc174]" />
          Dashboard
        </button>

        {loading ? (
          <div className="py-24 text-center font-['JetBrains_Mono'] text-xs uppercase tracking-wider text-slate-400">
            Loading settings…
          </div>
        ) : loadError ? (
          <div className="mx-auto max-w-md py-16 text-center space-y-4">
            <p className="text-sm text-slate-300">{loadError}</p>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#f59e0b] text-[#150f05] font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="mt-6 mb-6">
              <span className="font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#f59e0b] font-bold block mb-2">
                ACCOUNT
              </span>
              <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-black uppercase tracking-tight text-slate-100 leading-none">
                Settings
              </h1>
            </div>

            <div className="space-y-5">
              {/* Account (read-only) */}
              <Card
                title="Your account"
                hint="These are set by us. To change any of them, email contact@wedgescale.com."
              >
                <ReadRow label="Company" value={companyName} />
                <ReadRow label="Territory" value={territory} />
                <ReadRow label="Time zone" value={tz} />
                <ReadRow label="Login email" value={loginEmail} />
              </Card>

              {/* Notifications */}
              <Card
                title="Notifications"
                hint="Where we text you the moment a job books. Quiet hours are applied when texting is connected."
              >
                <Field id="notify-phone" label="Your mobile number" hint="US or Canadian number.">
                  <input
                    id="notify-phone"
                    name="tel"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={phoneText}
                    onChange={(e) => setPhoneText(e.target.value)}
                    placeholder="(214) 555-0100"
                    className={inputCls}
                  />
                </Field>

                <div className="space-y-3">
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={quietOn}
                      onChange={(e) => setQuietOn(e.target.checked)}
                      className="h-4 w-4 accent-[#f59e0b]"
                    />
                    Do not text me during quiet hours
                  </label>
                  {quietOn && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field id="quiet-start" label="From">
                        <input
                          id="quiet-start"
                          type="time"
                          value={quietStart}
                          onChange={(e) => setQuietStart(e.target.value)}
                          style={{ colorScheme: 'dark' }}
                          className={inputCls}
                        />
                      </Field>
                      <Field id="quiet-end" label="Until">
                        <input
                          id="quiet-end"
                          type="time"
                          value={quietEnd}
                          onChange={(e) => setQuietEnd(e.target.value)}
                          style={{ colorScheme: 'dark' }}
                          className={inputCls}
                        />
                      </Field>
                    </div>
                  )}
                </div>
                <SaveRow state={notifyState} onSave={saveNotifications} />
              </Card>

              {/* Business info */}
              <Card
                title="Business info"
                hint="Used when we write your texts, for example how we phrase after-hours messages."
              >
                <Field id="service-area" label="Service area" hint="Cities or regions you cover.">
                  <input
                    id="service-area"
                    type="text"
                    maxLength={200}
                    value={serviceArea}
                    onChange={(e) => setServiceArea(e.target.value)}
                    placeholder="Dallas-Fort Worth"
                    className={inputCls}
                  />
                </Field>
                <Field id="services" label="Services" hint="What you do, in a few words.">
                  <textarea
                    id="services"
                    rows={2}
                    maxLength={300}
                    value={services}
                    onChange={(e) => setServices(e.target.value)}
                    placeholder="Storm damage, roof repair, full reroofs, insurance claims"
                    className={`${inputCls} resize-none`}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field id="office-open" label="Office opens">
                    <input
                      id="office-open"
                      type="time"
                      value={officeOpen}
                      onChange={(e) => setOfficeOpen(e.target.value)}
                      style={{ colorScheme: 'dark' }}
                      className={inputCls}
                    />
                  </Field>
                  <Field id="office-close" label="Office closes">
                    <input
                      id="office-close"
                      type="time"
                      value={officeClose}
                      onChange={(e) => setOfficeClose(e.target.value)}
                      style={{ colorScheme: 'dark' }}
                      className={inputCls}
                    />
                  </Field>
                </div>
                <label className="flex items-center gap-2.5 cursor-pointer text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={weekends}
                    onChange={(e) => setWeekends(e.target.checked)}
                    className="h-4 w-4 accent-[#f59e0b]"
                  />
                  Office is open on weekends
                </label>
                <SaveRow state={businessState} onSave={saveBusiness} />
              </Card>

              {/* Job values */}
              <Card
                title="Typical job values"
                hint="What a typical job is worth to you. Until you have seen a job in person, we use these to estimate your pipeline. Leave a row blank to keep its current value."
              >
                <div className="space-y-3">
                  {JOB_TYPES.map((j) => (
                    <Field key={j.key} id={`jv-${j.key}`} label={j.label} hint={j.hint}>
                      <div className="flex items-center gap-2">
                        <span className="font-['JetBrains_Mono'] text-sm text-slate-400">$</span>
                        <input
                          id={`jv-${j.key}`}
                          type="text"
                          inputMode="decimal"
                          value={jobInputs[j.key] || ''}
                          onChange={(e) => setJobInputs((prev) => ({ ...prev, [j.key]: e.target.value }))}
                          placeholder="9500"
                          className={inputCls}
                        />
                      </div>
                    </Field>
                  ))}
                </div>
                <SaveRow state={jobsState} onSave={saveJobValues} />
              </Card>

              {/* Calendar */}
              <Card title="Calendar">
                <p className="text-sm text-slate-300 leading-relaxed">
                  {calendarStatus === 'done'
                    ? 'Connected. Booked inspections land on your calendar.'
                    : 'We connect your calendar during setup.'}
                </p>
                <button
                  type="button"
                  onClick={() => goto('/setup')}
                  className="font-['JetBrains_Mono'] text-xs text-slate-400 hover:text-[#ffc174] transition-colors uppercase tracking-[0.16em] cursor-pointer"
                >
                  See setup progress
                </button>
              </Card>

              {/* Profile */}
              <Card title="Your name">
                <Field id="full-name" label="Full name">
                  <input
                    id="full-name"
                    name="name"
                    type="text"
                    autoComplete="name"
                    maxLength={80}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <SaveRow state={profileState} onSave={saveProfile} />
              </Card>

              {/* Password */}
              <Card title="Change password">
                <Field id="new-password" label="New password">
                  <input
                    id="new-password"
                    name="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <Field
                  id="confirm-password"
                  label="Confirm password"
                  hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
                >
                  <input
                    id="confirm-password"
                    name="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputCls}
                  />
                </Field>
                <SaveRow state={passwordState} onSave={changePassword} label="Change password" />
              </Card>

              {/* Billing */}
              <Card title="Billing">
                <p className="text-sm text-slate-300 leading-relaxed">
                  For invoices, plan changes or any billing question, email{' '}
                  <a href="mailto:contact@wedgescale.com" className="text-[#ffc174] hover:underline">
                    contact@wedgescale.com
                  </a>
                  .
                </p>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
};