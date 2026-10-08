import React, { useEffect, useState } from 'react';
import {
  Paperclip,
  Calendar,
  Image as ImageIcon,
  PhoneMissed,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { LeadStatusControl, LeadStatus, STATUS_LABEL } from './LeadStatusControl';

export type WindowKey = '24h' | '7d' | '30d';

export interface DashboardLead {
  id: string;
  name: string;
  phone: string;
  address: string;
  timeAgo: string;
  priority: boolean;
  unread: boolean;
  status: LeadStatus;
  finalValue: number | null;
  statusChangedBy: 'system' | 'owner' | 'support';
  statusChangedLabel: string;
  missedCallTime?: string;
  conversationTag: { icon: 'photos' | 'calendar'; label: string };
  secondaryTag?: { icon: 'photos' | 'calendar'; label: string };
  attachments?: { name: string; size: string }[];
  insurance: string;
  scheduledTime: string;
  chatTranscript: {
    sender: 'wedge' | 'homeowner';
    text: string;
    time: string;
    hasAttachment?: boolean;
    dayDivider?: string;
    kind?: 'message' | 'event';
    eventActor?: 'system' | 'owner' | 'support';
  }[];
}

export interface DashboardStats {
  responseSpeed: string;
  callsRescued: string;
  pipelineValue: string;
  bookingRate: string;
  bookingDetail: string;
}

interface DashboardBodyProps {
  companyName: string;
  statusLabel?: string;
  statusLabelShort?: string;
  hideTitleRow?: boolean;
  initialMobileView?: 'list' | 'chat';
  stats: DashboardStats;
  statsWindowLabel?: string;
  leads: DashboardLead[];
  selectedLeadId: string | null;
  onSelectLead: (id: string) => void;
  onBack?: () => void; // FIX 3
  onChangeStatus?: (id: string, status: LeadStatus, finalValue: number | null) => Promise<string | null>;
  windowKey?: WindowKey;
  onWindowChange?: (w: WindowKey) => void;
}

export const DashboardBody: React.FC<DashboardBodyProps> = ({
  companyName,
  statusLabel = '',
  statusLabelShort,
  hideTitleRow = false,
  initialMobileView,
  stats,
  statsWindowLabel = 'Last 24 hours',
  leads,
  selectedLeadId,
  onSelectLead,
  onBack, // FIX 3
  onChangeStatus,
  windowKey,
  onWindowChange,
}) => {
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'conversations'>('conversations');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(initialMobileView ?? 'list');

  // FIX 3: keep the phone view in step with the address (browser Back, direct links)
  useEffect(() => {
    setMobileView(selectedLeadId ? 'chat' : 'list');
  }, [selectedLeadId]);

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;
  const unreadCount = leads.filter((l) => l.unread).length;

  const handleSelectLead = (id: string) => {
    onSelectLead(id);
    setMobileView('chat');
  };

  // FIX 3: the in-app Back button also updates the address
  const handleBackToQueue = () => {
    if (onBack) onBack();
    else setMobileView('list');
  };

  return (
    <div className="max-w-5xl mx-auto w-full bg-[#0c101d]">
      <div className="p-5 sm:p-7 lg:p-9 space-y-5 sm:space-y-6 lg:space-y-8 h-[560px] sm:h-[550px] lg:h-auto lg:min-h-[560px] flex flex-col justify-start overflow-hidden">
        {/* Title row (optional, hidden on mobile inside a conversation) */}
        {!hideTitleRow && (
          <div
            className={`items-center justify-between gap-4 pb-1 ${
              dashboardTab === 'conversations' && mobileView === 'chat' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            <div>
              <h3 className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-black uppercase text-slate-100 tracking-tight leading-none">
                Dashboard
              </h3>
              <span className="font-['JetBrains_Mono'] text-[11px] sm:text-xs text-slate-400 font-medium tracking-wide mt-1 block">
                {companyName}
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 font-['JetBrains_Mono'] text-[10px] sm:text-[11px] lg:text-xs uppercase tracking-wider text-slate-400 font-semibold shrink-0">
              <span className="h-1.5 w-1.5 rounded-full bg-[#ffc174] animate-pulse shrink-0" />
              <span className="sm:hidden">{statusLabelShort ?? statusLabel}</span>
              <span className="hidden sm:inline">{statusLabel}</span>
            </div>
          </div>
        )}

        {/* Tabs row (hidden on mobile inside a conversation) */}
        <div
          className={`w-full ${
            dashboardTab === 'conversations' && mobileView === 'chat' ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="relative grid grid-cols-2 w-full p-1 rounded-xl bg-[#090d18] border border-[#232839]">
            <div
              className={`absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-lg bg-[#151b2b] border border-[#2b354d] shadow-sm transition-transform duration-300 ease-out pointer-events-none ${
                dashboardTab === 'overview' ? 'translate-x-0' : 'translate-x-full'
              }`}
            />

            <button
              type="button"
              onClick={() => setDashboardTab('overview')}
              className={`relative z-10 w-full py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-['Space_Grotesk'] font-bold text-center transition-colors duration-200 ${
                dashboardTab === 'overview' ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setDashboardTab('conversations')}
              className={`relative z-10 w-full py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-['Space_Grotesk'] font-bold text-center transition-colors duration-200 flex items-center justify-center gap-1.5 sm:gap-2 ${
                dashboardTab === 'conversations' ? 'text-slate-100' : 'text-[#e6af6c] hover:text-[#ffc174]'
              }`}
            >
              <span>Conversations</span>
              <span
                className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] sm:text-[10.5px] font-['JetBrains_Mono'] transition-colors duration-200 whitespace-nowrap ${
                  dashboardTab === 'conversations'
                    ? 'bg-[#212a3f] text-[#ffc174]'
                    : 'bg-[#212a3f]/70 text-[#ffc174]'
                }`}
              >
                {unreadCount > 0 ? (
                  unreadCount
                ) : (
                  <>
                    <span className="sm:hidden">0</span>
                    <span className="hidden sm:inline">all caught up</span>
                  </>
                )}
              </span>
            </button>
          </div>
        </div>

        {/* TAB 1: Overview */}
        {dashboardTab === 'overview' && (
          <div className="flex-1 flex flex-col justify-start">
                        <div className="flex items-center justify-between gap-3 pb-2 text-slate-400 font-['JetBrains_Mono'] text-[10.5px] sm:text-xs">
              <span className="text-slate-400 hidden sm:inline">{statsWindowLabel}</span>
              {onWindowChange && windowKey && (
                <div
                  role="group"
                  aria-label="Time window"
                  className="inline-flex p-0.5 rounded-lg bg-[#090d18] border border-[#232839] w-full sm:w-auto"
                >
                  {(
                    [
                      ['24h', '24 hours'],
                      ['7d', '7 days'],
                      ['30d', '30 days'],
                    ] as [WindowKey, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={windowKey === key}
                      onClick={() => onWindowChange(key)}
                      className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md font-['JetBrains_Mono'] text-[10.5px] sm:text-xs font-semibold transition-colors cursor-pointer ${
                        windowKey === key
                          ? 'bg-[#151b2b] border border-[#2b354d] text-[#ffc174]'
                          : 'text-slate-400 hover:text-slate-200 border border-transparent'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5 py-1">
              <div className="rounded-xl bg-[#0e1322] p-4 sm:p-5 border border-[#252939] flex flex-col justify-start">
                <span className="font-['JetBrains_Mono'] text-[10px] sm:text-[11px] uppercase tracking-widest text-[#d8c3ad] font-medium">
                  RESPONSE SPEED
                </span>
                <div className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-bold tracking-tight text-[#ffc174] tabular-nums mt-2 sm:mt-3 lg:mt-4">
                  {stats.responseSpeed}
                </div>
                <span className="font-['Inter'] text-[11px] sm:text-[11.5px] text-slate-400 block mt-1">
                  Average response time.
                </span>
              </div>

              <div className="rounded-xl bg-[#0e1322] p-4 sm:p-5 border border-[#252939] flex flex-col justify-start">
                <span className="font-['JetBrains_Mono'] text-[10px] sm:text-[11px] uppercase tracking-widest text-[#d8c3ad] font-medium">
                  CALLS RESCUED
                </span>
                <div className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-bold tracking-tight text-[#dee1f7] tabular-nums mt-2 sm:mt-3 lg:mt-4">
                  {stats.callsRescued}
                </div>
                <span className="font-['Inter'] text-[11px] sm:text-[11.5px] text-slate-400 block mt-1">
                  <span className="sm:hidden">Missed calls captured.</span>
                  <span className="hidden sm:inline">Total missed calls captured.</span>
                </span>
              </div>

              <div className="rounded-xl bg-[#0e1322] p-4 sm:p-5 border border-[#252939] flex flex-col justify-start">
                <span className="font-['JetBrains_Mono'] text-[10px] sm:text-[11px] uppercase tracking-widest text-[#d8c3ad] font-medium">
                  PIPELINE VALUE
                </span>
                <div className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-bold tracking-tight text-[#ffc174] tabular-nums mt-2 sm:mt-3 lg:mt-4">
                  {stats.pipelineValue}
                </div>
                <span className="font-['Inter'] text-[11px] sm:text-[11.5px] text-slate-400 block mt-1">
                  Based on your typical job values.
                </span>
              </div>

              <div className="rounded-xl bg-[#0e1322] p-4 sm:p-5 border border-[#252939] flex flex-col justify-start">
                <span className="font-['JetBrains_Mono'] text-[10px] sm:text-[11px] uppercase tracking-widest text-[#d8c3ad] font-medium">
                  BOOKING RATE
                </span>
                <div className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-bold tracking-tight text-[#ffc174] tabular-nums mt-2 sm:mt-3 lg:mt-4">
                  {stats.bookingRate}
                </div>
                <span className="font-['Inter'] text-[11px] sm:text-[11.5px] text-slate-400 block mt-1">
                  {stats.bookingDetail}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Conversations */}
        {dashboardTab === 'conversations' && (
          <div className="pt-1 flex-1 flex flex-col min-h-0">
            {leads.length === 0 ? (
              <div className="w-full h-full min-h-[360px] flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-[#232839] bg-[#0c101d]/60">
                <h4 className="font-['Space_Grotesk'] text-base font-bold text-slate-200 tracking-tight mb-1">
                  No missed calls yet
                </h4>
                <p className="text-xs text-slate-400 max-w-xs font-['Inter'] leading-relaxed">
                  When someone misses you, they'll show up here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 min-h-0 lg:min-h-[420px] gap-6 lg:gap-8 flex-1">
                {/* Left column: leads */}
                <div
                  className={`lg:col-span-5 space-y-3 overflow-y-auto ${
                    mobileView === 'chat' ? 'hidden lg:block' : 'block'
                  }`}
                >
                  {leads.map((lead) => {
                    const isSelected = selectedLead !== null && lead.id === selectedLead.id;
                    const isUnread = lead.unread;
                    return (
                      <div
                        key={lead.id}
                        onClick={() => handleSelectLead(lead.id)}
                        className={`group relative p-3.5 sm:p-4 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'lg:bg-[#181e2e] lg:border-[#f59e0b]/50 lg:shadow-[0_4px_24px_rgba(245,158,11,0.08)] bg-[#111625] hover:bg-[#151b2c] border-[#22283a]'
                            : 'bg-[#111625] hover:bg-[#151b2c] border-[#22283a]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                {isUnread && (
                                  <span
                                    className="w-2 h-2 rounded-full bg-[#f59e0b] shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                                    title="Unread conversation"
                                  />
                                )}
                                <span className="font-['Space_Grotesk'] text-sm sm:text-[15px] font-bold text-slate-100 tracking-tight truncate block">
                                  {lead.name}
                                </span>
                                {lead.priority && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#141a29]/80 border border-white/[0.09] text-[8.5px] sm:text-[9px] font-['JetBrains_Mono'] uppercase tracking-wider text-[#ffc174] font-semibold shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
                                    PRIORITY
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] font-['JetBrains_Mono'] text-slate-500 shrink-0">
                                {lead.timeAgo}
                              </span>
                            </div>

                            <div className="text-[11px] sm:text-[12px] text-slate-400 font-['Inter'] mb-2.5">
                              <span className="truncate block max-w-full text-slate-400/90">{lead.address}</span>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 font-['JetBrains_Mono'] text-[9.5px] font-medium text-slate-300 bg-[#171c2b] border border-[#272e42] px-2 py-0.5 rounded-full shrink-0">
                                {lead.conversationTag.icon === 'photos' ? (
                                  <Paperclip className="w-2.5 h-2.5 text-slate-400" />
                                ) : (
                                  <Calendar className="w-2.5 h-2.5 text-slate-400" />
                                )}
                                {lead.conversationTag.label}
                              </span>
                              {lead.secondaryTag && (
                                <span className="inline-flex items-center gap-1 font-['JetBrains_Mono'] text-[9px] font-medium text-slate-400 bg-[#141926] border border-[#242b3d] px-1.5 py-0.5 rounded-full shrink-0">
                                  <Paperclip className="w-2 h-2 text-slate-400" />
                                  {lead.secondaryTag.label}
                                </span>
                              )}
                                {lead.status !== 'booked' && (
                                <span
                                  className={`inline-flex items-center font-['JetBrains_Mono'] text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0 border ${
                                    lead.status === 'won'
                                      ? 'text-[#ffc174] bg-[#ffc174]/10 border-[#ffc174]/30'
                                      : 'text-slate-300 bg-[#141a29]/80 border-white/[0.09]'
                                  }`}
                                >
                                  {STATUS_LABEL[lead.status]}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 pl-1.5 flex items-center justify-center text-slate-500 group-hover:text-[#ffc174] transition-colors">
                            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-[#ffc174] group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right column: thread */}
                <div
                  className={`lg:col-span-7 flex flex-col justify-start min-h-0 ${
                    mobileView === 'list' ? 'hidden lg:flex' : 'flex'
                  }`}
                >
                  {selectedLead ? (
                    <div className="w-full">
                      <div className="pb-4 mb-5 border-b border-[#252939] space-y-2.5">
                        <div className="lg:hidden">
                          <button
                            type="button"
                            onClick={handleBackToQueue}
                            className="inline-flex items-center gap-1.5 text-xs sm:text-[13px] font-['Space_Grotesk'] font-bold text-slate-300 hover:text-[#ffc174] transition-colors py-0.5 cursor-pointer"
                            aria-label="Back to queue"
                          >
                            <ChevronLeft className="w-4 h-4 text-[#ffc174]" />
                            <span>Back</span>
                          </button>
                        </div>

                        <div className="space-y-1.5 pt-0.5">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h3 className="font-['Space_Grotesk'] text-lg sm:text-xl font-bold text-slate-100 tracking-tight">
                              {selectedLead.name}
                            </h3>
                            {selectedLead.priority && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#141a29]/80 border border-white/[0.09] text-[9.5px] sm:text-[10px] font-['JetBrains_Mono'] uppercase tracking-wider text-[#ffc174] font-semibold shrink-0 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]">
                                HIGH PRIORITY
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center text-xs sm:text-[13px] text-slate-300 font-['Inter'] leading-relaxed">
                            <span className="font-['JetBrains_Mono'] text-slate-200 font-medium">{selectedLead.phone}</span>
                            <span className="inline-block w-1 h-1 rounded-full bg-slate-500 mx-2 shrink-0" aria-hidden="true" />
                            <span className="text-slate-300 font-medium">{selectedLead.insurance}</span>
                            <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-500 mx-2 shrink-0" aria-hidden="true" />
                            <span className="text-slate-400 block sm:inline w-full sm:w-auto mt-0.5 sm:mt-0">{selectedLead.address}</span>
                          </div>

                                                    <div className="flex flex-col items-start gap-2 pt-0.5 sm:flex-row sm:items-center sm:justify-between">
                            {selectedLead.scheduledTime ? (
                              <div className="text-xs sm:text-[13px] text-[#ffc174] font-medium font-['JetBrains_Mono']">
                                {selectedLead.scheduledTime}
                              </div>
                            ) : (
                              <span />
                            )}
                            {onChangeStatus && (
                              <LeadStatusControl
                                key={selectedLead.id}
                                status={selectedLead.status}
                                finalValue={selectedLead.finalValue}
                                changedBy={selectedLead.statusChangedBy}
                                changedAtLabel={selectedLead.statusChangedLabel}
                                onChange={(s, v) => onChangeStatus(selectedLead.id, s, v)}
                              />
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2.5 sm:space-y-3.5 max-h-[335px] sm:max-h-[350px] lg:max-h-[380px] overflow-y-auto pr-1 sm:pr-2 pb-3 sm:pb-4 lg:pb-5">
                        {selectedLead.missedCallTime && (
                          <div className="flex items-center justify-center pt-0.5 pb-1">
                            <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 py-0.5 sm:py-1 rounded-full bg-[#0a0e19] border border-[#232a3f] text-[11px] sm:text-xs font-['JetBrains_Mono'] text-slate-400">
                              <PhoneMissed className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400" />
                              <span>Missed call · {selectedLead.missedCallTime}</span>
                            </div>
                          </div>
                        )}

                        {selectedLead.chatTranscript.length === 0 && (
                          <p className="text-center font-['JetBrains_Mono'] text-xs text-slate-500 py-6">
                            Loading messages…
                          </p>
                        )}

                        {selectedLead.chatTranscript.map((msg, index) => {
                          const isWedge = msg.sender === 'wedge';
                                                    if (msg.kind === 'event') {
                            return (
                              <React.Fragment key={index}>
                                {msg.dayDivider && (
                                  <div className="flex items-center justify-center my-3">
                                    <span className="font-['JetBrains_Mono'] text-[9.5px] sm:text-[10px] uppercase tracking-widest text-slate-400 bg-[#0a0e19] border border-[#232a3f] px-3 py-0.5 rounded-full font-semibold">
                                      {msg.dayDivider}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-center justify-center py-0.5">
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#0a0e19] border border-[#232a3f] text-[10.5px] sm:text-[11px] font-['JetBrains_Mono'] text-slate-500 text-center leading-snug">
                                    <span
                                      className={`h-1 w-1 rounded-full shrink-0 ${
                                        msg.eventActor === 'system' ? 'bg-slate-500' : 'bg-[#ffc174]'
                                      }`}
                                    />
                                    <span>
                                      {msg.text}
                                      {msg.eventActor === 'system' ? ' · automatic' : ''} · {msg.time}
                                    </span>
                                  </span>
                                </div>
                              </React.Fragment>
                            );
                          }
                          return (
                            <React.Fragment key={index}>
                              {msg.dayDivider && (
                                <div className="flex items-center justify-center my-3">
                                  <span className="font-['JetBrains_Mono'] text-[9.5px] sm:text-[10px] uppercase tracking-widest text-slate-400 bg-[#0a0e19] border border-[#232a3f] px-3 py-0.5 rounded-full font-semibold">
                                    {msg.dayDivider}
                                  </span>
                                </div>
                              )}
                              <div
                                className={`p-3 sm:p-4 text-xs sm:text-[13.5px] leading-relaxed transition-all shadow-md ${
                                  isWedge
                                    ? 'rounded-2xl rounded-tl-sm bg-[#111625] text-[#dee1f7] border border-[#252939] max-w-[95%] sm:max-w-[92%]'
                                    : 'rounded-2xl rounded-tr-sm bg-[#ffc174]/[0.09] text-slate-100 ml-auto text-left border border-[#ffc174]/20 max-w-[95%] sm:max-w-[92%] shadow-sm'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2 sm:gap-3 mb-1 sm:mb-1.5 pb-1 border-b border-[#252b3d]/40">
                                  <span
                                    className={`font-['JetBrains_Mono'] text-[11px] sm:text-xs font-bold uppercase tracking-wider ${
                                      isWedge ? 'text-slate-400 font-medium' : 'text-[#ffc174] font-semibold'
                                    }`}
                                  >
                                    {isWedge ? companyName : selectedLead.name.split(' ')[0]}
                                  </span>
                                  <span className="font-['JetBrains_Mono'] text-[10px] sm:text-[11px] text-slate-500">
                                    {msg.time}
                                  </span>
                                </div>

                                <p className="font-['Inter'] text-xs sm:text-[13.5px] leading-relaxed text-[#e2e8f0] break-words">
                                  {msg.text}
                                </p>

                                {msg.hasAttachment && selectedLead.attachments && selectedLead.attachments.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5 pt-2.5 border-t border-[#252b3d]/40">
                                    {selectedLead.attachments.map((att, i) => (
                                      <div
                                        key={i}
                                        className="flex items-center gap-2 p-2 rounded-lg bg-[#090d18] border border-[#262c3e] hover:border-[#f59e0b]/40 transition-colors select-none"
                                      >
                                        <div className="w-6 h-6 rounded-md bg-[#192236] border border-[#2b354d] flex items-center justify-center text-white shrink-0">
                                          <ImageIcon className="w-3 h-3 text-white" />
                                        </div>
                                        <div className="min-w-0 flex-1 font-['JetBrains_Mono'] text-[10px] leading-tight">
                                          <span className="block text-slate-200 font-medium truncate">{att.name}</span>
                                          <span className="text-slate-500 text-[9px]">{att.size}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full min-h-[360px] flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-[#232839] bg-[#0c101d]/60">
                      <div className="w-10 h-10 rounded-full bg-[#151b2c] border border-[#2a3248] flex items-center justify-center mb-3">
                        <ChevronRight className="w-5 h-5 text-[#ffc174]" />
                      </div>
                      <h4 className="font-['Space_Grotesk'] text-base font-bold text-slate-200 tracking-tight mb-1">
                        Select a lead to read the conversation
                      </h4>
                      <p className="text-xs text-slate-400 max-w-xs font-['Inter'] leading-relaxed">
                        Click any missed call on the left to see the full text thread and photos.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};