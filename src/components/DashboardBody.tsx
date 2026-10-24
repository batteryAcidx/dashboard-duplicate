import React, { useEffect, useRef, useState } from 'react';
import { Calendar, CalendarCheck, ChevronLeft, ChevronRight, Image as ImageIcon, MapPin, Paperclip, Phone, PhoneMissed } from 'lucide-react';
import { LeadStatusControl, LeadStatus, STATUS_LABEL } from './LeadStatusControl';
import { OverviewChart } from './OverviewChart';
import { ContactTypeControl } from './ContactTypeControl';
import { LeadDetailsCard } from './LeadDetailsCard';
import { UrgencyBadge } from './UrgencyBadge';
import { ConversationHeader } from './ConversationHeader';
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

  const StatCard: React.FC<{ label: string; value: string; note: string; gold?: boolean }> = ({ label, value, note, gold }) => (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0f1424] p-5 sm:p-6">
      <span className="text-sm font-medium text-slate-400">{label}</span>
      <div className={`mt-3 font-display text-3xl font-bold tracking-tight tabular-nums sm:text-[34px] ${gold ? 'text-[#ffc174]' : 'text-slate-100'}`}>
        {value}
      </div>
      <span className="mt-1.5 block text-[13px] leading-snug text-slate-500">{note}</span>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-5xl bg-[#0c101d]">
      <div className="flex flex-col justify-start space-y-6 p-5 pb-5 sm:space-y-8 sm:p-8 sm:pb-8 lg:min-h-[600px] lg:p-10">
        {!hideTitleRow && (
          <div className={`items-center justify-between gap-4 ${inThreadOnPhone ? 'hidden lg:flex' : 'flex'}`}>
            <div>
              <h3 className="font-display text-2xl font-extrabold tracking-tight text-slate-100 sm:text-3xl">Dashboard</h3>
              <span className="mt-1 block text-sm text-slate-400">{companyName}</span>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-sm text-slate-400">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#ffc174]" />
              <span className="sm:hidden">{statusLabelShort ?? statusLabel}</span>
              <span className="hidden sm:inline">{statusLabel}</span>
            </div>
          </div>
        )}

        {/* Tabs (sticky on phones, hidden inside a conversation) */}
        <div
          className={`sticky top-0 z-30 -mx-5 bg-[#0c101d] px-5 py-2 sm:-mx-8 sm:px-8 lg:static lg:mx-0 lg:px-0 lg:py-0 ${
            inThreadOnPhone ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="relative grid w-full grid-cols-2 rounded-2xl border border-white/[0.07] bg-[#090d18] p-1.5">
            <div
              className={`pointer-events-none absolute bottom-1.5 left-1.5 top-1.5 w-[calc(50%-6px)] rounded-xl border border-white/[0.08] bg-[#161d30] transition-transform duration-300 ease-out ${
                dashboardTab === 'overview' ? 'translate-x-0' : 'translate-x-full'
              }`}
            />
            <button
              type="button"
              onClick={() => setDashboardTab('overview')}
              className={`relative z-10 w-full cursor-pointer rounded-xl py-3 text-center font-display text-[15px] font-bold transition-colors duration-200 ${
                dashboardTab === 'overview' ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setDashboardTab('conversations')}
              className={`relative z-10 flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl py-3 text-center font-display text-[15px] font-bold transition-colors duration-200 ${
                dashboardTab === 'conversations' ? 'text-slate-100' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>Conversations</span>
              {unreadCount > 0 && (
                <span className="inline-flex min-w-[22px] items-center justify-center rounded-full bg-[#f59e0b] px-1.5 py-0.5 text-xs font-bold text-[#150f05]">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Overview */}
        {dashboardTab === 'overview' && (
          <div className="flex flex-1 flex-col justify-start">
            <div className="flex items-center justify-between gap-3 pb-5">
              <span className="text-[15px] font-semibold text-slate-200">{statsWindowLabel}</span>
              {onWindowChange && windowKey && (
                <div role="group" aria-label="Time window" className="inline-flex rounded-xl border border-white/[0.07] bg-[#090d18] p-1">
                  {(
                    [
                      ['24h', '24h'],
                      ['7d', '7 days'],
                      ['30d', '30 days'],
                    ] as [WindowKey, string][]
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={windowKey === key}
                      onClick={() => onWindowChange(key)}
                      className={`cursor-pointer rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                        windowKey === key ? 'bg-[#161d30] text-[#ffc174]' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5">
              <StatCard label="Response speed" value={stats.responseSpeed} note="Average time to reply" gold />
              <StatCard label="Calls rescued" value={stats.callsRescued} note="Missed calls captured" />
              <StatCard label="Pipeline value" value={stats.pipelineValue} note="From your typical job values" gold />
              <StatCard label="Booking rate" value={stats.bookingRate} note={stats.bookingDetail} gold />
            </div>

            {chart && (
              <div className="mt-6 lg:mt-8">
                <OverviewChart chart={chart} />
              </div>
            )}
          </div>
        )}

        {/* Conversations */}
        {dashboardTab === 'conversations' && (
          <div className="flex min-h-0 flex-1 flex-col">
            {leads.length === 0 ? (
              <div className="flex min-h-[320px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.09] p-10 text-center">
                <h4 className="font-display text-lg font-bold tracking-tight text-slate-200">No missed calls yet</h4>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">When someone misses you, they will show up here.</p>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-1 gap-8 lg:min-h-[460px] lg:grid-cols-12 lg:gap-10">
                {/* Left column: leads */}
                <div className={`space-y-3 lg:col-span-5 lg:overflow-y-auto ${mobileView === 'chat' ? 'hidden lg:block' : 'block'}`}>
                  {filterBarOn && (
                    <div
                      role="tablist"
                      aria-label="Filter conversations"
                      className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none]"
                    >
                      {visibleFilters(counts).map((f) => (
                        <button
                          key={f}
                          type="button"
                          role="tab"
                          aria-selected={activeFilter === f}
                          onClick={() => setFilter(f)}
                          className={`inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                            activeFilter === f
                              ? 'border-[#f59e0b]/50 bg-[#f59e0b]/10 text-[#ffc174]'
                              : 'border-white/[0.08] bg-transparent text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <span>{FILTER_LABEL[f]}</span>
                          <span className="text-xs text-slate-500">{counts[f]}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {visibleLeads.map((lead) => {
                    const isSelected = selectedLead !== null && lead.id === selectedLead.id;
                    const type = typeOf(lead);
                    const booked = lead.status === 'booked';
                    return (
                      <div
                        key={lead.id}
                        onClick={() => handleSelectLead(lead.id)}
                        className={`group relative cursor-pointer rounded-2xl border p-5 transition-colors ${
                          isSelected
                            ? 'border-[#f59e0b]/45 bg-[#151b2d] lg:shadow-[0_8px_30px_rgba(245,158,11,0.07)]'
                            : 'border-white/[0.06] bg-[#101524] hover:bg-[#131a2b]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-2.5">
                            {lead.unread && (
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.6)]" title="Unread conversation" />
                            )}
                            <span className="block truncate font-display text-base font-bold tracking-tight text-slate-100">{lead.name}</span>
                            <UrgencyBadge urgency={urgencyOf(lead)} />
                          </div>
                          <span className="shrink-0 pt-0.5 text-xs text-slate-500">{lead.timeAgo}</span>
                        </div>

                        <div className="mt-1.5 truncate text-sm text-slate-400">{lead.address}</div>

                        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                          <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${booked ? 'text-[#ffc174]' : 'text-slate-400'}`}>
                            {lead.conversationTag.icon === 'photos' ? <Paperclip className="h-3.5 w-3.5" /> : <Calendar className="h-3.5 w-3.5" />}
                            {lead.conversationTag.label}
                          </span>
                          {type !== 'homeowner' && (
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                type === 'unknown' || lead.needsReview
                                  ? 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#ffc174]'
                                  : 'border-white/[0.08] bg-white/[0.04] text-slate-300'
                              }`}
                            >
                              {TYPE_LABEL[type]}
                              {lead.needsReview ? ' · review' : ''}
                            </span>
                          )}
                          {!booked && (
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                                lead.status === 'won'
                                  ? 'border-[#ffc174]/30 bg-[#ffc174]/10 text-[#ffc174]'
                                  : 'border-white/[0.08] bg-white/[0.04] text-slate-300'
                              }`}
                            >
                              {STATUS_LABEL[lead.status]}
                            </span>
                          )}
                        </div>

                        <ChevronRight className="absolute right-4 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-slate-600 transition-all group-hover:translate-x-0.5 group-hover:text-[#ffc174] lg:block" />
                      </div>
                    );
                  })}
                </div>

                {/* Right column: the conversation */}
                <div className={`flex min-h-0 flex-col justify-start lg:col-span-7 ${mobileView === 'list' ? 'hidden lg:flex' : 'flex'}`}>
                  {selectedLead ? (
                    <div className="w-full">
                      <ConversationHeader
                        name={selectedLead.name}
                        subtitle={[selectedLead.insurance && selectedLead.insurance !== 'Not specified' ? selectedLead.insurance : '', selectedLead.phone].filter(Boolean).join(' · ')}
                        urgency={urgencyOf(selectedLead)}
                        callHref={selectedLead.phone ? telHref(selectedLead.phone) : undefined}
                        onBack={handleBackToQueue}
                      />

                      {/* everything else about the person, in one slim row */}
                      <div className="mb-4 mt-3 flex flex-wrap items-center gap-1.5 lg:mt-3">
                        {selectedLead.scheduledTime && (
                          <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#ffc174]/30 bg-[#ffc174]/10 px-3 text-[13px] font-semibold text-[#ffc174]">
                            <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" />
                            {selectedLead.scheduledTime}
                          </span>
                        )}
                        {hasAddress && (
                          <a
                            href={mapsHref(selectedLead.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`Directions to ${selectedLead.address}`}
                            className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-[13px] text-slate-300 transition-colors hover:bg-white/[0.06]"
                          >
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden="true" />
                            <span className="truncate">{selectedLead.address}</span>
                          </a>
                        )}
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

                      <LeadDetailsCard
                        rows={selectedLead.details ?? []}
                        why={selectedLead.whyWithYou}
                        urgency={urgencyOf(selectedLead)}
                        urgencyReason={selectedLead.urgencyReason}
                      />

                      {/* messages: page scroll on phones, a scroll box only on desktop */}
                      <div className="space-y-4 pb-1 lg:max-h-[440px] lg:space-y-4 lg:overflow-y-auto lg:pb-5 lg:pr-2">
                        {selectedLead.missedCallTime && (
                          <div className="flex items-center justify-center pb-1">
                            <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.07] bg-[#0a0e19] px-3.5 py-1.5 text-xs font-medium text-slate-400">
                              <PhoneMissed className="h-3.5 w-3.5 text-slate-500" />
                              <span>Missed call · {selectedLead.missedCallTime}</span>
                            </div>
                          </div>
                        )}

                        {selectedLead.chatTranscript.length === 0 && (
                          <p className="py-8 text-center text-sm text-slate-500">Loading messages…</p>
                        )}

                        {selectedLead.chatTranscript.map((msg, index) => {
                          if (msg.kind === 'event') {
                            return (
                              <React.Fragment key={index}>
                                {msg.dayDivider && (
                                  <div className="my-4 flex items-center justify-center">
                                    <span className="rounded-full border border-white/[0.07] bg-[#0a0e19] px-3.5 py-1 text-xs font-semibold text-slate-400">
                                      {msg.dayDivider}
                                    </span>
                                  </div>
                                )}
                                <div className="flex items-center justify-center py-0.5">
                                  <span className="inline-flex items-center gap-2 rounded-xl border border-white/[0.06] bg-[#0a0e19] px-3.5 py-1.5 text-center text-xs leading-snug text-slate-500">
                                    <span className={`h-1 w-1 shrink-0 rounded-full ${msg.eventActor === 'system' ? 'bg-slate-500' : 'bg-[#ffc174]'}`} />
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
                                <div className="my-4 flex items-center justify-center">
                                  <span className="rounded-full border border-white/[0.07] bg-[#0a0e19] px-3.5 py-1 text-xs font-semibold text-slate-400">
                                    {msg.dayDivider}
                                  </span>
                                </div>
                              )}
                              <div
                                className={`max-w-[90%] p-4 leading-relaxed lg:max-w-[88%] lg:p-5 ${
                                  isWedge
                                    ? 'rounded-2xl rounded-tl-md border border-white/[0.07] bg-[#111625] text-[#dee1f7]'
                                    : 'ml-auto rounded-2xl rounded-tr-md border border-[#ffc174]/20 bg-[#ffc174]/[0.08] text-left text-slate-100'
                                }`}
                              >
                                <div className="mb-2 flex items-center justify-between gap-4">
                                  <span className={`text-xs font-semibold ${isWedge ? 'text-slate-400' : 'text-[#ffc174]'}`}>
                                    {isWedge ? companyName : selectedLead.name.split(' ')[0]}
                                  </span>
                                  <span className="font-data text-xs text-slate-500">{msg.time}</span>
                                </div>

                                <p className="break-words font-body text-[15px] leading-relaxed text-[#e2e8f0]">{msg.text}</p>

                                {msg.hasAttachment && selectedLead.attachments && selectedLead.attachments.length > 0 && (
                                  <div className="mt-3 grid grid-cols-1 gap-2 border-t border-white/[0.06] pt-3 sm:grid-cols-2">
                                    {selectedLead.attachments.map((att, i) => (
                                      <div
                                        key={i}
                                        className="flex select-none items-center gap-2.5 rounded-xl border border-white/[0.07] bg-[#090d18] p-2.5 transition-colors hover:border-[#f59e0b]/40"
                                      >
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-[#192236]">
                                          <ImageIcon className="h-4 w-4 text-white" />
                                        </div>
                                        <div className="min-w-0 flex-1 text-xs leading-tight">
                                          <span className="block truncate font-medium text-slate-200">{att.name}</span>
                                          <span className="text-slate-500">{att.size}</span>
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
                        <div className="sticky bottom-0 z-20 -mx-5 border-t border-white/[0.06] bg-[#0c101d]/95 px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:-mx-8 sm:px-8 lg:static lg:mx-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-5 lg:backdrop-blur-none">
                          {threadFooter}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[380px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.09] p-10 text-center">
                      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-[#151b2c]">
                        <ChevronRight className="h-5 w-5 text-[#ffc174]" />
                      </div>
                      <h4 className="font-display text-lg font-bold tracking-tight text-slate-200">Pick a conversation</h4>
                      <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-400">Choose a missed call on the left to read the thread and see the photos.</p>
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
