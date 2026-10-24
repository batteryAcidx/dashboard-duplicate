import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ListChecks, LogOut, MessageSquare, Settings, Users } from 'lucide-react';
import { activeOwnerTab, ownerMenu, ownerTabs } from '../domain';
import type { OwnerPage, OwnerTab } from '../domain';
import { SyncIndicator } from './SyncIndicator';

interface Props {
  companyName: string;
  userEmail: string;
  current?: OwnerPage;
  isAdmin?: boolean;
  /** the Setup tab shows while the account is still being set up */
  showSetup?: boolean;
  /** hide the bottom bar on a phone (inside a conversation, where the page has its own bottom controls) */
  hideTabs?: boolean;
  onNavigate?: (path: string) => void;
  onSignOut?: () => void;
  /** start with the menu open (used by tests) */
  initialOpen?: boolean;
}

const ICONS: Record<OwnerTab['page'], React.ComponentType<{ className?: string }>> = {
  dashboard: MessageSquare,
  setup: ListChecks,
  contacts: Users,
  settings: Settings,
};

const COLS: Record<number, string> = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4' };

/**
 * The top bar on every client page: the company name, the pages as tabs (on a computer), the one Sync button,
 * and the account menu. On a phone the tabs move to a bar along the bottom, like the admin.
 */
export const AppHeader: React.FC<Props> = ({ companyName, userEmail, current, isAdmin, showSetup, hideTabs, onNavigate, onSignOut, initialOpen = false }) => {
  const [open, setOpen] = useState(initialOpen);
  const ref = useRef<HTMLDivElement>(null);
  const tabs = ownerTabs(Boolean(showSetup));
  const active = activeOwnerTab(current);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const go = (path: string) => {
    setOpen(false);
    if (onNavigate) onNavigate(path);
    else window.location.assign(path);
  };

  const itemCls = 'flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.05] hover:text-white';

  return (
    <>
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 pb-4 pt-6 sm:px-8 lg:px-10">
        <div className="flex min-w-0 items-center gap-8 lg:gap-10">
          <span className="truncate font-display text-xl font-extrabold tracking-tight text-slate-100">{companyName}</span>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Pages">
            {tabs.map((t) => (
              <button
                key={t.page}
                type="button"
                onClick={() => go(t.path)}
                aria-current={active === t.page ? 'page' : undefined}
                className={`cursor-pointer rounded-xl px-4 py-2.5 font-display text-[15px] font-semibold transition-colors ${
                  active === t.page ? 'bg-white/[0.07] text-slate-100' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <SyncIndicator compact />
          <div className="relative" ref={ref}>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label="Account menu"
              className="flex h-11 cursor-pointer items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-slate-300 transition-colors hover:bg-white/[0.06]"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-[#1b2438] text-xs font-bold text-[#ffc174]">
                {(userEmail || 'U').charAt(0).toUpperCase()}
              </span>
              <ChevronDown className="h-4 w-4 text-slate-500" />
            </button>
            {open && (
              <div className="menu-panel absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0f1424] py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                <div className="truncate px-4 pb-2 pt-2.5 text-xs text-slate-500">{userEmail}</div>
                {ownerMenu(Boolean(isAdmin)).map((i) => (
                  <button key={i.key} type="button" onClick={() => go(i.path)} className={itemCls}>
                    <span className={i.accent ? 'text-[#ffc174]' : undefined}>{i.label}</span>
                  </button>
                ))}
                {isAdmin && <div className="my-1.5 h-px bg-white/[0.06]" />}
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSignOut?.();
                  }}
                  className={`${itemCls} hover:text-red-400`}
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* phones: the pages along the bottom, where a thumb can reach them */}
      {!hideTabs && (
        <nav
          aria-label="Pages"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-[#0a0f1d]/95 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
        >
          <div className={`mx-auto grid max-w-md ${COLS[tabs.length] ?? 'grid-cols-3'}`}>
            {tabs.map((t) => {
              const Icon = ICONS[t.page];
              return (
                <button
                  key={t.page}
                  type="button"
                  onClick={() => go(t.path)}
                  aria-current={active === t.page ? 'page' : undefined}
                  className={`flex cursor-pointer flex-col items-center gap-1 py-3 text-xs font-semibold transition-colors ${active === t.page ? 'text-[#ffc174]' : 'text-slate-500'}`}
                >
                  <Icon className="h-5 w-5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
};
