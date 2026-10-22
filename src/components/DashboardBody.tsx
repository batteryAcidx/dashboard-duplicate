import React, { useEffect, useRef, useState } from 'react';
import {
  Paperclip,
  Calendar,
  Image as ImageIcon,
  PhoneMissed,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { LeadStatusControl, LeadStatus, STATUS_LABEL } from './LeadStatusControl';
import { OverviewChart } from './OverviewChart';
import { ContactTypeControl } from './ContactTypeControl';
import { LeadDetailsCard } from './LeadDetailsCard';
import { UrgencyBadge } from './UrgencyBadge';
import { FILTER_LABEL, TYPE_LABEL, countByFilter, matchesFilter, showFilterBar, visibleFilters } from '../lib/leadView';
import type { ContactType, DetailRow, LeadFilter, Urgency } from '../lib/leadView';
import type { ChartData } from '../lib/chart';

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
  urgency?: Urgency;
  urgencyReason?: string;
  contactType?: ContactType;
  needsReview?: boolean;
  details?: DetailRow[];
  whyWithYou?: string;
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
  onBack?: () => void;
  onChangeStatus?: (id: string, status: LeadStatus, finalValue: number | null) => Promise<string | null>;
  onChangeType?: (id: string, type: ContactType) => Promise<string | null>;
  windowKey?: WindowKey;
  onWindowChange?: (w: WindowKey) => void;
  chart?: ChartData | null;
  threadFooter?: React.ReactNode;
}

