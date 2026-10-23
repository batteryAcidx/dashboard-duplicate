import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut } from 'lucide-react';

interface Props {
  companyName: string;
  userEmail: string;
  current?: 'dashboard' | 'contacts' | 'settings';
  isAdmin?: boolean;
  onNavigate?: (path: string) => void;
  onSignOut?: () => void;
  extra?: React.ReactNode;
}

const ITEMS: { key: 'dashboard' | 'contacts' | 'settings'; label: string; path: string }[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/queue' },
  { key: 'contacts', label: 'Contacts', path: '/contacts' },
  { key: 'settings', label: 'Settings', path: '/settings' },
];

/** The top bar on every client page: the company name on the left, one menu on the right. */
export const AppHeader: React.FC<Props> = ({ companyName, userEmail, current, isAdmin, onNavigate, onSignOut, extra }) => {
  const [open, setOpen] = useState(false);
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
    if (onNavigate) onNavigate(path);
    else window.location.assign(path);
  };

  const itemCls = (active: boolean) =>
    `flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-white/[0.05] ${
      active ? 'text-[#ffc174]' : 'text-slate-300 hover:text-white'
    }`;

  return (
    <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 pb-4 pt-6 sm:px-8 lg:px-10">
      <span className="truncate font-display text-xl font-extrabold tracking-tight text-slate-100">{companyName}</span>
      <div className="flex items-center gap-3">
        {extra}
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
            <span className="hidden max-w-[180px] truncate sm:inline">{userEmail}</span>
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </button>
          {open && (
            <div className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0f1424] py-1.5 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
              {ITEMS.map((i) => (
                <button key={i.key} type="button" onClick={() => go(i.path)} className={itemCls(current === i.key)}>
                  {i.label}
                </button>
              ))}
              {isAdmin && (
                <button type="button" onClick={() => go('/admin')} className={itemCls(false)}>
                  <span className="text-[#ffc174]">Admin</span>
                </button>
              )}
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
    </div>
  );
};
