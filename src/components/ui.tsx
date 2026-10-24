import React from 'react';

// Shared building blocks for a calm, spacious look. Colours stay the WedgeScale navy and gold.
// Change the look in one place: spacing, radius and surface colours live in these classes.

export const surface = 'rounded-2xl border border-white/[0.07] bg-[#0f1424]';

export const Card: React.FC<{
  title?: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, hint, action, children, className = '' }) => (
  <section className={`${surface} p-6 sm:p-7 ${className}`}>
    {(title || action) && (
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {title && <h2 className="font-display text-lg font-semibold tracking-tight text-slate-100">{title}</h2>}
          {hint && <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{hint}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    )}
    <div className={title || action ? 'mt-6 space-y-5' : 'space-y-5'}>{children}</div>
  </section>
);

export const inputCls =
  'w-full h-12 rounded-xl bg-[#0a0f1d] border border-white/[0.08] px-4 text-base font-body text-slate-100 placeholder:text-slate-600 outline-none transition-colors focus:border-[#f59e0b]/70 focus:ring-2 focus:ring-[#f59e0b]/15 disabled:opacity-60';

export const Field: React.FC<{ id: string; label: string; hint?: string; children: React.ReactNode }> = ({ id, label, hint, children }) => (
  <div>
    <label htmlFor={id} className="mb-2 block text-sm font-medium text-slate-300">
      {label}
    </label>
    {children}
    {hint && <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{hint}</p>}
  </div>
);

type BtnTone = 'primary' | 'quiet' | 'danger';
const BTN: Record<BtnTone, string> = {
  primary: 'bg-[#f59e0b] hover:bg-[#fbbf24] text-[#150f05]',
  quiet: 'bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-slate-200',
  danger: 'bg-red-500/90 hover:bg-red-500 text-white',
};

export const Button: React.FC<{
  onClick?: () => void;
  tone?: BtnTone;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
  type?: 'button' | 'submit';
  ariaLabel?: string;
}> = ({ onClick, tone = 'primary', disabled, children, className = '', type = 'button', ariaLabel }) => (
  <button
    type={type}
    onClick={onClick}
    disabled={disabled}
    aria-label={ariaLabel}
    className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 font-display text-sm font-bold cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BTN[tone]} ${className}`}
  >
    {children}
  </button>
);

export const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; disabled?: boolean }> = ({
  checked,
  onChange,
  label,
  hint,
  disabled,
}) => (
  <div className="flex items-start justify-between gap-5">
    <div className="min-w-0">
      <div className="text-[15px] font-semibold text-slate-100">{label}</div>
      {hint && <p className="mt-1 text-sm leading-relaxed text-slate-400">{hint}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative mt-0.5 h-7 w-12 shrink-0 cursor-pointer rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'border-[#f59e0b] bg-[#f59e0b]' : 'border-white/[0.12] bg-white/[0.06]'
      }`}
    >
      <span
        className={`absolute top-0.5 h-[22px] w-[22px] rounded-full bg-white shadow transition-all ${checked ? 'left-[23px]' : 'left-0.5'}`}
      />
    </button>
  </div>
);

export const Row: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div className="flex items-start justify-between gap-6 text-sm">
    <span className="shrink-0 text-slate-400">{label}</span>
    <span className="min-w-0 break-words text-right font-medium text-slate-100">{value || <span className="text-slate-600">None</span>}</span>
  </div>
);

export const Divider: React.FC = () => <div className="h-px bg-white/[0.06]" />;

type ChipTone = 'gold' | 'plain' | 'ok' | 'danger';
const CHIP: Record<ChipTone, string> = {
  gold: 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#ffc174]',
  plain: 'border-white/[0.08] bg-white/[0.04] text-slate-300',
  ok: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  danger: 'border-red-400/40 bg-red-500/10 text-red-300',
};

export const Chip: React.FC<{ tone?: ChipTone; children: React.ReactNode }> = ({ tone = 'plain', children }) => (
  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${CHIP[tone]}`}>{children}</span>
);

export const StatusDot: React.FC<{ on: boolean }> = ({ on }) => (
  <span className={`inline-block h-2 w-2 rounded-full ${on ? 'bg-[#ffc174]' : 'bg-slate-600'}`} aria-hidden="true" />
);

export const Notice: React.FC<{ tone?: 'info' | 'error' | 'ok'; children: React.ReactNode }> = ({ tone = 'info', children }) => (
  <p
    role={tone === 'error' ? 'alert' : 'status'}
    className={`text-sm leading-relaxed ${tone === 'error' ? 'text-red-400' : tone === 'ok' ? 'text-[#ffc174]' : 'text-slate-400'}`}
  >
    {children}
  </p>
);

export const PageTitle: React.FC<{ eyebrow?: string; title: string; subtitle?: string }> = ({ eyebrow, title, subtitle }) => (
  <div className="mb-8 mt-6">
    {eyebrow && <span className="mb-2 block text-sm font-semibold text-[#f59e0b]">{eyebrow}</span>}
    <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-100 sm:text-4xl">{title}</h1>
    {subtitle && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-400">{subtitle}</p>}
  </div>
);