const telHref = (p: string) => `tel:${p.replace(/[^\d+]/g, '')}`;
const mapsHref = (a: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(a)}`;

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
  onBack,
  onChangeStatus,
  onChangeType,
  windowKey,
  onWindowChange,
  chart,
  threadFooter,
}) => {
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'conversations'>('conversations');
  const [mobileView, setMobileView] = useState<'list' | 'chat'>(initialMobileView ?? 'list');
  const endRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<LeadFilter>('all');

  // keep the phone view in step with the address (browser Back, direct links)
  useEffect(() => {
    setMobileView(selectedLeadId ? 'chat' : 'list');
  }, [selectedLeadId]);

  const typeOf = (l: DashboardLead): ContactType => l.contactType ?? 'homeowner';
  const urgencyOf = (l: DashboardLead): Urgency => l.urgency ?? (l.priority ? 'urgent' : 'normal');
  const counts = countByFilter(leads.map(typeOf));
  const filterBarOn = showFilterBar(counts);
  // if the chosen tab empties out, quietly fall back to All
  const activeFilter: LeadFilter = filterBarOn && counts[filter] > 0 ? filter : 'all';
  const visibleLeads = leads.filter((l) => matchesFilter(typeOf(l), activeFilter));

  const selectedLead = leads.find((l) => l.id === selectedLeadId) || null;
  const unreadCount = leads.filter((l) => l.unread).length;
  const threadLength = selectedLead ? selectedLead.chatTranscript.length : 0;

  // on phones, open a conversation at the newest message
  useEffect(() => {
    if (!selectedLeadId || mobileView !== 'chat') return;
    if (typeof window === 'undefined' || !window.matchMedia('(max-width: 1023px)').matches) return;
    const t = setTimeout(() => endRef.current?.scrollIntoView({ block: 'end' }), 50);
    return () => clearTimeout(t);
  }, [selectedLeadId, mobileView, threadLength]);

  const handleSelectLead = (id: string) => {
    onSelectLead(id);
    setMobileView('chat');
  };

  const handleBackToQueue = () => {
    if (onBack) onBack();
    else setMobileView('list');
  };

  const inThreadOnPhone = dashboardTab === 'conversations' && mobileView === 'chat';
  const hasAddress = Boolean(selectedLead && selectedLead.address && selectedLead.address !== 'No address provided');

  return (
    <div className="max-w-5xl mx-auto w-full bg-[#0c101d]">
      <div className="p-4 pb-10 sm:p-7 lg:p-9 space-y-4 sm:space-y-6 lg:space-y-8 lg:min-h-[560px] flex flex-col justify-start">
        {/* Title row (optional, hidden on phones inside a conversation) */}
        {!hideTitleRow && (
          <div className={`items-center justify-between gap-4 pb-1 ${inThreadOnPhone ? 'hidden lg:flex' : 'flex'}`}>
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

        {/* Tabs (sticky on phones, hidden inside a conversation) */}
        <div
          className={`sticky top-0 z-30 -mx-4 px-4 py-2 sm:-mx-7 sm:px-7 bg-[#0c101d] lg:static lg:mx-0 lg:px-0 lg:py-0 ${
            inThreadOnPhone ? 'hidden lg:block' : 'block'
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
              className={`relative z-10 w-full py-2.5 rounded-lg text-sm font-['Space_Grotesk'] font-bold text-center transition-colors duration-200 ${
                dashboardTab === 'overview' ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setDashboardTab('conversations')}
              className={`relative z-10 w-full py-2.5 rounded-lg text-sm font-['Space_Grotesk'] font-bold text-center transition-colors duration-200 flex items-center justify-center gap-2 ${
                dashboardTab === 'conversations' ? 'text-slate-100' : 'text-[#e6af6c] hover:text-[#ffc174]'
              }`}
            >
              <span>Conversations</span>
              <span
                className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-['JetBrains_Mono'] transition-colors duration-200 whitespace-nowrap ${
                  dashboardTab === 'conversations' ? 'bg-[#212a3f] text-[#ffc174]' : 'bg-[#212a3f]/70 text-[#ffc174]'
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
            <div className="flex items-center justify-between gap-3 pb-3 text-slate-400 font-['JetBrains_Mono'] text-xs">
              <span className="text-slate-400">{statsWindowLabel}</span>
              {onWindowChange && windowKey && (
                <div role="group" aria-label="Time window" className="inline-flex p-0.5 rounded-lg bg-[#090d18] border border-[#232839]">
                  {(
                    [
                      ['24h', '24h'],
                      ['7d', '7d'],
                      ['30d', '30d'],
                    ] as [WindowKey, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={windowKey === key}
                      onClick={() => onWindowChange(key)}
                      className={`px-3.5 py-2 rounded-md font-['JetBrains_Mono'] text-xs font-semibold transition-colors cursor-pointer ${
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
                <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-widest text-[#d8c3ad] font-medium">
                  RESPONSE SPEED
                </span>
                <div className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-bold tracking-tight text-[#ffc174] tabular-nums mt-2 sm:mt-3 lg:mt-4">
                  {stats.responseSpeed}
                </div>
                <span className="font-['Inter'] text-xs sm:text-[11.5px] text-slate-400 block mt-1">Average response time.</span>
              </div>

              <div className="rounded-xl bg-[#0e1322] p-4 sm:p-5 border border-[#252939] flex flex-col justify-start">
                <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-widest text-[#d8c3ad] font-medium">
                  CALLS RESCUED
                </span>
                <div className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-bold tracking-tight text-[#dee1f7] tabular-nums mt-2 sm:mt-3 lg:mt-4">
                  {stats.callsRescued}
                </div>
                <span className="font-['Inter'] text-xs sm:text-[11.5px] text-slate-400 block mt-1">
                  <span className="sm:hidden">Missed calls captured.</span>
                  <span className="hidden sm:inline">Total missed calls captured.</span>
                </span>
              </div>

              <div className="rounded-xl bg-[#0e1322] p-4 sm:p-5 border border-[#252939] flex flex-col justify-start">
                <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-widest text-[#d8c3ad] font-medium">
                  PIPELINE VALUE
                </span>
                <div className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-bold tracking-tight text-[#ffc174] tabular-nums mt-2 sm:mt-3 lg:mt-4">
                  {stats.pipelineValue}
                </div>
                <span className="font-['Inter'] text-xs sm:text-[11.5px] text-slate-400 block mt-1">
                  Based on your typical job values.
                </span>
              </div>

              <div className="rounded-xl bg-[#0e1322] p-4 sm:p-5 border border-[#252939] flex flex-col justify-start">
                <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-widest text-[#d8c3ad] font-medium">
                  BOOKING RATE
                </span>
                <div className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-bold tracking-tight text-[#ffc174] tabular-nums mt-2 sm:mt-3 lg:mt-4">
                  {stats.bookingRate}
                </div>
                <span className="font-['Inter'] text-xs sm:text-[11.5px] text-slate-400 block mt-1">{stats.bookingDetail}</span>
              </div>
            </div>

            {chart && (
              <div className="mt-4 lg:mt-5">
                <OverviewChart chart={chart} />
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Conversations */}
        {dashboardTab === 'conversations' && (
          <div className="pt-1 flex-1 flex flex-col min-h-0">
            {leads.length === 0 ? (
              <div className="w-full min-h-[300px] flex flex-col items-center justify-center text-center p-8 rounded-xl border border-dashed border-[#232839] bg-[#0c101d]/60">
                <h4 className="font-['Space_Grotesk'] text-base font-bold text-slate-200 tracking-tight mb-1">
                  No missed calls yet
                </h4>
                <p className="text-sm lg:text-xs text-slate-400 max-w-xs font-['Inter'] leading-relaxed">
                  When someone misses you, they'll show up here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 min-h-0 lg:min-h-[420px] gap-6 lg:gap-8 flex-1">
                {/* Left column: leads */}
                <div className={`lg:col-span-5 space-y-3 lg:overflow-y-auto ${mobileView === 'chat' ? 'hidden lg:block' : 'block'}`}>
                  {filterBarOn && (
                    <div
                      role="tablist"
                      aria-label="Filter conversations"
                      className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none]"
                    >
                      {visibleFilters(counts).map((f) => (
                        <button
                          key={f}
                          type="button"
                          role="tab"
                          aria-selected={activeFilter === f}
                          onClick={() => setFilter(f)}
                          className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border font-['Space_Grotesk'] text-xs font-bold cursor-pointer transition-colors ${
                            activeFilter === f
                              ? 'bg-[#151b2b] border-[#f59e0b]/50 text-[#ffc174]'
                              : 'bg-[#0a0e19] border-[#232839] text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <span>{FILTER_LABEL[f]}</span>
                          <span className="font-['JetBrains_Mono'] text-[10px] text-slate-500">{counts[f]}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {visibleLeads.map((lead) => {
                    const isSelected = selectedLead !== null && lead.id === selectedLead.id;
                    return (
                      <div
                        key={lead.id}
                        onClick={() => handleSelectLead(lead.id)}
                        className={`group relative p-4 rounded-xl border transition-all cursor-pointer ${
                          isSelected
                            ? 'lg:bg-[#181e2e] lg:border-[#f59e0b]/50 lg:shadow-[0_4px_24px_rgba(245,158,11,0.08)] bg-[#111625] hover:bg-[#151b2c] border-[#22283a]'
                            : 'bg-[#111625] hover:bg-[#151b2c] border-[#22283a]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-2 min-w-0">
                                {lead.unread && (
                                  <span
                                    className="w-2.5 h-2.5 lg:w-2 lg:h-2 rounded-full bg-[#f59e0b] shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.6)]"
                                    title="Unread conversation"
                                  />
                                )}
                                <span className="font-['Space_Grotesk'] text-base lg:text-[15px] font-bold text-slate-100 tracking-tight truncate block">
                                  {lead.name}
                                </span>
                                <UrgencyBadge urgency={urgencyOf(lead)} />
                              </div>
                              <span className="text-[11px] lg:text-[10px] font-['JetBrains_Mono'] text-slate-500 shrink-0">
                                {lead.timeAgo}
                              </span>
                            </div>

                            <div className="text-[13px] lg:text-[12px] text-slate-400 font-['Inter'] mb-2.5">
                              <span className="truncate block max-w-full text-slate-400/90">{lead.address}</span>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] lg:text-[9.5px] font-medium text-slate-300 bg-[#171c2b] border border-[#272e42] px-2 py-0.5 rounded-full shrink-0">
                                {lead.conversationTag.icon === 'photos' ? (
                                  <Paperclip className="w-3 h-3 lg:w-2.5 lg:h-2.5 text-slate-400" />
                                ) : (
                                  <Calendar className="w-3 h-3 lg:w-2.5 lg:h-2.5 text-slate-400" />
                                )}
                                {lead.conversationTag.label}
                              </span>
                              {lead.secondaryTag && (
                                <span className="inline-flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] lg:text-[9px] font-medium text-slate-400 bg-[#141926] border border-[#242b3d] px-1.5 py-0.5 rounded-full shrink-0">
                                  <Paperclip className="w-3 h-3 lg:w-2 lg:h-2 text-slate-400" />
                                  {lead.secondaryTag.label}
                                </span>
                              )}
                              {typeOf(lead) !== 'homeowner' && (
                                <span
                                  className={`inline-flex items-center font-['JetBrains_Mono'] text-[11px] lg:text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0 border ${
                                    typeOf(lead) === 'unknown' || lead.needsReview
                                      ? 'text-[#ffc174] bg-[#261d10] border-[#f59e0b]/40'
                                      : 'text-slate-300 bg-[#141a29]/80 border-white/[0.09]'
                                  }`}
                                >
                                  {TYPE_LABEL[typeOf(lead)]}
                                  {lead.needsReview ? ' · review' : ''}
                                </span>
                              )}
                              {lead.status !== 'booked' && (
                                <span
                                  className={`inline-flex items-center font-['JetBrains_Mono'] text-[11px] lg:text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full shrink-0 border ${
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
                            <ChevronRight className="w-5 h-5 lg:w-4 lg:h-4 text-slate-500 group-hover:text-[#ffc174] group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right column: thread */}
                <div className={`lg:col-span-7 flex flex-col justify-start min-h-0 ${mobileView === 'list' ? 'hidden lg:flex' : 'flex'}`}>
                  {selectedLead ? (
                    <div className="w-full">
                      {/* phones: a slim sticky bar with Back and the name */}
                      <div className="lg:hidden sticky top-0 z-30 -mx-4 px-4 sm:-mx-7 sm:px-7 py-1 bg-[#0c101d]/95 backdrop-blur border-b border-[#1b2336] flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleBackToQueue}
                          aria-label="Back to queue"
                          className="inline-flex items-center gap-1 -ml-2 pl-1 pr-3 py-3 text-sm font-['Space_Grotesk'] font-bold text-slate-300 hover:text-[#ffc174] transition-colors cursor-pointer shrink-0"
                        >
                          <ChevronLeft className="w-5 h-5 text-[#ffc174]" />
                          <span>Back</span>
                        </button>
                        <span className="font-['Space_Grotesk'] text-base font-bold text-slate-100 tracking-tight truncate min-w-0">
                          {selectedLead.name}
                        </span>
                        <UrgencyBadge urgency={urgencyOf(selectedLead)} size="phone" />
                      </div>

                      <div className="pt-4 lg:pt-0 pb-4 mb-5 border-b border-[#252939]">
                        <div className="space-y-2 pt-0.5">
                          {/* desktop: name and tag */}
                          <div className="hidden lg:flex items-center gap-2.5 flex-wrap">
                            <h3 className="font-['Space_Grotesk'] text-xl font-bold text-slate-100 tracking-tight">
                              {selectedLead.name}
                            </h3>
                            <UrgencyBadge urgency={urgencyOf(selectedLead)} size="header" />
                          </div>

                          <div className="flex flex-wrap items-center text-sm lg:text-[13px] text-slate-300 font-['Inter'] leading-relaxed">
                            {selectedLead.phone ? (
                              <a
                                href={telHref(selectedLead.phone)}
                                className="inline-block py-1 font-['JetBrains_Mono'] text-slate-100 lg:text-slate-200 font-medium underline decoration-[#ffc174]/40 underline-offset-4 lg:no-underline"
                              >
                                {selectedLead.phone}
                              </a>
                            ) : (
                              <span className="text-slate-500">No phone</span>
                            )}
                            <span className="inline-block w-1 h-1 rounded-full bg-slate-500 mx-2 shrink-0" aria-hidden="true" />
                            <span className="text-slate-300 font-medium">{selectedLead.insurance}</span>
                            <span className="hidden sm:inline-block w-1 h-1 rounded-full bg-slate-500 mx-2 shrink-0" aria-hidden="true" />
                            {hasAddress ? (
                              <a
                                href={mapsHref(selectedLead.address)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block sm:inline w-full sm:w-auto py-1 sm:py-0 text-slate-300 lg:text-slate-400 underline decoration-[#ffc174]/40 underline-offset-4 lg:no-underline"
                              >
                                {selectedLead.address}
                              </a>
                            ) : (
                              <span className="text-slate-500 block sm:inline w-full sm:w-auto">{selectedLead.address}</span>
                            )}
                          </div>

                          <div className="flex flex-col items-start gap-2 pt-0.5 sm:flex-row sm:items-center sm:justify-between">
                            {selectedLead.scheduledTime ? (
                              <div className="text-sm lg:text-[13px] text-[#ffc174] font-medium font-['JetBrains_Mono']">
                                {selectedLead.scheduledTime}
                              </div>
                            ) : (
                              <span />
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              {onChangeType && (
                                <ContactTypeControl
                                  key={`type-${selectedLead.id}`}
                                  type={typeOf(selectedLead)}
                                  needsReview={Boolean(selectedLead.needsReview)}
                                  onChange={(t) => onChangeType(selectedLead.id, t)}
                                />
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
                      </div>

                      <LeadDetailsCard
                        rows={selectedLead.details ?? []}
                        why={selectedLead.whyWithYou}
                        urgency={urgencyOf(selectedLead)}
                        urgencyReason={selectedLead.urgencyReason}
                      />

                      {/* messages: page scroll on phones, a scroll box only on desktop */}
                      <div className="space-y-3 lg:space-y-3.5 lg:max-h-[380px] lg:overflow-y-auto lg:pr-2 pb-6 lg:pb-5">
                        {selectedLead.missedCallTime && (
                          <div className="flex items-center justify-center pt-0.5 pb-1">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0a0e19] border border-[#232a3f] text-xs font-['JetBrains_Mono'] text-slate-400">
                              <PhoneMissed className="w-3.5 h-3.5 text-slate-400" />
                              <span>Missed call · {selectedLead.missedCallTime}</span>
                            </div>
                          </div>
                        )}

                        {selectedLead.chatTranscript.length === 0 && (
                          <p className="text-center font-['JetBrains_Mono'] text-xs text-slate-500 py-6">Loading messages…</p>
                        )}

                        {selectedLead.chatTranscript.map((msg, index) => {
                          if (msg.kind === 'event') {
                            return (
                              <React.Fragment key={index}>
                                {msg.dayDivider && (
                                  <div className="flex items-center justify-center my-3">
                                    <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-slate-400 bg-[#0a0e19] border border-[#232a3f] px-3 py-0.5 rounded-full font-semibold">
                                      {msg.dayDivider}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-center justify-center py-0.5">
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-[#0a0e19] border border-[#232a3f] text-[11px] font-['JetBrains_Mono'] text-slate-500 text-center leading-snug">
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

                          const isWedge = msg.sender === 'wedge';
                          return (
                            <React.Fragment key={index}>
                              {msg.dayDivider && (
                                <div className="flex items-center justify-center my-3">
                                  <span className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-widest text-slate-400 bg-[#0a0e19] border border-[#232a3f] px-3 py-0.5 rounded-full font-semibold">
                                    {msg.dayDivider}
                                  </span>
                                </div>
                              )}
                              <div
                                className={`p-3.5 lg:p-4 leading-relaxed transition-all shadow-md ${
                                  isWedge
                                    ? 'rounded-2xl rounded-tl-sm bg-[#111625] text-[#dee1f7] border border-[#252939] max-w-[88%] lg:max-w-[92%]'
                                    : 'rounded-2xl rounded-tr-sm bg-[#ffc174]/[0.09] text-slate-100 ml-auto text-left border border-[#ffc174]/20 max-w-[88%] lg:max-w-[92%] shadow-sm'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-3 mb-1.5 pb-1 border-b border-[#252b3d]/40">
                                  <span
                                    className={`font-['JetBrains_Mono'] text-xs font-bold uppercase tracking-wider ${
                                      isWedge ? 'text-slate-400 font-medium' : 'text-[#ffc174] font-semibold'
                                    }`}
                                  >
                                    {isWedge ? companyName : selectedLead.name.split(' ')[0]}
                                  </span>
                                  <span className="font-['JetBrains_Mono'] text-[11px] text-slate-500">{msg.time}</span>
                                </div>

                                <p className="font-['Inter'] text-[15px] lg:text-[13.5px] leading-relaxed text-[#e2e8f0] break-words">
                                  {msg.text}
                                </p>

                                {msg.hasAttachment && selectedLead.attachments && selectedLead.attachments.length > 0 && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2.5 pt-2.5 border-t border-[#252b3d]/40">
                                    {selectedLead.attachments.map((att, i) => (
                                      <div
                                        key={i}
                                        className="flex items-center gap-2 p-2 rounded-lg bg-[#090d18] border border-[#262c3e] hover:border-[#f59e0b]/40 transition-colors select-none"
                                      >
                                        <div className="w-7 h-7 lg:w-6 lg:h-6 rounded-md bg-[#192236] border border-[#2b354d] flex items-center justify-center text-white shrink-0">
                                          <ImageIcon className="w-3.5 h-3.5 lg:w-3 lg:h-3 text-white" />
                                        </div>
                                        <div className="min-w-0 flex-1 font-['JetBrains_Mono'] text-[11px] lg:text-[10px] leading-tight">
                                          <span className="block text-slate-200 font-medium truncate">{att.name}</span>
                                          <span className="text-slate-500 text-[10px] lg:text-[9px]">{att.size}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </React.Fragment>
                          );
                        })}
                        <div ref={endRef} className="scroll-mb-24" />
                      </div>

                      {threadFooter && (
                        <div className="sticky bottom-0 z-20 -mx-4 px-4 sm:-mx-7 sm:px-7 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-[#0c101d]/95 backdrop-blur border-t border-[#1b2336] lg:static lg:mx-0 lg:px-0 lg:pb-0 lg:pt-4 lg:bg-transparent lg:backdrop-blur-none">
                          {threadFooter}
                        </div>
                      )}
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