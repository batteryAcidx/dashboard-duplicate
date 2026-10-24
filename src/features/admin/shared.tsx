import React from 'react';
import { RotateCcw } from 'lucide-react';
import { AccountStatus, STATUS_LABEL } from '../../domain/accounts';
import type { StepStatus } from '../../domain';
import { Card as UiCard, Row as UiRow, inputCls as uiInputCls } from '../../components/ui';

export const STEP_TONE: Record<StepStatus, string> = {
  done: 'text-[#ffc174] border-[#ffc174]/30 bg-[#ffc174]/10',
  in_progress: 'text-slate-300 border-[#2b354d] bg-[#151b2b]',
  waiting_on_you: 'text-[#ffc174] border-[#f59e0b]/60 bg-[#261d10]',
  pending: 'text-slate-500 border-[#232839] bg-[#0a0e19]',
};

export const STATUS_CHIP: Record<AccountStatus, string> = {
  setup: 'text-slate-300 border-[#2b354d] bg-[#151b2b]',
  live: 'text-[#ffc174] border-[#ffc174]/30 bg-[#ffc174]/10',
  paused: 'text-slate-400 border-[#232a3f] bg-[#0a0e19]',
  cancelled: 'text-red-400 border-red-900/40 bg-red-950/30',
};

export const inputCls = uiInputCls;

export const labelCls = "mb-2 block text-sm font-medium text-slate-300";

export const primaryBtn =
  "inline-flex h-11 items-center justify-center rounded-xl bg-[#f59e0b] px-5 font-display text-sm font-bold text-[#150f05] transition-colors hover:bg-[#fbbf24] cursor-pointer disabled:opacity-50";

export const ghostBtn =
  "inline-flex h-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] px-5 font-display text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.07] cursor-pointer disabled:opacity-50";

export const dangerBtn =
  "inline-flex h-11 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-5 font-display text-sm font-semibold text-red-300 transition-colors hover:bg-red-500/15 cursor-pointer disabled:opacity-50";

/* ---------- small building blocks ---------- */

export const StatusChip: React.FC<{ status: AccountStatus }> = ({ status }) => (
  <span
    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_CHIP[status]}`}
  >
    {STATUS_LABEL[status]}
  </span>
);

export const Pill: React.FC<{ children: React.ReactNode; tone?: 'gold' | 'plain' }> = ({ children, tone = 'plain' }) => (
  <span
    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
      tone === 'gold'
        ? 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#ffc174]'
        : 'border-white/[0.08] bg-white/[0.04] text-slate-300'
    }`}
  >
    {children}
  </span>
);

export const TerritoryTag: React.FC<{ name: string }> = ({ name }) => (
  <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 font-data text-xs text-slate-200">
    {name}
  </span>
);

export const Card: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <UiCard title={title} hint={hint}>
    {children}
  </UiCard>
);

export const ReadRow: React.FC<{ label: string; value: string }> = ({ label, value }) => <UiRow label={label} value={value} />;

export const ErrorLine: React.FC<{ text: string | null }> = ({ text }) =>
  text ? (
    <p role="alert" className="text-xs text-red-400 font-body">
      {text}
    </p>
  ) : null;

export const LoadingBlock: React.FC<{ text: string }> = ({ text }) => (
  <div className="py-20 text-center font-body text-xs tracking-wide text-slate-400">{text}</div>
);

export const RetryBlock: React.FC<{ text: string; onRetry: () => void }> = ({ text, onRetry }) => (
  <div className="py-12 text-center space-y-4">
    <p className="text-sm text-slate-300">{text}</p>
    <button type="button" onClick={onRetry} className={`${primaryBtn} inline-flex items-center gap-1.5`}>
      <RotateCcw className="w-3.5 h-3.5" />
      Retry
    </button>
  </div>
);

/* ---------- create client form ---------- */

