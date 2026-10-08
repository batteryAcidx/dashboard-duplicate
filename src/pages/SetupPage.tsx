import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  Clock,
  AlertCircle,
  Circle,
  LogOut,
  ArrowLeft,
  RotateCcw,
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

type StepStatus = 'pending' | 'in_progress' | 'waiting_on_you' | 'done';

interface StepRow {
  id: string;
  step_key: string;
  title: string;
  description: string | null;
  status: StepStatus;
  note: string | null;
  sort_order: number;
  completed_at: string | null;
}

interface SetupPageProps {
  onNavigate?: (path: string) => void;
  onSignOut?: () => void;
  userEmail?: string;
}

const TAGS: Record<StepStatus, { label: string; cls: string }> = {
  done: { label: 'Done', cls: 'text-[#ffc174] border-[#ffc174]/30 bg-[#ffc174]/10' },
  in_progress: { label: 'In progress', cls: 'text-slate-300 border-[#2b354d] bg-[#151b2b]' },
  waiting_on_you: { label: 'Waiting on you', cls: 'text-[#ffc174] border-[#f59e0b]/60 bg-[#261d10]' },
  pending: { label: 'Up next', cls: 'text-slate-500 border-[#232839] bg-[#0a0e19]' },
};

const StepIcon: React.FC<{ status: StepStatus }> = ({ status }) => {
  if (status === 'done') {
    return (
      <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/40 flex items-center justify-center shrink-0">
        <Check className="w-4 h-4 text-[#ffc174]" />
      </div>
    );
  }
  if (status === 'waiting_on_you') {
    return (
      <div className="w-8 h-8 rounded-lg bg-[#261d10] border border-[#f59e0b]/60 flex items-center justify-center shrink-0">
        <AlertCircle className="w-4 h-4 text-[#ffc174]" />
      </div>
    );
  }
  if (status === 'in_progress') {
    return (
      <div className="w-8 h-8 rounded-lg bg-[#151b2b] border border-[#2b354d] flex items-center justify-center shrink-0">
        <Clock className="w-4 h-4 text-slate-300" />
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-[#0a0e19] border border-[#232839] flex items-center justify-center shrink-0">
      <Circle className="w-4 h-4 text-slate-600" />
    </div>
  );
};

const dateLabel = (iso: string | null, tz: string) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz }) : '';

