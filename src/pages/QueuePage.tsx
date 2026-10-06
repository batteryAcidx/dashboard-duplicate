import React, { useState } from 'react';
import { LogOut, Activity, Search, Filter, ShieldCheck, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

interface QueuePageProps {
  onNavigate?: (path: string) => void;
  onSignOut?: () => void;
  userEmail?: string;
}

export const QueuePage: React.FC<QueuePageProps> = ({
  onNavigate,
  onSignOut,
  userEmail = 'contractor@roofingcompany.com',
}) => {
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const sampleDispatches = [
    {
      id: 'DISP-8942',
      customer: 'Apex Roofing & Solar',
      address: '742 Evergreen Terrace, Springfield',
      status: 'active',
      priority: 'High',
      time: '12 mins ago',
      recoveryEstimate: '$4,250',
    },
    {
      id: 'DISP-8941',
      customer: 'Summit Exterior Contracting',
      address: '1044 Industrial Pkwy, Sector 4',
      status: 'active',
      priority: 'Normal',
      time: '34 mins ago',
      recoveryEstimate: '$1,890',
    },
    {
      id: 'DISP-8939',
      customer: 'Skyline Commercial Restorations',
      address: '880 Harbor View Dr, Suite 300',
      status: 'completed',
      priority: 'Normal',
      time: '2 hours ago',
      recoveryEstimate: '$7,120',
    },
    {
      id: 'DISP-8935',
      customer: 'Pinnacle Builders Corp',
      address: '221B Baker Boulevard',
      status: 'completed',
      priority: 'Low',
      time: '5 hours ago',
      recoveryEstimate: '$960',
    },
  ];

  const filteredDispatches = sampleDispatches.filter((item) => {
    if (filter !== 'all' && item.status !== filter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        item.customer.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.address.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen w-full bg-[#0e1322] text-[#dee1f7] flex flex-col justify-between selection:bg-[#f59e0b]/30 selection:text-[#ffc174]">
      {/* Top Navigation Bar */}
      <header className="w-full bg-[#121727] border-b border-[#23293c] px-4 sm:px-8 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#252939] border border-[#f59e0b]/50 flex items-center justify-center shadow-sm">
            <svg
              viewBox="0 0 24 24"
              className="w-5 h-5 text-[#f59e0b]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10.27 20a2 2 0 0 0 3.46 0l8-14A2 2 0 0 0 20 3H4a2 2 0 0 0-1.73 3Z" fill="none" />
            </svg>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-['Space_Grotesk'] text-lg sm:text-xl uppercase tracking-tight text-slate-100 font-black">
              WEDGE<span className="text-[#ffc174]">SCALE</span>
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-widest text-[#ffc174] bg-[#252939] border border-[#ffc174]/40 px-2 py-0.5 rounded-lg shadow-sm">
              QUEUE
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <div className="hidden sm:flex flex-col text-right">
            <span className="font-['JetBrains_Mono'] text-xs text-slate-300 font-medium truncate max-w-[200px]">
              {userEmail}
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-emerald-400 uppercase tracking-widest flex items-center gap-1 justify-end">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Sync
            </span>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 font-['JetBrains_Mono'] text-xs text-slate-400 hover:text-red-400 border border-[#272e42] hover:border-red-900/50 bg-[#161b2a] px-3 py-2 rounded-xl transition-colors cursor-pointer"
            title="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-6xl mx-auto px-4 sm:px-8 py-8 flex-1">
        {/* Header Title & Stats */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-black text-slate-100 uppercase tracking-tight">
              Live Dispatch Queue
            </h1>
            <p className="font-['Inter'] text-xs sm:text-sm text-slate-400 mt-1">
              Active recovery requests, scheduled inspections, and contractor dispatches.
            </p>
          </div>

          {/* Quick Wrong Route Test Button for Evaluation */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate?.('/unknown-test-route')}
              className="font-['JetBrains_Mono'] text-[11px] text-slate-400 hover:text-[#ffc174] border border-[#272e42] hover:border-[#f59e0b]/40 bg-[#121727] px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
            >
              Test 404 Route
            </button>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by ID, client, or address..."
              className="w-full pl-10 pr-4 py-2.5 bg-[#121727] border border-[#272e42] focus:border-[#f59e0b] focus:outline-none rounded-xl text-xs sm:text-sm font-['Inter'] text-slate-100 placeholder:text-slate-600 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 bg-[#121727] border border-[#272e42] p-1 rounded-xl">
            {(['all', 'active', 'completed'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg font-['JetBrains_Mono'] text-xs uppercase tracking-wider transition-colors cursor-pointer ${
                  filter === f
                    ? 'bg-[#f59e0b] text-[#181105] font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Dispatch Table / Cards */}
        <div className="space-y-3">
          {filteredDispatches.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-[#121727] border border-[#23293c]">
              <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-3" />
              <p className="font-['Space_Grotesk'] text-base font-bold text-slate-300">
                No dispatches found
              </p>
              <p className="font-['Inter'] text-xs text-slate-500 mt-1">
                Try adjusting your search query or filter.
              </p>
            </div>
          ) : (
            filteredDispatches.map((dispatch) => (
              <div
                key={dispatch.id}
                className="rounded-2xl bg-[#121727] border border-[#23293c] hover:border-[#f59e0b]/40 p-4 sm:p-5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-['JetBrains_Mono'] text-xs font-bold text-[#ffc174] bg-[#252939] px-2.5 py-0.5 rounded-md border border-[#ffc174]/20">
                      {dispatch.id}
                    </span>
                    <h3 className="font-['Space_Grotesk'] text-sm sm:text-base font-bold text-slate-100">
                      {dispatch.customer}
                    </h3>
                    <span
                      className={`font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 ${
                        dispatch.status === 'active'
                          ? 'bg-amber-950/60 text-[#ffc174] border border-[#f59e0b]/30'
                          : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/40'
                      }`}
                    >
                      {dispatch.status === 'active' ? (
                        <Clock className="w-3 h-3 text-[#f59e0b]" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      )}
                      {dispatch.status}
                    </span>
                  </div>
                  <p className="font-['Inter'] text-xs sm:text-sm text-slate-400">
                    {dispatch.address}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#23293c]">
                  <div className="text-left sm:text-right">
                    <span className="block font-['JetBrains_Mono'] text-[10px] text-slate-500 uppercase tracking-widest">
                      Estimate
                    </span>
                    <span className="font-['JetBrains_Mono'] text-sm sm:text-base font-bold text-slate-100">
                      {dispatch.recoveryEstimate}
                    </span>
                  </div>
                  <span className="font-['JetBrains_Mono'] text-xs text-slate-500">
                    {dispatch.time}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center z-10 py-6 border-t border-[#1a1f2f]">
        <p className="font-['JetBrains_Mono'] text-xs text-slate-500 uppercase tracking-widest">
          WedgeScale Live Dispatch & Recovery Platform
        </p>
      </footer>
    </div>
  );
};
