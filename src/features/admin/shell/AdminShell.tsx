import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, MapPin, Plug, Settings, Users } from 'lucide-react';
import { IntegrationsProvider } from '../../../integrations';
import { SyncProvider } from '../../../lib/sync';
import { SyncIndicator } from '../../../components/SyncIndicator';

export type AdminSection = 'clients' | 'territories' | 'integrations' | 'settings';

const NAV: { key: AdminSection; label: string; path: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'clients', label: 'Clients', path: '/admin', Icon: Users },
  { key: 'territories', label: 'Territories', path: '/admin/territories', Icon: MapPin },
  { key: 'integrations', label: 'Integrations', path: '/admin/integrations', Icon: Plug },
  { key: 'settings', label: 'Settings', path: '/admin/settings', Icon: Settings },
];

interface Props {
  section: AdminSection;
  userEmail: string;
  onNavigate: (path: string) => void;
  onSignOut?: () => void;
  children: React.ReactNode;
}

const Brand: React.FC = () => (
  <span className="flex items-center gap-2.5 whitespace-nowrap font-display text-lg font-extrabold tracking-tight text-slate-100">
    <span>
      WEDGE<span className="text-[#ffc174]">SCALE</span>
    </span>
    <span className="rounded-md border border-[#ffc174]/40 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-[#ffc174]">Admin</span>
  </span>
);

/**
 * The admin frame. It only ever appears AFTER the two-factor check, so nobody sees the navigation without it.
 * Desktop: a top bar. Phone: a slim top bar and a bottom bar you can reach with your thumb.
 */
export const AdminShell: React.FC<Props> = ({ section, userEmail, onNavigate, onSignOut, children }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <SyncProvider>
    <IntegrationsProvider>
    <div className="min-h-screen w-full bg-[#090e1c] font-body text-[#dee1f7]">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 pb-4 pt-5 sm:px-8">
        <div className="flex items-center gap-10">
          <Brand />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Admin sections">
            {NAV.map(({ key, label, path }) => (
              <button
                key={key}
                type="button"
                onClick={() => onNavigate(path)}
                aria-current={section === key ? 'page' : undefined}
                className={`cursor-pointer rounded-xl px-4 py-2.5 font-display text-[15px] font-semibold transition-colors ${
                  section === key ? 'bg-white/[0.07] text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-1 sm:gap-3">
        <SyncIndicator />
        <div className="relative" ref={ref}>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label="Account menu"
            className="flex h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-slate-300 transition-colors hover:bg-white/[0.06]"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-[#1b2438] text-xs font-bold text-[#ffc174]">
              {(userEmail || 'A').charAt(0).toUpperCase()}
            </span>
            <span className="hidden max-w-[200px] truncate md:inline">{userEmail}</span>
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </button>
          {open && (
            <div className="menu-panel absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0f1424] py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
              <div className="truncate px-4 pb-2 pt-2.5 text-xs text-slate-500 md:hidden">{userEmail}</div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNavigate('/admin/settings');
                }}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                Settings
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onNavigate('/queue');
                }}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                Client dashboard
              </button>
              <div className="my-1.5 h-px bg-white/[0.06]" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignOut?.();
                }}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-red-400"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-32 sm:px-8 md:pb-24">{children}</main>

      {/* phones: the sections live at the bottom, where a thumb can reach */}
      <nav
        aria-label="Admin sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#0a0f1d]/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-4">
          {NAV.map(({ key, label, path, Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(path)}
              aria-current={section === key ? 'page' : undefined}
              className={`flex cursor-pointer flex-col items-center gap-1 py-3 text-xs font-semibold transition-colors ${
                section === key ? 'text-[#ffc174]' : 'text-slate-500'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
    </IntegrationsProvider>
    </SyncProvider>
  );
};