export const SetupPage: React.FC<SetupPageProps> = ({ onNavigate, onSignOut, userEmail = '' }) => {
  const [steps, setSteps] = useState<StepRow[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [tz, setTz] = useState('America/Chicago');
  const [accountStatus, setAccountStatus] = useState('setup');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!isSupabaseConfigured) {
      setError('The dashboard is not connected to its database. Contact support.');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);

    const [acc, st] = await Promise.all([
      supabase.from('accounts').select('name, timezone, status').maybeSingle(),
      supabase.from('setup_steps').select('*').order('sort_order', { ascending: true }),
    ]);

    if (acc.data) {
      if (acc.data.name) setCompanyName(acc.data.name);
      if (acc.data.timezone) setTz(acc.data.timezone);
      if (acc.data.status) setAccountStatus(acc.data.status);
    }

    if (st.error) {
      if (!silent) setError(st.error.message || 'Failed to load setup progress.');
    } else {
      setError(null);
      setSteps((st.data as StepRow[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 60000);
    return () => clearInterval(t);
  }, [load]);

  const goto = (path: string) => {
    if (onNavigate) onNavigate(path);
    else window.location.assign(path);
  };

  const total = steps.length;
  const done = steps.filter((s) => s.status === 'done').length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const isLive = accountStatus === 'live' || (total > 0 && done === total);
  const waiting = steps.filter((s) => s.status === 'waiting_on_you');

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
            <span className="max-w-[140px] truncate hidden sm:inline">{userEmail}</span>
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

      <main className="mx-auto max-w-3xl px-4 sm:px-6 pb-16">
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
            Loading setup progress…
          </div>
        ) : error ? (
          <div className="mx-auto max-w-md py-16 text-center space-y-4">
            <p className="text-sm text-slate-300">{error}</p>
            <button
              type="button"
              onClick={() => load()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#f59e0b] text-[#150f05] font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Retry
            </button>
          </div>
        ) : total === 0 ? (
          <div className="mt-8 w-full min-h-[240px] flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-[#232839] bg-[#0c101d]/60">
            <h2 className="font-['Space_Grotesk'] text-base font-bold text-slate-200 tracking-tight mb-1">
              Your setup checklist is on its way
            </h2>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              It will appear here shortly. Questions? Email{' '}
              <a href="mailto:contact@wedgescale.com" className="text-[#ffc174]">
                contact@wedgescale.com
              </a>
              .
            </p>
          </div>
        ) : (
          <>
            {/* Status header */}
            <div className="mt-6 mb-6">
              <span className="font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#f59e0b] font-bold block mb-2">
                SETUP
              </span>
              <h1 className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-black uppercase tracking-tight text-slate-100 leading-none">
                {isLive ? "You're live." : 'Getting you live.'}
              </h1>
              <p className="mt-3 text-sm text-slate-400 leading-relaxed">
                {isLive
                  ? 'Every missed call gets a reply within minutes.'
                  : `${done} of ${total} steps complete. Carrier approval typically takes 2-3 weeks, and we keep working on everything else in the meantime.`}
              </p>

              {!isLive && (
                <div className="mt-4 h-1.5 w-full rounded-full bg-[#151b2b] overflow-hidden" aria-hidden="true">
                  <div className="h-full rounded-full bg-[#f59e0b] transition-all duration-500" style={{ width: `${percent}%` }} />
                </div>
              )}
            </div>

            {/* What we need from you */}
            {!isLive && waiting.length > 0 && (
              <div className="mb-6 p-4 sm:p-5 rounded-xl bg-[#1a1710] border border-[#f59e0b]/40">
                <p className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-widest text-[#ffc174] font-bold mb-2">
                  {waiting.length === 1 ? 'We need one thing from you' : `We need ${waiting.length} things from you`}
                </p>
                <ul className="space-y-2">
                  {waiting.map((s) => (
                    <li key={s.id} className="text-sm text-slate-200 leading-relaxed">
                      <span className="font-['Space_Grotesk'] font-bold">{s.title}.</span>{' '}
                      {s.note && <span className="text-slate-400">{s.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Steps */}
            <ol className="space-y-3">
              {steps.map((s) => {
                const tag = TAGS[s.status];
                return (
                  <li
                    key={s.id}
                    className={`p-4 sm:p-5 rounded-xl border ${
                      s.status === 'waiting_on_you'
                        ? 'bg-[#111625] border-[#f59e0b]/40'
                        : 'bg-[#111625] border-[#22283a]'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <StepIcon status={s.status} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <h2 className="font-['Space_Grotesk'] text-sm sm:text-[15px] font-bold text-slate-100 tracking-tight">
                            {s.title}
                          </h2>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[9.5px] font-['JetBrains_Mono'] uppercase tracking-wider font-semibold shrink-0 ${tag.cls}`}
                          >
                            {tag.label}
                            {s.status === 'done' && s.completed_at ? ` · ${dateLabel(s.completed_at, tz)}` : ''}
                          </span>
                        </div>
                        {s.description && (
                          <p className="mt-1 text-xs sm:text-[13px] text-slate-400 leading-relaxed">{s.description}</p>
                        )}
                        {s.note && s.status !== 'done' && s.status !== 'waiting_on_you' && (
                          <p className="mt-1.5 text-xs sm:text-[13px] text-slate-300 leading-relaxed">{s.note}</p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            <p className="mt-8 text-xs text-slate-500 leading-relaxed">
              Questions? Email{' '}
              <a href="mailto:contact@wedgescale.com" className="text-[#ffc174] hover:underline">
                contact@wedgescale.com
              </a>
              .
            </p>
          </>
        )}
      </main>
    </div>
  );
};