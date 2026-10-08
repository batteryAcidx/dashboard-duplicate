import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff, AlertTriangle, CheckCircle2, Check, X, ArrowRight } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

// Keep this in sync with Supabase: Authentication > Sign In / Providers > Email > Minimum password length
const MIN_PASSWORD_LENGTH = 10;

// Read the link type ONCE, when this file loads. Supabase clears the address after it
// processes the token, so reading it later in a component would find nothing.
type LinkType = 'invite' | 'recovery' | null;

const readLinkType = (): LinkType => {
  if (typeof window === 'undefined') return null;
  const all = `${window.location.hash}${window.location.search}`;
  if (all.includes('type=invite')) return 'invite';
  if (all.includes('type=recovery')) return 'recovery';
  return null;
};

const INITIAL_LINK_TYPE: LinkType = readLinkType();

interface SetPasswordPageProps {
  onNavigate?: (path: string) => void;
}

export const SetPasswordPage: React.FC<SetPasswordPageProps> = ({ onNavigate }) => {
  const [hasValidSession, setHasValidSession] = useState<boolean | null>(null);
  const [isInvite, setIsInvite] = useState<boolean>(INITIAL_LINK_TYPE === 'invite');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setHasValidSession(false);
      return;
    }

    let isMounted = true;

    const applySession = (session: { user?: { last_sign_in_at?: string | null } } | null) => {
      if (!session) return false;
      setHasValidSession(true);
      if (INITIAL_LINK_TYPE === 'invite') {
        setIsInvite(true);
      } else if (INITIAL_LINK_TYPE === 'recovery') {
        setIsInvite(false);
      } else if (session.user && !session.user.last_sign_in_at) {
        // fallback when the link type could not be read
        setIsInvite(true);
      }
      return true;
    };

    // Check existing session
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (!isMounted) return;
      if (error || !session) {
        // If there's a token in the address, give Supabase a moment to process it
        const hasUrlToken =
          window.location.hash.includes('access_token') ||
          window.location.hash.includes('type=recovery') ||
          window.location.hash.includes('type=invite') ||
          window.location.search.includes('code=');

        if (!hasUrlToken) {
          setHasValidSession(false);
        }
      } else {
        applySession(session);
      }
    });

    // React directly to Supabase Auth state events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;

      if (event === 'PASSWORD_RECOVERY') {
        setHasValidSession(true);
        setIsInvite(false);
      } else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (!applySession(session)) setHasValidSession(false);
      } else if (event === 'SIGNED_OUT') {
        setHasValidSession(false);
      }
    });

    // Safety net: never sit on "Checking your link…" forever
    const timeout = setTimeout(() => {
      if (isMounted) setHasValidSession((prev) => (prev === null ? false : prev));
    }, 5000);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const hasMinLength = password.length >= MIN_PASSWORD_LENGTH;
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorMessage(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    setIsLoading(true);

    if (!isSupabaseConfigured) {
      setIsLoading(false);
      setErrorMessage('The dashboard is not connected to its database. Contact support.');
      return;
    }

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        const msg = (error.message || '').toLowerCase();
        const code = (error as { code?: string }).code;
        const status = (error as { status?: number }).status;

        // The link/session is gone: show the expired screen
        if (
          error.name === 'AuthSessionMissingError' ||
          status === 401 ||
          status === 403 ||
          msg.includes('session') ||
          msg.includes('expired') ||
          msg.includes('jwt')
        ) {
          setHasValidSession(false);
          setIsLoading(false);
          return;
        }

        if (code === 'weak_password' || msg.includes('weak') || msg.includes('at least')) {
          setErrorMessage('That password is too easy to guess. Try a longer one with letters and numbers.');
        } else if (code === 'same_password' || msg.includes('different from the old')) {
          setErrorMessage('Choose a password you have not used before.');
        } else {
          setErrorMessage(error.message);
        }
        setIsLoading(false);
        return;
      }

      setIsLoading(false);
      setIsSuccess(true);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update password. Please try again.');
      setIsLoading(false);
    }
  };

  const handleNavigate = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    } else {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  // Don't treat as expired until initialization has completely finished
  if (hasValidSession === null) {
    return (
      <div className="min-h-screen w-full bg-[#0e1322] flex flex-col items-center justify-center px-4 select-none">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#252939] border border-[#f59e0b]/50 flex items-center justify-center shadow-sm">
            <div className="w-5 h-5 border-2 border-[#f59e0b] border-t-transparent rounded-full animate-spin" />
          </div>
          <p className="font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-slate-400 font-bold">
            Checking your link…
          </p>
        </div>
      </div>
    );
  }

  const isExpired = hasValidSession === false;

  return (
    <div className="min-h-screen w-full bg-[#0e1322] flex flex-col justify-between items-center px-4 py-12 sm:py-16 relative overflow-hidden">
      {/* Background Subtle Ambience */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[580px] h-[580px] bg-[#f59e0b]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Spacer to balance vertical centering */}
      <div className="w-full max-w-lg h-4" />

      {/* Main Centered Set Password Box */}
      <div className="w-full max-w-lg my-auto z-10">
        <div className="rounded-2xl sm:rounded-3xl bg-[#121727] border border-[#23293c] p-6 sm:p-12 shadow-[0_24px_60px_rgba(0,0,0,0.65)] relative overflow-hidden">
          {/* Top Hairline Accent */}
          <div className="absolute top-0 inset-x-8 h-[1px] bg-gradient-to-r from-transparent via-[#ffc174]/40 to-transparent pointer-events-none" />

          {/* Logo In The Middle */}
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

            {/* Wordmark */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
              <span className="font-['Space_Grotesk'] text-xl sm:text-3xl uppercase tracking-tight text-slate-100 font-black">
                WEDGE<span className="text-[#ffc174]">SCALE</span>
              </span>
              <span className="font-['JetBrains_Mono'] text-[10px] sm:text-sm font-bold uppercase tracking-widest text-[#ffc174] bg-[#252939] border border-[#ffc174]/40 px-2 sm:px-2.5 py-0.5 rounded-lg shadow-sm">
                {isInvite ? 'ONBOARDING' : 'SECURITY'}
              </span>
            </div>

            {/* Dynamic Situation Line */}
            <p className="font-['Inter'] text-xs sm:text-sm text-slate-400 mt-3 sm:mt-4 text-center max-w-sm leading-relaxed text-pretty font-medium">
              {isExpired
                ? 'This access link is no longer valid.'
                : isSuccess
                ? 'Your password has been saved.'
                : isInvite
                ? 'Welcome, set your password'
                : 'Reset your password'}
            </p>
          </div>

          {/* Conditional Views: Expired State vs Success State vs Active Form */}
          {isExpired ? (
            /* Expired Link State */
            <div className="space-y-6 pt-1 sm:pt-2 animate-in fade-in duration-200">
              <div className="p-4 sm:p-5 rounded-xl bg-[#161b2a] border border-red-900/40 flex items-start gap-3.5 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-red-950/50 border border-red-800/40 flex items-center justify-center shrink-0 text-red-400 mt-0.5">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div className="space-y-1">
                  <p className="font-['Space_Grotesk'] text-sm font-bold text-slate-200 uppercase tracking-wide">
                    Link Expired
                  </p>
                  <p className="font-['Inter'] text-xs sm:text-sm text-slate-400 leading-relaxed">
                    This security link has expired or has already been used. Please request a new link to continue.
                  </p>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleNavigate('/forgot-password')}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] py-3.5 sm:py-4.5 px-6 font-['Space_Grotesk'] text-xs sm:text-base font-black uppercase tracking-widest text-[#181105] shadow-[0_12px_28px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.45)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-150 cursor-pointer border border-[#d97707]/60"
                >
                  REQUEST NEW LINK
                </button>

                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => handleNavigate('/login')}
                    className="font-['JetBrains_Mono'] text-xs text-slate-400 hover:text-[#ffc174] transition-colors uppercase tracking-[0.16em] cursor-pointer"
                  >
                    Back to Log In
                  </button>
                </div>
              </div>
            </div>
          ) : isSuccess ? (
            /* Success State */
            <div className="space-y-6 pt-1 sm:pt-2 animate-in fade-in duration-200">
              <div className="p-4 sm:p-5 rounded-xl bg-[#0a0e1a] border border-[#272e42] flex items-start gap-3.5 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/30 flex items-center justify-center shrink-0 text-[#ffc174] mt-0.5">
                  <CheckCircle2 className="w-4 h-4 text-[#f59e0b]" />
                </div>
                <div className="space-y-1">
                  <p className="font-['Space_Grotesk'] text-sm font-bold text-slate-200 uppercase tracking-wide">
                    Password Set
                  </p>
                  <p className="font-['Inter'] text-xs sm:text-sm text-slate-400 leading-relaxed">
                    Your password has been updated. You can now access your live dispatch queue.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleNavigate('/queue')}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] py-3.5 sm:py-4.5 px-6 font-['Space_Grotesk'] text-xs sm:text-base font-black uppercase tracking-widest text-[#181105] shadow-[0_12px_28px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.45)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-150 cursor-pointer border border-[#d97707]/60"
                >
                  OPEN DASHBOARD
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            /* Set Password Form */
            <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6 pt-1 sm:pt-2">
              {errorMessage && (
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-900/40 text-red-400 text-xs sm:text-sm font-['Inter'] leading-relaxed shadow-sm">
                  {errorMessage}
                </div>
              )}

              {/* New Password Field */}
              <div className="space-y-2 text-left">
                <label
                  htmlFor="new-password"
                  className="block font-['JetBrains_Mono'] text-xs font-bold uppercase tracking-[0.16em] text-slate-300"
                >
                  New Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="new-password"
                    name="new-password"
                    autoComplete="new-password"
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

              {/* Confirm Password Field */}
              <div className="space-y-2 text-left">
                <label
                  htmlFor="confirm-password"
                  className="block font-['JetBrains_Mono'] text-xs font-bold uppercase tracking-[0.16em] text-slate-300"
                >
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="confirm-password"
                    name="confirm-password"
                    autoComplete="new-password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-11 pr-11 py-3 sm:py-4 bg-[#0a0e1a] border border-[#272e42] focus:border-[#f59e0b] focus:outline-none rounded-xl text-xs sm:text-sm font-['Inter'] text-slate-100 placeholder:text-slate-600 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password Rules */}
              <div className="p-3.5 rounded-xl bg-[#0a0e1a] border border-[#272e42]/80 space-y-2 text-left">
                <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Password Requirements
                </div>
                <div className="space-y-1.5 font-['Inter'] text-xs">
                  <div className="flex items-center gap-2">
                    {hasMinLength ? (
                      <Check className="w-3.5 h-3.5 text-[#ffc174]" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full border border-slate-600 flex items-center justify-center text-[8px] text-slate-500">•</span>
                    )}
                    <span className={hasMinLength ? 'text-slate-200' : 'text-slate-500'}>
                      Minimum {MIN_PASSWORD_LENGTH} characters
                    </span>
                  </div>
                  {confirmPassword.length > 0 && (
                    <div className="flex items-center gap-2">
                      {passwordsMatch ? (
                        <Check className="w-3.5 h-3.5 text-[#ffc174]" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span className={passwordsMatch ? 'text-slate-200' : 'text-red-400'}>
                        {passwordsMatch ? 'Passwords match' : 'Passwords must match'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2 space-y-4">
                <button
                  type="submit"
                  disabled={isLoading || !hasMinLength}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] py-3.5 sm:py-4.5 px-6 font-['Space_Grotesk'] text-xs sm:text-base font-black uppercase tracking-widest text-[#181105] shadow-[0_12px_28px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.45)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-150 cursor-pointer border border-[#d97707]/60 disabled:opacity-50"
                >
                  {isLoading
                    ? 'SAVING PASSWORD...'
                    : isInvite
                    ? 'SET PASSWORD'
                    : 'RESET PASSWORD'}
                </button>

                {/* Back to Login Link */}
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={() => handleNavigate('/login')}
                    className="font-['JetBrains_Mono'] text-xs text-slate-400 hover:text-[#ffc174] transition-colors uppercase tracking-[0.16em] cursor-pointer"
                  >
                    Back to Log In
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Bottom Footer Line */}
      <div className="w-full text-center z-10 pt-8 pb-2">
        <p className="font-['JetBrains_Mono'] text-xs text-slate-500 uppercase tracking-widest">
          WedgeScale Dashboard Platform
        </p>
      </div>
    </div>
  );
};