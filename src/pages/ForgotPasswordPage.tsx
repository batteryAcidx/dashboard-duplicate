import React, { useState } from 'react';
import { Mail, ArrowLeft, MailCheck } from 'lucide-react';

interface ForgotPasswordPageProps {
  onNavigate?: (path: string) => void;
}

export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onNavigate }) => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);

    // Simulated recovery dispatch
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
    }, 600);
  };

  const handleBackToLogin = () => {
    if (onNavigate) {
      onNavigate('/login');
    } else {
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0e1322] flex flex-col justify-between items-center px-4 py-12 sm:py-16 relative overflow-hidden select-none">
      {/* Background Subtle Ambience */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[580px] h-[580px] bg-[#f59e0b]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Spacer to balance vertical centering */}
      <div className="w-full max-w-lg h-4" />

      {/* Main Centered Forgot Password Box */}
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
                RECOVERY
              </span>
            </div>

            <p className="font-['Inter'] text-xs sm:text-sm text-slate-400 mt-3 sm:mt-4 text-center max-w-sm leading-relaxed text-pretty">
              {isSubmitted
                ? 'Your recovery request has been processed.'
                : 'Enter your email to recover access to your account.'}
            </p>
          </div>

          {/* Confirmation or Form */}
          {isSubmitted ? (
            <div className="space-y-6 pt-1 sm:pt-2 animate-in fade-in duration-200">
              {/* Refined Confirmation Banner */}
              <div className="p-4 sm:p-5 rounded-xl bg-[#0a0e1a] border border-[#272e42] flex items-start gap-3.5 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/30 flex items-center justify-center shrink-0 text-[#ffc174] mt-0.5">
                  <MailCheck className="w-4 h-4 text-[#f59e0b]" />
                </div>
                <div className="space-y-1">
                  <p className="font-['Inter'] text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                    If that email has an account, we've sent a link.
                  </p>
                  <p className="font-['Inter'] text-[11px] sm:text-xs text-slate-500 leading-relaxed">
                    Be sure to check your spam or promotions folder.
                  </p>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] py-3.5 sm:py-4.5 px-6 font-['Space_Grotesk'] text-xs sm:text-base font-black uppercase tracking-widest text-[#181105] shadow-[0_12px_28px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.45)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-150 cursor-pointer border border-[#d97707]/60"
                >
                  RETURN TO LOGIN
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-7 pt-1 sm:pt-2">
              {/* Email Field */}
              <div className="space-y-2 text-left">
                <label className="block font-['JetBrains_Mono'] text-xs font-bold uppercase tracking-[0.16em] text-slate-300">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="contractor@roofingcompany.com"
                    className="w-full pl-11 pr-4 py-3 sm:py-4 bg-[#0a0e1a] border border-[#272e42] focus:border-[#f59e0b] focus:outline-none rounded-xl text-xs sm:text-sm font-['Inter'] text-slate-100 placeholder:text-slate-600 transition-colors"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-2 sm:pt-3 space-y-4">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full inline-flex items-center justify-center rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] py-3.5 sm:py-4.5 px-6 font-['Space_Grotesk'] text-xs sm:text-base font-black uppercase tracking-widest text-[#181105] shadow-[0_12px_28px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.45)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-150 cursor-pointer border border-[#d97707]/60 disabled:opacity-50"
                >
                  {isLoading ? 'SENDING LINK...' : 'SEND RESET LINK'}
                </button>

                {/* Back to Login Link */}
                <div className="text-center pt-1">
                  <button
                    type="button"
                    onClick={handleBackToLogin}
                    className="inline-flex items-center justify-center gap-2 font-['JetBrains_Mono'] text-xs text-slate-400 hover:text-[#ffc174] transition-colors uppercase tracking-[0.16em] cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
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
