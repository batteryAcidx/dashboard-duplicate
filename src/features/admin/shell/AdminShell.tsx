import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, MapPin, Users } from 'lucide-react';
import { IntegrationsProvider } from '../../../integrations';
import { SyncProvider } from '../../../lib/sync';
import { SyncIndicator } from '../../../components/SyncIndicator';
import { adminMenu, showWikiLink } from '../../../domain';
import type { AdminSection } from '../../../domain';

export type { AdminSection };

/** The two things you move between all day. Everything else is in the account menu. */
const NAV: { key: AdminSection; label: string; path: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'clients', label: 'Clients', path: '/admin', Icon: Users },
  { key: 'territories', label: 'Territories', path: '/admin/territories', Icon: MapPin },
];

interface Props {
  section: AdminSection;
  userEmail: string;
  onNavigate: (path: string) => void;
  onSignOut?: () => void;
  /** start with the account menu open (used by tests) */
  initialOpen?: boolean;
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

const menuItemCls = 'flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white';

/**
 * The admin frame. It only ever appears AFTER the two-factor check, so nobody sees the navigation without it.
 * Top bar: Clients and Territories. Account menu: Integrations, Settings, Client dashboard, Sign out
 * (never the page you are on). Footer: Wiki. Phone: the two main pages along the bottom.
 */
export const AdminShell: React.FC<Props> = ({ section, userEmail, onNavigate, onSignOut, initialOpen = false, children }) => {
  const [open, setOpen] = useState(initialOpen);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    onNavigate(path);
  };

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
              {adminMenu(section).map((item) => (
                <button key={item.key} type="button" onClick={() => go(item.path)} className={menuItemCls}>
                  {item.label}
                </button>
              ))}
              <div className="my-1.5 h-px bg-white/[0.06]" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSignOut?.();
                }}
                className={`${menuItemCls} hover:text-red-400`}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">{children}</main>

      <footer className="mx-auto max-w-6xl border-t border-white/[0.06] px-5 pb-28 pt-8 text-sm sm:px-8 md:pb-12">
        {showWikiLink(section) && (
          <button type="button" onClick={() => onNavigate('/admin/wiki')} className="cursor-pointer font-semibold text-slate-400 transition-colors hover:text-[#ffc174]">
            Wiki
          </button>
        )}
      </footer>

      {/* phones: the two main pages live at the bottom, where a thumb can reach */}
      <nav
        aria-label="Admin sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#0a0f1d]/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-2">
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
