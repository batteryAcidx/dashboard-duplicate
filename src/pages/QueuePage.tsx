import React, { useState } from 'react';
import {
  Calendar,
  Paperclip,
  ChevronRight,
  Phone,
  MessageSquare,
  Clock,
  ShieldAlert,
  CheckCircle2,
  X,
  ExternalLink,
  LogOut,
  Send,
  Image as ImageIcon
} from 'lucide-react';

interface Lead {
  id: string;
  name: string;
  phone: string;
  address: string;
  timeAgo: string;
  isPriority?: boolean;
  bookedTime: string;
  photoCount: number;
  photos: string[];
  jobValue: string;
  notes: string;
  messages: Array<{
    id: string;
    sender: 'system' | 'lead' | 'ai';
    text: string;
    time: string;
    photos?: string[];
  }>;
}

const LEADS_DATA: Lead[] = [
  {
    id: 'lead-1',
    name: 'Marcus Brooks',
    phone: '(214) 555-0182',
    address: '5624 Cedar Elm Ln, Frisco, TX',
    timeAgo: '4m ago',
    isPriority: true,
    bookedTime: 'Today 5:30 PM',
    photoCount: 2,
    photos: [
      'https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80',
    ],
    jobValue: '$14,200',
    notes: 'Wind storm damage, missing shingles on north ridge, active leak above garage.',
    messages: [
      {
        id: 'm1',
        sender: 'system',
        text: 'Missed Call captured (duration: 0s). Auto-dispatch triggered.',
        time: '4m ago',
      },
      {
        id: 'm2',
        sender: 'ai',
        text: 'Hi Marcus! This is Sarah from Summit Roofing. Sorry we missed your call. How can we help with your roof today?',
        time: '3m ago',
      },
      {
        id: 'm3',
        sender: 'lead',
        text: 'Hey Sarah, had heavy winds last night and noticed shingles on the driveway plus some water dripping in the garage ceiling. Need someone out ASAP.',
        time: '2m ago',
        photos: [
          'https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80',
        ],
      },
      {
        id: 'm4',
        sender: 'ai',
        text: "Got the photos Marcus! That definitely looks like storm uplift. I have senior inspector Dave available in Frisco today at 5:30 PM for a free urgent inspection. Does that work for you?",
        time: '1m ago',
      },
      {
        id: 'm5',
        sender: 'lead',
        text: "Yes, 5:30 PM today is perfect. Please send Dave over. Thanks for the lightning fast response!",
        time: 'Just now',
      },
    ],
  },
  {
    id: 'lead-2',
    name: 'Gary Mitchell',
    phone: '(469) 555-0931',
    address: '2208 Rolling Hills Dr, Garland, TX',
    timeAgo: '3h ago',
    isPriority: false,
    bookedTime: 'Mon 10 AM',
    photoCount: 1,
    photos: [
      'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80',
    ],
    jobValue: '$8,800',
    notes: 'Hail inspection request following recent storm. Architectural shingle roof.',
    messages: [
      {
        id: 'gm1',
        sender: 'system',
        text: 'Missed Call captured. Auto-dispatch triggered.',
        time: '3h ago',
      },
      {
        id: 'gm2',
        sender: 'ai',
        text: 'Hi Gary! Thanks for calling Summit Roofing. How can we assist with your property?',
        time: '3h ago',
      },
      {
        id: 'gm3',
        sender: 'lead',
        text: 'Insurance adjuster recommended I get a certified roofing estimate for hail denting on gutters and soft metals.',
        time: '3h ago',
        photos: [
          'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80',
        ],
      },
      {
        id: 'gm4',
        sender: 'ai',
        text: 'We handle insurance claims daily! We can come out Monday morning at 10:00 AM to do a full drone scan and hail inspection report.',
        time: '2h ago',
      },
      {
        id: 'gm5',
        sender: 'lead',
        text: 'Monday at 10 AM is confirmed. See you then.',
        time: '2h ago',
      },
    ],
  },
  {
    id: 'lead-3',
    name: 'Linda Ramirez',
    phone: '(972) 555-0417',
    address: '8815 Mapleshade Ln, Dallas, TX',
    timeAgo: '6h ago',
    isPriority: false,
    bookedTime: 'Tomorrow 11:30 AM',
    photoCount: 2,
    photos: [
      'https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?auto=format&fit=crop&w=800&q=80',
      'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
    ],
    jobValue: '$6,500',
    notes: 'Flashing repair and chimney leak inspection.',
    messages: [
      {
        id: 'lr1',
        sender: 'system',
        text: 'Missed Call captured. Auto-dispatch triggered.',
        time: '6h ago',
      },
      {
        id: 'lr2',
        sender: 'ai',
        text: 'Hi Linda, this is Summit Roofing. How can we help you today?',
        time: '6h ago',
      },
      {
        id: 'lr3',
        sender: 'lead',
        text: 'We have moisture stains around the brick chimney. Want an inspection before the rainy season.',
        time: '6h ago',
      },
      {
        id: 'lr4',
        sender: 'ai',
        text: 'We have a crew in Dallas tomorrow morning. Can we book you for Tomorrow at 11:30 AM?',
        time: '5h ago',
      },
      {
        id: 'lr5',
        sender: 'lead',
        text: 'Tomorrow at 11:30 AM works great for me.',
        time: '5h ago',
      },
    ],
  },
];

