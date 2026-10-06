import React from 'react';
import { ArrowLeft, Compass } from 'lucide-react';

interface NotFoundPageProps {
  onNavigate?: (path: string) => void;
}

export const NotFoundPage: React.FC<NotFoundPageProps> = ({ onNavigate }) => {
  const handleBackToQueue = () => {
    if (onNavigate) {
      onNavigate('/queue');
    } else {
      window.history.pushState({}, '', '/queue');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0e1322] flex flex-col justify-between items-center px-4 py-12 sm:py-16 relative overflow-hidden select-none">
      {/* Background Subtle Ambience */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[580px] h-[580px] bg-[#f59e0b]/5 rounded-full blur-3xl pointer-events-none" />

      {/* Spacer to balance vertical centering */}
      <div className="w-full max-w-lg h-4" />

      {/* Main Centered 404 Box */}
      <div className="w-full max-w-lg my-auto z-10">
        <div className="rounded-2xl sm:rounded-3xl bg-[#121727] border border-[#23293c] p-6 sm:p-12 shadow-[0_24px_60px_rgba(0,0,0,0.65)] relative overflow-hidden text-center">
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
                404 // LOST
              </span>
            </div>

            <p className="font-['Inter'] text-xs sm:text-sm text-slate-400 mt-3 sm:mt-4 text-center max-w-sm leading-relaxed text-pretty">
              The address you entered does not exist or has been moved.
            </p>
          </div>

          {/* Error Details Card */}
          <div className="space-y-6 pt-1 sm:pt-2">
            <div className="p-4 sm:p-5 rounded-xl bg-[#0a0e1a] border border-[#272e42] flex items-start gap-3.5 text-left shadow-sm">
              <div className="w-8 h-8 rounded-lg bg-[#f59e0b]/10 border border-[#f59e0b]/30 flex items-center justify-center shrink-0 text-[#ffc174] mt-0.5">
                <Compass className="w-4 h-4 text-[#f59e0b]" />
              </div>
              <div className="space-y-1">
                <p className="font-['Space_Grotesk'] text-sm font-bold text-slate-200 uppercase tracking-wide">
                  Route Not Found
                </p>
                <p className="font-['Inter'] text-xs sm:text-sm text-slate-400 leading-relaxed">
                  Head back to your live dispatch queue to monitor active requests and recoveries.
                </p>
              </div>
            </div>

            {/* Action CTA Button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleBackToQueue}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] py-3.5 sm:py-4.5 px-6 font-['Space_Grotesk'] text-xs sm:text-base font-black uppercase tracking-widest text-[#181105] shadow-[0_12px_28px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.35)] hover:shadow-[0_16px_36px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.45)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] transition-all duration-150 cursor-pointer border border-[#d97707]/60"
              >
                <ArrowLeft className="w-4 h-4" />
                BACK TO QUEUE
              </button>
            </div>
          </div>
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
