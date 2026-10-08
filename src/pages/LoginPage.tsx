import React, { useState } from 'react';
import { Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

interface LoginPageProps {
  onNavigate?: (path: string) => void;
  onSignIn?: (email: string) => void;
}

const GENERIC_LOGIN_ERROR = "That email or password doesn't look right. Try again.";

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate, onSignIn }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both email and password.');
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMessage('The dashboard is temporarily unavailable. Please try again shortly or contact support.');
      return;
    }

    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        const status = (error as { status?: number }).status;
        const code = (error as { code?: string }).code;
        const msg = (error.message || '').toLowerCase();

        if (status === 429 || code === 'over_request_rate_limit' || msg.includes('rate limit')) {
          setErrorMessage('Too many attempts. Please wait a few minutes and try again.');
        } else if (code === 'email_not_confirmed' || msg.includes('not confirmed')) {
          setErrorMessage('This account is not active yet. Use the link in your invite email, or contact support.');
        } else if (msg.includes('fetch') || msg.includes('network')) {
          setErrorMessage('Could not reach the server. Check your connection and try again.');
        } else {
          // wrong password, unknown email, anything else: same message, never reveal which part was wrong
          setErrorMessage(GENERIC_LOGIN_ERROR);
        }
        setIsLoading(false);
        return;
      }

      if (data?.user) {
        setIsLoading(false);
        const userEmail = data.user.email || email.trim();
        if (onSignIn) {
          onSignIn(userEmail);
        } else if (onNavigate) {
          onNavigate('/queue');
        }
      } else {
        setIsLoading(false);
        setErrorMessage(GENERIC_LOGIN_ERROR);
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage('Something went wrong. Please try again.');
    }
  };

  const handleForgotClick = () => {
    if (onNavigate) {
      onNavigate('/forgot-password');
    } else {
      window.history.pushState({}, '', '/forgot-password');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0e1322] flex flex-col justify-between items-center px-4 py-12 sm:py-16 relative overflow-hidden">
      {/* Background Subtle Ambience */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[580px] h-[580px] bg-[#f59e0b]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Spacer to balance vertical centering without top bar */}
      <div className="w-full max-w-lg h-4" />

      {/* Main Centered Login Box */}
      <div className="w-full max-w-lg my-auto z-10">
        <div className="rounded-2xl sm:rounded-3xl bg-[#121727] border border-[#23293c] p-6 sm:p-12 shadow-[0_24px_60px_rgba(0,0,0,0.65)] relative overflow-hidden">
          {/* Top Hairline Accent */}
          <div className="absolute top-0 inset-x-8 h-[1px] bg-gradient-to-r from-transparent via-[#ffc174]/40 to-transparent pointer-events-none" />

          {/* Logo In The Middle with 'DASHBOARD' */}
          <div className="flex flex-col items-center justify-center mb-6 sm:mb-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[#252939] border border-[#f59e0b]/50 flex items-center justify-center shadow-sm mb-3.5 sm:mb-4">
              <svg
                viewBox="0 0 24 24"
                className="w-7 h-7 sm:w-8 sm:h-8 text-[#f59e0b]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.27 20a2 2 0 0 0 3.46 0l8-14A2 2 0 0 0 20 3H4a2 2 0 0 0-1.73 3Z" fill="none" />
              </svg>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
              <span className="font-['Space_Grotesk'] text-xl sm:text-3xl uppercase tracking-tight text-slate-100 font-black">
                WEDGE<span className="text-[#ffc174]">SCALE</span>
              </span>
              <span className="font-['JetBrains_Mono'] text-[10px] sm:text-sm font-bold uppercase tracking-widest text-[#ffc174] bg-[#252939] border border-[#ffc174]/40 px-2 sm:px-2.5 py-0.5 rounded-lg shadow-sm">
                DASHBOARD
              </span>
            </div>

            <p className="font-['Inter'] text-xs sm:text-sm text-slate-400 mt-3 sm:mt-4 text-center max-w-sm leading-relaxed text-pretty">
              Log in to see your live queue.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-7 pt-1 sm:pt-2">
            {errorMessage && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-red-950/40 border border-red-900/40 text-red-400 text-xs sm:text-sm font-['Inter'] leading-relaxed shadow-sm"
              >
                {errorMessage}
              </div>
            )}

            {/* Email Field */}
            <div className="space-y-2 text-left">
              <label
                htmlFor="login-email"
                className="block font-['JetBrains_Mono'] text-xs font-bold uppercase tracking-[0.16em] text-slate-300"
              >
                Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="contractor@roofingcompany.com"
                  className="w-full pl-11 pr-4 py-3 sm:py-4 bg-[#0a0e1a] border border-[#272e42] focus:border-[#f59e0b] focus:outline-none rounded-xl text-xs sm:text-sm font-['Inter'] text-slate-100 placeholder:text-slate-600 transition-colors"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-2 text-left pt-0.5 sm:pt-1">
              <div className="flex items-center justify-between pb-0.5">
                <label
                  htmlFor="login-password"
                  className="block font-['JetBrains_Mono'] text-xs font-bold uppercase tracking-[0.16em] text-slate-300"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotClick}
                  className="font-['JetBrains_Mono'] text-[10px] sm:text-[11px] text-slate-400 hover:text-[#ffc174] transition-colors uppercase tracking-[0.16em] cursor-pointer"
                >
                  Forgot?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-password"
                  name="password"
                  autoComplete="current-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-11 pr-11 py-3 sm:py-4 bg-[#0a0e1a] border border-[#272e42] focus:border-[#f59e0b] focus:outline-none rounded-xl text-xs sm:text-sm font-['Inter'] text-slate-100 placeholder:text-slate-600 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit / Login Button */}
            <div className="pt-2 sm:pt-3">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full inline-flex items-center justify-center rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] py-3.5 sm:py-4.5 px-6 font-['Space_Grotesk'] text-xs sm:text-base font-black uppercase tracking-widest text-[#181105] shadow-[0_12px_28px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.45)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-150 cursor-pointer border border-[#d97707]/60 disabled:opacity-50"
              >
                {isLoading ? 'SIGNING IN...' : 'LOG IN'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Bottom Footer Line */}
      <div className="w-full text-center z-10 pt-8 pb-2 space-y-2">
        <a
          href="https://wedgescale.com"
          className="inline-block font-['JetBrains_Mono'] text-xs text-slate-400 hover:text-[#ffc174] transition-colors uppercase tracking-[0.16em]"
        >
          Back to wedgescale.com
        </a>
        <p className="font-['JetBrains_Mono'] text-xs text-slate-500 uppercase tracking-widest">
          WedgeScale Dashboard Platform
        </p>
      </div>
    </div>
  );
};