interface QueuePageProps {
  onNavigate?: (path: string) => void;
  onSignOut?: () => void;
  userEmail?: string;
}

export const QueuePage: React.FC<QueuePageProps> = ({
  onNavigate,
  onSignOut,
  userEmail = 'contractor@summitroofing.com',
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'conversations'>('conversations');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [activePhotoModal, setActivePhotoModal] = useState<string | null>(null);

  const selectedLead = LEADS_DATA.find((l) => l.id === selectedLeadId);

  return (
    <div className="min-h-screen w-full bg-[#080c16] text-[#dee1f7] font-['Inter'] selection:bg-[#f59e0b]/30 selection:text-[#ffc174] flex flex-col justify-between">
      {/* Top Header */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 pt-8 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#252939] border border-[#f59e0b]/50 flex items-center justify-center shadow-sm shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-6 h-6 text-[#f59e0b]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.27 20a2 2 0 0 0 3.46 0l8-14A2 2 0 0 0 20 3H4a2 2 0 0 0-1.73 3Z" fill="none" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-black uppercase tracking-tight text-slate-100">
                  WEDGE<span className="text-[#ffc174]">SCALE</span>
                </span>
                <span className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-extrabold text-slate-500">
                  /
                </span>
                <h1 className="font-['Space_Grotesk'] text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-slate-200">
                  DASHBOARD
                </h1>
              </div>
              <p className="font-['JetBrains_Mono'] text-xs sm:text-sm text-slate-400 mt-0.5">
                Summit Roofing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 font-['JetBrains_Mono'] text-[11px] sm:text-xs text-slate-400 tracking-wider">
              <span className="w-2 h-2 rounded-full bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse"></span>
              <span>REFRESHES EVERY 60S</span>
            </div>

            <div className="flex items-center gap-2 pl-2 border-l border-[#1f283d]">
              <button
                type="button"
                onClick={onSignOut}
                className="font-['JetBrains_Mono'] text-[10px] sm:text-xs text-slate-400 hover:text-red-400 px-3 py-1.5 rounded-lg bg-[#111728] border border-[#212b42] hover:border-red-900/50 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sign Out
              </button>
            </div>
          </div>
        </div>

        {/* Tab Segmented Switcher */}
        <div className="w-full bg-[#0a0e19] border border-[#1b2336] rounded-2xl p-1.5 flex items-center mb-6 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-3 px-4 rounded-xl font-['Space_Grotesk'] text-sm sm:text-base font-bold transition-all cursor-pointer text-center ${
              activeTab === 'overview'
                ? 'bg-[#141b2c] border border-[#26324d] text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('conversations')}
            className={`flex-1 py-3 px-4 rounded-xl font-['Space_Grotesk'] text-sm sm:text-base font-bold transition-all cursor-pointer flex items-center justify-center gap-2.5 ${
              activeTab === 'conversations'
                ? 'bg-[#141b2c] border border-[#26324d] text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Conversations</span>
            <span
              className={`font-['JetBrains_Mono'] text-xs font-bold px-2 py-0.5 rounded-full ${
                activeTab === 'conversations'
                  ? 'bg-[#20293f] text-[#ffc174] border border-[#ffc174]/20'
                  : 'bg-[#151c2d] text-slate-400'
              }`}
            >
              3
            </span>
          </button>
        </div>

        {/* MAIN BODY: OVERVIEW OR CONVERSATIONS */}
        {activeTab === 'overview' ? (
          /* OVERVIEW VIEW */
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="font-['JetBrains_Mono'] text-xs text-slate-400 uppercase tracking-widest pl-1">
              Last 24 hours
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Response Speed */}
              <div className="bg-[#0b101c] border border-[#192236] rounded-2xl p-6 sm:p-7 flex flex-col justify-between min-h-[160px] shadow-sm hover:border-[#273552] transition-colors">
                <div className="font-['JetBrains_Mono'] text-xs font-bold tracking-[0.16em] uppercase text-slate-400">
                  RESPONSE SPEED
                </div>
                <div className="my-2">
                  <div className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-extrabold text-[#ffc174]">
                    2m 06s
                  </div>
                </div>
                <div className="font-['Inter'] text-xs text-slate-400">
                  Average response time.
                </div>
              </div>

              {/* Card 2: Calls Rescued */}
              <div className="bg-[#0b101c] border border-[#192236] rounded-2xl p-6 sm:p-7 flex flex-col justify-between min-h-[160px] shadow-sm hover:border-[#273552] transition-colors">
                <div className="font-['JetBrains_Mono'] text-xs font-bold tracking-[0.16em] uppercase text-slate-400">
                  CALLS RESCUED
                </div>
                <div className="my-2">
                  <div className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-extrabold text-slate-100">
                    3
                  </div>
                </div>
                <div className="font-['Inter'] text-xs text-slate-400">
                  Total missed calls captured.
                </div>
              </div>

              {/* Card 3: Pipeline Value */}
              <div className="bg-[#0b101c] border border-[#192236] rounded-2xl p-6 sm:p-7 flex flex-col justify-between min-h-[160px] shadow-sm hover:border-[#273552] transition-colors">
                <div className="font-['JetBrains_Mono'] text-xs font-bold tracking-[0.16em] uppercase text-slate-400">
                  PIPELINE VALUE
                </div>
                <div className="my-2">
                  <div className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-extrabold text-[#ffc174]">
                    $29,500
                  </div>
                </div>
                <div className="font-['Inter'] text-xs text-slate-400">
                  Based on your typical job values.
                </div>
              </div>

              {/* Card 4: Booking Rate */}
              <div className="bg-[#0b101c] border border-[#192236] rounded-2xl p-6 sm:p-7 flex flex-col justify-between min-h-[160px] shadow-sm hover:border-[#273552] transition-colors">
                <div className="font-['JetBrains_Mono'] text-xs font-bold tracking-[0.16em] uppercase text-slate-400">
                  BOOKING RATE
                </div>
                <div className="my-2">
                  <div className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-extrabold text-[#ffc174]">
                    100%
                  </div>
                </div>
                <div className="font-['Inter'] text-xs text-slate-400">
                  3 of 3 missed calls booked.
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* CONVERSATIONS VIEW */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-150">
            {/* Left Column: Leads List */}
            <div className="lg:col-span-5 space-y-3.5">
              {LEADS_DATA.map((lead) => {
                const isSelected = selectedLeadId === lead.id;
                return (
                  <div
                    key={lead.id}
                    onClick={() => setSelectedLeadId(lead.id)}
                    className={`rounded-2xl border p-5 transition-all duration-150 cursor-pointer text-left relative overflow-hidden ${
                      isSelected
                        ? 'bg-[#12192b] border-[#f59e0b]/50 shadow-[0_8px_24px_rgba(0,0,0,0.4)]'
                        : 'bg-[#0b101c] border-[#182133] hover:border-[#273550] hover:bg-[#0e1424]'
                    }`}
                  >
                    {/* Top Row: Indicator + Name + Priority + Time */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                        <span className="font-['Space_Grotesk'] text-base sm:text-lg font-bold text-slate-100">
                          {lead.name}
                        </span>
                        {lead.isPriority && (
                          <span className="font-['JetBrains_Mono'] text-[10px] uppercase font-extrabold tracking-wider bg-[#221c13] text-[#ffc174] border border-[#f59e0b]/40 px-2 py-0.5 rounded shadow-sm">
                            PRIORITY
                          </span>
                        )}
                      </div>

                      <span className="font-['JetBrains_Mono'] text-xs text-slate-400 shrink-0">
                        {lead.timeAgo}
                      </span>
                    </div>

                    {/* Middle Row: Address + Chevron */}
                    <div className="flex items-center justify-between gap-3 text-slate-400 text-xs sm:text-sm font-['Inter'] mb-3.5">
                      <span className="truncate">{lead.address}</span>
                      <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                    </div>

                    {/* Bottom Row: Badges */}
                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                      <div className="inline-flex items-center gap-1.5 font-['JetBrains_Mono'] text-xs text-slate-300 bg-[#121727] border border-[#212b42] px-2.5 py-1 rounded-lg">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>Booked {lead.bookedTime}</span>
                      </div>

                      {lead.photoCount > 0 && (
                        <div className="inline-flex items-center gap-1.5 font-['JetBrains_Mono'] text-xs text-slate-300 bg-[#121727] border border-[#212b42] px-2.5 py-1 rounded-lg">
                          <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                          <span>
                            {lead.photoCount} {lead.photoCount === 1 ? 'Photo' : 'Photos'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Column: Conversation Viewer or Empty State */}
            <div className="lg:col-span-7">
              {selectedLead ? (
                /* Active Lead Conversation Thread */
                <div className="rounded-2xl sm:rounded-3xl bg-[#0b101c] border border-[#192236] shadow-xl overflow-hidden flex flex-col min-h-[580px]">
                  {/* Lead Top Bar */}
                  <div className="p-5 sm:p-6 bg-[#0f1524] border-b border-[#1c263c] flex items-center justify-between gap-4 flex-wrap">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <h2 className="font-['Space_Grotesk'] text-xl sm:text-2xl font-black text-slate-100">
                          {selectedLead.name}
                        </h2>
                        {selectedLead.isPriority && (
                          <span className="font-['JetBrains_Mono'] text-[10px] uppercase font-extrabold tracking-wider bg-[#221c13] text-[#ffc174] border border-[#f59e0b]/40 px-2 py-0.5 rounded">
                            PRIORITY
                          </span>
                        )}
                      </div>
                      <p className="font-['Inter'] text-xs text-slate-400">
                        {selectedLead.address} · <span className="font-['JetBrains_Mono'] text-slate-300">{selectedLead.phone}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="font-['JetBrains_Mono'] text-xs bg-[#121727] border border-[#f59e0b]/40 text-[#ffc174] px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>Booked: {selectedLead.bookedTime}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedLeadId(null)}
                        className="p-1.5 rounded-lg bg-[#141b2b] hover:bg-[#1f283d] text-slate-400 hover:text-slate-200 transition-colors"
                        title="Close conversation"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Message Thread Body */}
                  <div className="p-5 sm:p-6 space-y-4 flex-1 overflow-y-auto max-h-[460px]">
                    {selectedLead.messages.map((msg) => (
                      <div key={msg.id} className="space-y-1">
                        {msg.sender === 'system' ? (
                          <div className="text-center my-3">
                            <span className="font-['JetBrains_Mono'] text-[11px] text-slate-400 bg-[#121728] border border-[#1f2940] px-3 py-1 rounded-full inline-flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]"></span>
                              {msg.text}
                            </span>
                          </div>
                        ) : msg.sender === 'ai' ? (
                          <div className="flex flex-col items-start max-w-[85%]">
                            <span className="font-['JetBrains_Mono'] text-[10px] text-slate-500 pl-1 uppercase tracking-wider mb-1">
                              Summit Auto-Dispatch · {msg.time}
                            </span>
                            <div className="bg-[#151c2d] border border-[#222d46] text-slate-200 p-4 rounded-2xl rounded-tl-sm text-xs sm:text-sm font-['Inter'] leading-relaxed shadow-sm">
                              {msg.text}
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end max-w-[85%] ml-auto">
                            <span className="font-['JetBrains_Mono'] text-[10px] text-slate-500 pr-1 uppercase tracking-wider mb-1">
                              {selectedLead.name} · {msg.time}
                            </span>
                            <div className="bg-[#f59e0b] text-[#140e04] p-4 rounded-2xl rounded-tr-sm text-xs sm:text-sm font-['Inter'] font-medium leading-relaxed shadow-sm">
                              {msg.text}
                            </div>

                            {/* Photo Attachments if any */}
                            {msg.photos && msg.photos.length > 0 && (
                              <div className="flex gap-2 mt-2">
                                {msg.photos.map((photoUrl, idx) => (
                                  <div
                                    key={idx}
                                    onClick={() => setActivePhotoModal(photoUrl)}
                                    className="relative rounded-xl overflow-hidden border border-[#2f3952] cursor-pointer group shadow-md"
                                  >
                                    <img
                                      src={photoUrl}
                                      alt={`Damage photo ${idx + 1}`}
                                      className="w-24 h-24 sm:w-28 sm:h-28 object-cover group-hover:scale-105 transition-transform duration-200"
                                    />
                                    <div className="absolute inset-0 bg-black/30 group-hover:bg-transparent transition-colors flex items-center justify-center text-white text-xs font-mono font-bold">
                                      <ImageIcon className="w-4 h-4" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* SMS Quick Reply Box */}
                  <div className="p-4 bg-[#0d121f] border-t border-[#1a2337] flex items-center gap-3">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Send a text message to ${selectedLead.name}...`}
                      className="flex-1 bg-[#070a12] border border-[#222b40] focus:border-[#f59e0b] focus:outline-none rounded-xl px-4 py-3 text-xs sm:text-sm font-['Inter'] text-slate-100 placeholder:text-slate-600 transition-colors"
                    />
                    <button
                      type="button"
                      disabled={!replyText.trim()}
                      className="bg-[#f59e0b] hover:bg-[#fbbf24] disabled:opacity-40 text-[#150f05] font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider px-4 py-3 rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* Empty State Matching Screenshot */
                <div className="rounded-2xl sm:rounded-3xl bg-[#0b101c] border border-[#182033] p-8 sm:p-14 flex flex-col items-center justify-center min-h-[520px] text-center shadow-lg">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-[#131929] border border-[#222c44] flex items-center justify-center text-slate-400 mb-5 shadow-sm">
                    <ChevronRight className="w-6 h-6 text-slate-400" />
                  </div>

                  <h3 className="font-['Space_Grotesk'] text-lg sm:text-2xl font-bold text-slate-100 max-w-sm">
                    Select a lead to read the conversation
                  </h3>

                  <p className="font-['Inter'] text-xs sm:text-sm text-slate-400 mt-2.5 max-w-md leading-relaxed">
                    Click any missed call on the left to see the full text thread and photos.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="w-full text-center z-10 py-6 border-t border-[#121828] mt-12">
        <p className="font-['JetBrains_Mono'] text-xs text-slate-600 uppercase tracking-widest">
          WedgeScale Live Dispatch & Recovery Platform
        </p>
      </div>

      {/* Photo Lightbox Modal */}
      {activePhotoModal && (
        <div
          onClick={() => setActivePhotoModal(null)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#121727] border border-[#2a344d] rounded-2xl overflow-hidden max-w-2xl w-full shadow-2xl relative"
          >
            <div className="p-4 border-b border-[#232d43] flex items-center justify-between">
              <span className="font-['Space_Grotesk'] text-sm font-bold text-slate-200">
                Uploaded Damage Photo
              </span>
              <button
                type="button"
                onClick={() => setActivePhotoModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex items-center justify-center bg-[#070b14]">
              <img
                src={activePhotoModal}
                alt="Damage inspection detail"
                className="max-h-[70vh] rounded-lg object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
