import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronDown, LogOut, RotateCcw } from 'lucide-react';
import { authApi, isConfigured, ownerApi } from '../api';
import { getCachedCompany, setCachedCompany, getCachedSetup } from '../lib/accountCache';
import { formatBlock, zonedToUtc } from '../lib/tz';
import { AppHeader } from '../components/AppHeader';
import { PlatformFooter } from '../components/PlatformFooter';
import { inputCls as uiInputCls } from '../components/ui';

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

const to12h = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const ap = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hh}:${String(m).padStart(2, '0')} ${ap}` : `${hh} ${ap}`;
};

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

// 16px text on purpose: iPhones zoom the page when an input is smaller
const inputCls = uiInputCls;

/* ---------- building blocks ---------- */

const SkeletonRows: React.FC<{ count: number }> = ({ count }) => (
  <div className="space-y-4 animate-pulse" aria-hidden="true">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="h-[72px] rounded-2xl border border-white/[0.06] bg-[#0f1424]" />
    ))}
  </div>
);

const Group: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="mb-4 text-sm font-semibold text-slate-400">{label}</div>
    <div className="space-y-4">{children}</div>
  </div>
);

interface SectionProps {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ id, title, summary, open, onToggle, children }) => (
  <section
    className={`rounded-2xl border bg-[#0f1424] transition-colors ${open ? 'border-[#f59e0b]/35' : 'border-white/[0.07]'}`}
  >
    <h2>
      <button
        type="button"
        id={`${id}-header`}
        aria-expanded={open}
        aria-controls={`${id}-panel`}
        onClick={onToggle}
        className="flex min-h-[76px] w-full cursor-pointer items-center justify-between gap-4 px-6 py-5 text-left"
      >
        <span className="min-w-0">
          <span className="block font-display text-lg font-semibold tracking-tight text-slate-100">{title}</span>
          {!open && summary && <span className="mt-1 block truncate text-sm text-slate-400">{summary}</span>}
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    </h2>
    {open && (
      <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-header`} className="space-y-6 border-t border-white/[0.06] px-6 pb-7 pt-6">
        {children}
      </div>
    )}
  </section>
);

const Field: React.FC<{ id: string; label: string; hint?: string; children: React.ReactNode }> = ({ id, label, hint, children }) => (
  <div>
    <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-300">
      {label}
    </label>
    {children}
    {hint && <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{hint}</p>}
  </div>
);

const ReadRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
    <span className="shrink-0 text-sm text-slate-400">{label}</span>
    <span className="min-w-0 break-words text-[15px] font-medium text-slate-100 sm:text-right">{value || '—'}</span>
  </div>
);

const SaveRow: React.FC<{ state: SaveState; onSave: () => void; label?: string }> = ({ state, onSave, label = 'Save changes' }) => (
  <div className="space-y-3 pt-1">
    <button
      type="button"
      onClick={onSave}
      disabled={state.saving}
      className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-xl bg-[#f59e0b] px-7 font-display text-sm font-bold text-[#150f05] transition-colors hover:bg-[#fbbf24] disabled:opacity-50 sm:w-auto"
    >
      {state.saving ? 'Saving…' : label}
    </button>
    {state.saved && (
      <p role="status" className="text-sm font-medium text-[#ffc174]">
        Saved
      </p>
    )}
    {state.error && (
      <p role="alert" className="text-sm leading-relaxed text-red-400">
        {state.error}
      </p>
    )}
  </div>
);

const CheckRow: React.FC<{ checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }> = ({ checked, onChange, children }) => (
  <label className="flex cursor-pointer items-center gap-3.5 py-1.5 text-[15px] text-slate-200">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 shrink-0 accent-[#f59e0b]" />
    <span>{children}</span>
  </label>
);

/* ---------- the page ---------- */

interface Snap {
  phone: string;
  quietOn: boolean;
  quietStart: string;
  quietEnd: string;
  serviceArea: string;
  officeOpen: string;
  officeClose: string;
  weekends: boolean;
  jobCount: number;
  fullName: string;
}

interface BlockRow {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

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
  const [companyName, setCompanyName] = useState(getCachedCompany(userEmail));
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
  const [bookExisting, setBookExisting] = useState(false);
  const [savedBookExisting, setSavedBookExisting] = useState(false);
  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [blockDate, setBlockDate] = useState('');
  const [blockStart, setBlockStart] = useState('09:00');
  const [blockEnd, setBlockEnd] = useState('17:00');
  const [blockReason, setBlockReason] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwChangedAt, setPwChangedAt] = useState<string | null>(null);

  // what is actually saved (the collapsed summaries read this, not the unsaved fields)
  const [snap, setSnap] = useState<Snap | null>(null);

  const [profileState, runProfile] = useSave();
  const [notifyState, runNotify] = useSave();
  const [businessState, runBusiness] = useSave();
  const [jobsState, runJobs] = useSave();
  const [bookingState, runBooking] = useSave();
  const [blockState, runBlock] = useSave();
  const [passwordState, runPassword] = useSave();

  const [open, setOpen] = useState<string | null>(null);
  const toggle = (key: string) => setOpen((o) => (o === key ? null : key));

  const goto = (path: string) => {
    if (onNavigate) onNavigate(path);
    else window.location.assign(path);
  };

  const load = useCallback(async () => {
    if (!isConfigured) {
      setLoadError('The dashboard is not connected to its database. Contact support.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);

    const user = await authApi.currentUser();
    if (!user) {
      setLoadError('Please sign in again.');
      setLoading(false);
      return;
    }
    setUserId(user.id);
    setLoginEmail(user.email || userEmail);

    const [acc, prof, jv, cal, eng, blk] = await Promise.all([
      ownerApi.account.settings(),
      ownerApi.settings.profile(user.id),
      ownerApi.settings.jobValues(),
      ownerApi.settings.calendarStep(),
      ownerApi.settings.engine(),
      ownerApi.settings.blocks(),
    ]);

    if (acc.error || !acc.data) {
      setLoadError(acc.error?.message || 'Could not load your settings.');
      setLoading(false);
      return;
    }

    const a = acc.data;
    const phone = formatPhone(a.notification_phone);
    const qOn = Boolean(a.quiet_start && a.quiet_end);
    const qStart = hhmm(a.quiet_start, '22:00');
    const qEnd = hhmm(a.quiet_end, '07:00');
    const oOpen = hhmm(a.office_open, '08:00');
    const oClose = hhmm(a.office_close, '17:00');

    setAccountId(a.id);
    setCompanyName(a.name || '');
    setCachedCompany(user.email || userEmail, a.name || '');
    setTerritory(a.territory || '');
    setTz(a.timezone || '');
    setServiceArea(a.service_area || '');
    setServices(a.services || '');
    setOfficeOpen(oOpen);
    setOfficeClose(oClose);
    setWeekends(Boolean(a.works_weekends));
    setPhoneText(phone);
    setQuietOn(qOn);
    setQuietStart(qStart);
    setQuietEnd(qEnd);
    setFullName(prof.data?.full_name || '');
    setPwChangedAt(prof.data?.password_changed_at || null);
    setCalendarStatus(cal.data?.status || null);
    setBookExisting(Boolean(eng.data?.book_existing_customers));
    setSavedBookExisting(Boolean(eng.data?.book_existing_customers));
    setBlocks(blk.error ? [] : ((blk.data as BlockRow[]) || []));

    const inputs: Record<string, string> = {};
    JOB_TYPES.forEach((j) => (inputs[j.key] = ''));
    (jv.data || []).forEach((r: { job_type: string; typical_value: number }) => {
      inputs[r.job_type] = String(Math.round(Number(r.typical_value)));
    });
    setJobInputs(inputs);

    setSnap({
      phone,
      quietOn: qOn,
      quietStart: qStart,
      quietEnd: qEnd,
      serviceArea: a.service_area || '',
      officeOpen: oOpen,
      officeClose: oClose,
      weekends: Boolean(a.works_weekends),
      jobCount: JOB_TYPES.filter((j) => (inputs[j.key] || '').trim()).length,
      fullName: prof.data?.full_name || '',
    });

    setLoading(false);
  }, [userEmail]);

  useEffect(() => {
    load();
  }, [load]);

  /* ---------- saving ---------- */

  const updateAccount = async (values: Record<string, unknown>): Promise<string | null> => {
    const { data, error } = await ownerApi.account.update(accountId, values);
    if (error) return 'Could not save. Check your connection and try again.';
    if (!data || data.length !== 1) return 'Could not save. Please sign in again and retry.';
    return null;
  };

  const saveProfile = () =>
    runProfile(async () => {
      const name = fullName.trim();
      if (name.length > 80) return 'That name is too long.';
      const { data, error } = await ownerApi.settings.updateProfile(userId, name || null);
      if (error || !data || data.length !== 1) return 'Could not save. Try again.';
      setSnap((s) => (s ? { ...s, fullName: name } : s));
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
      if (!err) {
        const pretty = formatPhone(phone);
        setPhoneText(pretty);
        setSnap((s) => (s ? { ...s, phone: pretty, quietOn, quietStart, quietEnd } : s));
      }
      return err;
    });

  const saveBusiness = () =>
    runBusiness(async () => {
      if (serviceArea.trim().length > 200) return 'Service area is too long (200 characters at most).';
      if (services.trim().length > 300) return 'Services is too long (300 characters at most).';
      if (!officeOpen || !officeClose) return 'Choose both office hours times.';
      if (officeClose <= officeOpen) return 'Closing time must be after opening time.';
      const err = await updateAccount({
        service_area: serviceArea.trim() || null,
        services: services.trim() || null,
        office_open: officeOpen,
        office_close: officeClose,
        works_weekends: weekends,
      });
      if (!err) {
        setSnap((s) =>
          s ? { ...s, serviceArea: serviceArea.trim(), officeOpen, officeClose, weekends } : s
        );
      }
      return err;
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
      const { error } = await ownerApi.settings.saveJobValues(rows);
      if (error) return 'Could not save. Check your connection and try again.';

      const merged = { ...jobInputs };
      rows.forEach((r) => (merged[r.job_type] = String(r.typical_value)));
      setJobInputs(merged);
      setSnap((s) =>
        s ? { ...s, jobCount: JOB_TYPES.filter((j) => (merged[j.key] || '').trim()).length } : s
      );
      return null;
    });

  const saveBooking = () =>
    runBooking(async () => {
      const { error } = await ownerApi.settings.setBookExisting(bookExisting);
      if (error) return 'Could not save. Check your connection and try again.';
      setSavedBookExisting(bookExisting);
      return null;
    });

  const addBlock = () =>
    runBlock(async () => {
      if (!blockDate) return 'Choose a date.';
      if (!blockStart || !blockEnd) return 'Choose a start and an end time.';
      if (blockEnd <= blockStart) return 'The end time must be after the start time.';
      const start = zonedToUtc(blockDate, blockStart, tz || 'America/Chicago');
      const end = zonedToUtc(blockDate, blockEnd, tz || 'America/Chicago');
      if (!start || !end) return 'That date or time is not valid.';
      if (end.getTime() < Date.now()) return 'That time has already passed.';
      const { data, error } = await ownerApi.settings.addBlock({ account_id: accountId, starts_at: start.toISOString(), ends_at: end.toISOString(), reason: blockReason.trim() || null });
      if (error || !data || data.length !== 1) return 'Could not save. Check your connection and try again.';
      setBlocks((prev) => [...prev, ...(data as BlockRow[])].sort((a, b) => a.starts_at.localeCompare(b.starts_at)));
      setBlockReason('');
      return null;
    });

  const removeBlock = async (id: string) => {
    const { error } = await ownerApi.settings.removeBlock(id);
    if (!error) setBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  const changePassword = () =>
    runPassword(async () => {
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
      }
      if (newPassword !== confirmPassword) return 'Passwords do not match.';

      const error = await authApi.updatePassword(newPassword);
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
      setShowPw(false);
      setPwChangedAt(new Date().toISOString());
      return null;
    });

  /* ---------- summaries (saved values only) ---------- */

  const s = snap;
  const notifySummary = s
    ? `${s.phone || 'No number yet'} · ${
        s.quietOn ? `Quiet ${to12h(s.quietStart)} to ${to12h(s.quietEnd)}` : 'No quiet hours'
      }`
    : '';
  const businessSummary = s
    ? `${s.serviceArea || 'No service area'} · ${to12h(s.officeOpen)} to ${to12h(s.officeClose)}${
        s.weekends ? ' · weekends' : ''
      }`
    : '';
  const jobSummary = s ? (s.jobCount ? `${s.jobCount} of ${JOB_TYPES.length} values set` : 'Not set yet') : '';
  const calendarSummary = calendarStatus === 'done' ? 'Connected' : 'Set up during onboarding';
  const bookingSummary = `${savedBookExisting ? 'Existing customers are booked' : 'Existing customers are flagged for you'}${
    blocks.length ? ` · ${blocks.length} blocked time${blocks.length === 1 ? '' : 's'}` : ''
  }`;

  return (
    <div className="min-h-screen w-full bg-[#090e1c] text-[#dee1f7] font-body">
      <AppHeader
        companyName={companyName}
        userEmail={loginEmail || userEmail}
        current="settings" showSetup={getCachedSetup(userEmail)}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
      />

      <main className="mx-auto max-w-5xl px-4 sm:px-6 pb-[max(5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => goto('/queue')}
          className="inline-flex items-center gap-1.5 mt-3 -ml-1 pl-1 pr-3 py-2.5 text-sm font-display font-bold text-slate-300 hover:text-[#ffc174] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-[#ffc174]" />
          Dashboard
        </button>

                <div className="mb-10 mt-8">
          <span className="font-body text-xs tracking-wide text-[#f59e0b] font-bold block mb-2">
            Account
          </span>
          <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-100 leading-none">
            Settings
          </h1>
        </div>

        {loading ? (
          <div role="status" aria-label="Loading settings" className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <SkeletonRows count={4} />
            <div className="hidden lg:block">
              <SkeletonRows count={4} />
            </div>
          </div>
        ) : loadError ? (
          <div className="mx-auto max-w-md py-16 text-center space-y-4">
            <p className="text-base text-slate-300">{loadError}</p>
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl bg-[#f59e0b] text-[#150f05] font-display font-bold text-sm tracking-wide cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              Retry
            </button>
          </div>
        ) : (
          <>
          

            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2">
              <Group label="Your business">
                <Section
                  id="notifications"
                  title="Notifications"
                  summary={notifySummary}
                  open={open === 'notifications'}
                  onToggle={() => toggle('notifications')}
                >
                  <p className="text-[13px] text-slate-400 leading-relaxed">
                    Where we text you the moment a job books. Saved now, and applied once texting is connected.
                  </p>
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
                    <CheckRow checked={quietOn} onChange={setQuietOn}>
                      Do not text me during quiet hours
                    </CheckRow>
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
                </Section>

                <Section
                  id="business"
                  title="Business info"
                  summary={businessSummary}
                  open={open === 'business'}
                  onToggle={() => toggle('business')}
                >
                  <p className="text-[13px] text-slate-400 leading-relaxed">
                    Used when we write your texts, for example how we phrase after-hours messages.
                  </p>
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
                      rows={3}
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
                  <CheckRow checked={weekends} onChange={setWeekends}>
                    Office is open on weekends
                  </CheckRow>
                  <SaveRow state={businessState} onSave={saveBusiness} />
                </Section>

                <Section
                  id="jobvalues"
                  title="Typical job values"
                  summary={jobSummary}
                  open={open === 'jobvalues'}
                  onToggle={() => toggle('jobvalues')}
                >
                  <p className="text-[13px] text-slate-400 leading-relaxed">
                    What a typical job is worth to you. Until you have seen a job in person, we use these to estimate
                    your pipeline. Leave a row blank to keep its current value.
                  </p>
                  {JOB_TYPES.map((j) => (
                    <Field key={j.key} id={`jv-${j.key}`} label={j.label} hint={j.hint}>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-data text-base text-slate-400 pointer-events-none">
                          $
                        </span>
                        <input
                          id={`jv-${j.key}`}
                          type="text"
                          inputMode="numeric"
                          value={jobInputs[j.key] || ''}
                          onChange={(e) => setJobInputs((prev) => ({ ...prev, [j.key]: e.target.value }))}
                          placeholder="9500"
                          className={`${inputCls} pl-9`}
                        />
                      </div>
                    </Field>
                  ))}
                  <SaveRow state={jobsState} onSave={saveJobValues} />
                </Section>

                <Section
                  id="calendar"
                  title="Calendar"
                  summary={calendarSummary}
                  open={open === 'calendar'}
                  onToggle={() => toggle('calendar')}
                >
                  <p className="text-base text-slate-300 leading-relaxed">
                    {calendarStatus === 'done'
                      ? 'Connected. Booked inspections land on your calendar.'
                      : 'We connect your calendar during setup.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => goto('/setup')}
                    className="px-5 py-3 rounded-xl bg-[#111728] border border-[#212b42] hover:border-[#314060] text-slate-200 font-display font-bold text-sm tracking-wide cursor-pointer w-full sm:w-auto"
                  >
                    See setup progress
                  </button>
                </Section>

                <Section
                  id="booking"
                  title="Contacts and booking"
                  summary={bookingSummary}
                  open={open === 'booking'}
                  onToggle={() => toggle('booking')}
                >
                  <p className="text-[13px] text-slate-400 leading-relaxed">
                    Homeowners are always booked for an inspection. Vendors and existing customers are flagged, and you get their details by
                    text, so your calendar stays full of real jobs.
                  </p>
                  <div className="space-y-2">
                    <CheckRow checked={bookExisting} onChange={setBookExisting}>
                      Also book my past and recurring customers
                    </CheckRow>
                    <p className="text-[13px] text-slate-400 leading-relaxed">
                      Off by default. When it is off, a past customer who calls is greeted by name and flagged for you, never offered an
                      inspection time.
                    </p>
                  </div>
                  <SaveRow state={bookingState} onSave={saveBooking} />

                  <div className="pt-2 border-t border-[#1b2336] space-y-4">
                    <div className="pt-4">
                      <div className="font-body text-xs tracking-wide text-slate-400 font-semibold mb-1">
                        Blocked times
                      </div>
                      <p className="text-[13px] text-slate-400 leading-relaxed">
                        Times we should never offer for an inspection, like a day off or a crew meeting. Times are in your time zone
                        {tz ? ` (${tz.replace(/_/g, ' ')})` : ''}.
                      </p>
                    </div>
                    {blocks.length > 0 && (
                      <ul className="divide-y divide-[#1b2336] rounded-xl border border-[#22283a] bg-[#0e1322] px-4">
                        {blocks.map((b) => (
                          <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                            <span className="min-w-0 text-sm text-slate-200">
                              {formatBlock(b.starts_at, b.ends_at, tz || 'America/Chicago')}
                              {b.reason ? <span className="block text-[13px] text-slate-400">{b.reason}</span> : null}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeBlock(b.id)}
                              className="shrink-0 px-2.5 py-1.5 rounded-lg font-data text-xs text-slate-500 hover:text-red-400 cursor-pointer"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Field id="block-date" label="Date">
                        <input id="block-date" type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls} />
                      </Field>
                      <Field id="block-start" label="From">
                        <input id="block-start" type="time" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls} />
                      </Field>
                      <Field id="block-end" label="Until">
                        <input id="block-end" type="time" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} style={{ colorScheme: 'dark' }} className={inputCls} />
                      </Field>
                    </div>
                    <Field id="block-reason" label="Reason (optional)">
                      <input id="block-reason" type="text" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} maxLength={200} placeholder="Day off" className={inputCls} />
                    </Field>
                    <SaveRow state={blockState} onSave={addBlock} label="Block this time" />
                  </div>

                  <div className="pt-2 border-t border-[#1b2336]">
                    <button
                      type="button"
                      onClick={() => goto('/contacts')}
                      className="mt-4 px-5 py-3 rounded-xl bg-[#111728] border border-[#212b42] hover:border-[#314060] text-slate-200 font-display font-bold text-sm tracking-wide cursor-pointer w-full sm:w-auto"
                    >
                      Manage contacts
                    </button>
                  </div>
                </Section>
              </Group>

              <Group label="Your account">
                <Section
                  id="account"
                  title="Account details"
                  summary={companyName}
                  open={open === 'account'}
                  onToggle={() => toggle('account')}
                >
                  <p className="text-[13px] text-slate-400 leading-relaxed">
                    These are set by us. To change any of them, email{' '}
                    <a href="mailto:contact@wedgescale.com" className="text-[#ffc174] underline underline-offset-2">
                      contact@wedgescale.com
                    </a>
                    .
                  </p>
                  <ReadRow label="Company" value={companyName} />
                  <ReadRow label="Territory" value={territory || 'Not assigned yet'} />
                  <ReadRow label="Time zone" value={tz} />
                  <ReadRow label="Login email" value={loginEmail} />
                </Section>

                <Section
                  id="name"
                  title="Your name"
                  summary={s?.fullName || 'Not set'}
                  open={open === 'name'}
                  onToggle={() => toggle('name')}
                >
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
                </Section>

                <Section
                  id="password"
                  title="Change password"
                  summary={
                    pwChangedAt
                      ? `Changed ${new Date(pwChangedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          timeZone: tz || undefined,
                        })}`
                      : 'Not recorded yet'
                  }
                  open={open === 'password'}
                  onToggle={() => toggle('password')}
                >
                  <Field id="new-password" label="New password">
                    <input
                      id="new-password"
                      name="new-password"
                      type={showPw ? 'text' : 'password'}
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
                      type={showPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                  <CheckRow checked={showPw} onChange={setShowPw}>
                    Show passwords
                  </CheckRow>
                  <SaveRow state={passwordState} onSave={changePassword} label="Change password" />
                </Section>

                <Section
                  id="billing"
                  title="Billing"
                  summary="Invoices and plan changes"
                  open={open === 'billing'}
                  onToggle={() => toggle('billing')}
                >
                  <p className="text-base text-slate-300 leading-relaxed">
                    For invoices, plan changes or any billing question, email{' '}
                    <a href="mailto:contact@wedgescale.com" className="text-[#ffc174] underline underline-offset-2">
                      contact@wedgescale.com
                    </a>
                    .
                  </p>
                </Section>
              </Group>
            </div>

            <button
              type="button"
              onClick={() => onSignOut?.()}
              className="sm:hidden mt-8 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl border border-[#222c42] text-slate-300 text-sm font-display font-bold tracking-wide cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </>
        )}
      </main>
      <PlatformFooter />
    </div>
  );
};