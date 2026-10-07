import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Calendar,
  Paperclip,
  ChevronRight,
  ChevronDown,
  LogOut,
  Send,
  Image as ImageIcon,
  X,
  RotateCcw,
  AlertCircle,
  Inbox,
  Phone,
  Shield,
  MapPin,
  FileText,
  Building2
} from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { NotFoundPage } from './NotFoundPage';

interface Attachment {
  id: string;
  lead_id?: string;
  url?: string;
  photo_url?: string;
  file_path?: string;
  label?: string;
  created_at?: string;
}

interface Message {
  id: string;
  lead_id?: string;
  sender: 'system' | 'lead' | 'ai';
  text: string;
  sent_at?: string;
  time?: string;
  photos?: string[];
}

interface Lead {
  id: string;
  name: string;
  firstName: string;
  phone: string;
  address: string;
  insurance: string;
  intent: string;
  timeAgo: string;
  missedCallTime?: string;
  isPriority?: boolean;
  unread?: boolean;
  bookedTime: string;
  photoCount: number;
  attachments: Attachment[];
  messages: Message[];
  missed_call_at?: string;
  created_at?: string;
  response_seconds?: number;
  estimated_value?: number;
  hasAppointment?: boolean;
  appointments?: any[];
}

// Kept for reference / fallback
const LEADS_DATA: Lead[] = [
  {
    id: 'lead-1',
    name: 'Marcus Brooks',
    firstName: 'Marcus',
    phone: '(214) 555-0182',
    address: '5624 Cedar Elm Ln, Frisco, TX',
    insurance: 'State Farm',
    intent: 'Wind storm damage, missing shingles on north ridge, active leak above garage.',
    timeAgo: '4m ago',
    missedCallTime: '2:15 PM',
    isPriority: true,
    unread: true,
    bookedTime: 'Today 5:30 PM',
    photoCount: 2,
    missed_call_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    created_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    response_seconds: 126,
    estimated_value: 12500,
    hasAppointment: true,
    appointments: [{ id: 'app-1', booked_at: '2026-10-07T17:30:00Z', formatted_time: 'Today 5:30 PM' }],
    attachments: [
      { id: 'att-1', label: 'Photo 1' },
      { id: 'att-2', label: 'Photo 2' },
    ],
    messages: [
      {
        id: 'm1',
        sender: 'system',
        text: 'Missed Call captured. Auto-dispatch triggered.',
        sent_at: '2026-10-07T14:15:00Z',
        time: '2:15 PM',
      },
      {
        id: 'm2',
        sender: 'system',
        text: 'Hi Marcus! Thanks for calling Summit Roofing. Sorry we missed your call. How can we help with your roof today?',
        sent_at: '2026-10-07T14:16:00Z',
        time: '2:16 PM',
      },
      {
        id: 'm3',
        sender: 'lead',
        text: 'Hey, had heavy winds last night and noticed shingles on the driveway plus some water dripping in the garage ceiling. Need someone out ASAP.',
        sent_at: '2026-10-07T14:18:00Z',
        time: '2:18 PM',
      },
      {
        id: 'm4',
        sender: 'system',
        text: 'Got the details Marcus! That looks like storm uplift. We have an inspector available in Frisco today at 5:30 PM for a free inspection. Does that work?',
        sent_at: '2026-10-07T14:19:00Z',
        time: '2:19 PM',
      },
      {
        id: 'm5',
        sender: 'lead',
        text: 'Yes, 5:30 PM today is perfect. Thanks for the lightning fast response!',
        sent_at: '2026-10-07T14:21:00Z',
        time: '2:21 PM',
      },
    ],
  },
  {
    id: 'lead-2',
    name: 'Gary Mitchell',
    firstName: 'Gary',
    phone: '(469) 555-0931',
    address: '2208 Rolling Hills Dr, Garland, TX',
    insurance: 'Allstate',
    intent: 'Hail inspection request following recent storm. Architectural shingle roof.',
    timeAgo: '3h ago',
    missedCallTime: '11:30 AM',
    isPriority: false,
    unread: true,
    bookedTime: 'Mon 10 AM',
    photoCount: 1,
    missed_call_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    created_at: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
    response_seconds: 110,
    estimated_value: 8500,
    hasAppointment: true,
    appointments: [{ id: 'app-2', booked_at: '2026-10-12T10:00:00Z', formatted_time: 'Mon 10 AM' }],
    attachments: [
      { id: 'att-3', label: 'Photo 1' },
    ],
    messages: [
      {
        id: 'gm1',
        sender: 'system',
        text: 'Missed Call captured. Auto-dispatch triggered.',
        sent_at: '2026-10-07T11:30:00Z',
        time: '11:30 AM',
      },
      {
        id: 'gm2',
        sender: 'system',
        text: 'Hi Gary! Thanks for calling Summit Roofing. How can we assist with your property?',
        sent_at: '2026-10-07T11:31:00Z',
        time: '11:31 AM',
      },
      {
        id: 'gm3',
        sender: 'lead',
        text: 'Insurance adjuster recommended I get a certified roofing estimate for hail denting on gutters and soft metals.',
        sent_at: '2026-10-07T11:34:00Z',
        time: '11:34 AM',
      },
      {
        id: 'gm4',
        sender: 'system',
        text: 'We handle insurance claims daily! We can come out Monday morning at 10:00 AM to do a full scan and hail inspection report.',
        sent_at: '2026-10-07T11:35:00Z',
        time: '11:35 AM',
      },
      {
        id: 'gm5',
        sender: 'lead',
        text: 'Monday at 10 AM is confirmed. See you then.',
        sent_at: '2026-10-07T11:36:00Z',
        time: '11:36 AM',
      },
    ],
  },
  {
    id: 'lead-3',
    name: 'Linda Ramirez',
    firstName: 'Linda',
    phone: '(972) 555-0417',
    address: '8815 Mapleshade Ln, Dallas, TX',
    insurance: 'USAA Claim #892',
    intent: 'Flashing repair and chimney leak inspection before rainy season.',
    timeAgo: '6h ago',
    missedCallTime: '8:45 AM',
    isPriority: false,
    unread: false,
    bookedTime: 'Tomorrow 11:30 AM',
    photoCount: 2,
    missed_call_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    created_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
    response_seconds: 140,
    estimated_value: 8500,
    hasAppointment: true,
    appointments: [{ id: 'app-3', booked_at: '2026-10-08T11:30:00Z', formatted_time: 'Tomorrow 11:30 AM' }],
    attachments: [
      { id: 'att-4', label: 'Photo 1' },
      { id: 'att-5', label: 'Photo 2' },
    ],
    messages: [
      {
        id: 'lr1',
        sender: 'system',
        text: 'Missed Call captured. Auto-dispatch triggered.',
        sent_at: '2026-10-07T08:45:00Z',
        time: '8:45 AM',
      },
      {
        id: 'lr2',
        sender: 'system',
        text: 'Hi Linda, this is Summit Roofing. How can we help you today?',
        sent_at: '2026-10-07T08:46:00Z',
        time: '8:46 AM',
      },
      {
        id: 'lr3',
        sender: 'lead',
        text: 'We have moisture stains around the brick chimney. Want an inspection before the rainy season.',
        sent_at: '2026-10-07T08:49:00Z',
        time: '8:49 AM',
      },
      {
        id: 'lr4',
        sender: 'system',
        text: 'We have a crew in Dallas tomorrow morning. Can we book you for Tomorrow at 11:30 AM?',
        sent_at: '2026-10-07T08:50:00Z',
        time: '8:50 AM',
      },
      {
        id: 'lr5',
        sender: 'lead',
        text: 'Tomorrow at 11:30 AM works great for me.',
        sent_at: '2026-10-07T08:52:00Z',
        time: '8:52 AM',
      },
    ],
  },
];

function formatTimeAgo(dateString?: string | null): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return String(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  return `${diffInMonths}mo ago`;
}

function formatClockTime(dateString?: string | null): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return String(dateString);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getDayDivider(dateString?: string | null): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return 'Today';
  }
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return d.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

function formatBookedTime(appointmentData: any): string | null {
  if (!appointmentData) return null;
  const appt = Array.isArray(appointmentData) ? appointmentData[0] : appointmentData;
  if (!appt) return null;

  if (appt.formatted_time || appt.booked_time || appt.time_slot) {
    return appt.formatted_time || appt.booked_time || appt.time_slot;
  }

  const rawDate = appt.booked_at || appt.scheduled_at || appt.time || appt.date || appt.appointment_date;
  if (!rawDate) return null;

  try {
    const d = new Date(rawDate);
    if (isNaN(d.getTime())) return String(rawDate);

    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    const isTomorrow = d.toDateString() === tomorrow.toDateString();

    const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: d.getMinutes() === 0 ? undefined : '2-digit' });
    if (isToday) return `Today ${timeStr}`;
    if (isTomorrow) return `Tomorrow ${timeStr}`;
    const dayStr = d.toLocaleDateString([], { weekday: 'short' });
    return `${dayStr} ${timeStr}`;
  } catch {
    return String(rawDate);
  }
}

function formatResponseTime(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '0s';
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

interface QueuePageProps {
  onNavigate?: (path: string) => void;
  onSignOut?: () => void;
  userEmail?: string;
  selectedConversationId?: string | null;
}

export const QueuePage: React.FC<QueuePageProps> = ({
  onNavigate,
  onSignOut,
  userEmail = 'contractor@summitroofing.com',
  selectedConversationId = null,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'conversations'>('conversations');
  const [timeWindow, setTimeWindow] = useState<'24h' | '7d' | '30d'>('24h');
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(selectedConversationId);
  const [replyText, setReplyText] = useState('');

  // Real Supabase data states
  const [leads, setLeads] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active Lead Message & Attachment states
  const [activeMessages, setActiveMessages] = useState<Message[]>([]);
  const [activeAttachments, setActiveAttachments] = useState<Attachment[]>([]);
  const [isLoadingThread, setIsLoadingThread] = useState<boolean>(false);
  const [leadNotFound, setLeadNotFound] = useState<boolean>(false);

  // Account and company name states
  const [companyName, setCompanyName] = useState<string>('Summit Roofing');
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState<boolean>(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  // Close account menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Fetch company name from Supabase account or user metadata
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const fetchAccountInfo = async () => {
      try {
        // 1. Check user metadata
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const metaName =
            user.user_metadata?.company_name ||
            user.user_metadata?.company ||
            user.user_metadata?.account_name ||
            user.user_metadata?.business_name ||
            user.user_metadata?.name;
          if (metaName && typeof metaName === 'string') {
            setCompanyName(metaName);
          }
        }

        // 2. Check accounts table
        const { data, error } = await supabase
          .from('accounts')
          .select('name, company_name, business_name')
          .limit(1)
          .maybeSingle();

        if (!error && data) {
          const fetchedName = data.company_name || data.name || data.business_name;
          if (fetchedName && typeof fetchedName === 'string') {
            setCompanyName(fetchedName);
          }
        }
      } catch (err) {
        console.warn('Account fetch error:', err);
      }
    };

    fetchAccountInfo();
  }, []);

  // Synchronize route param with selection
  useEffect(() => {
    if (selectedConversationId) {
      setSelectedLeadId(selectedConversationId);
      setActiveTab('conversations');
    }
  }, [selectedConversationId]);

  const fetchLeads = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setLeadNotFound(false);

    if (!isSupabaseConfigured) {
      setLeads(LEADS_DATA);
      setIsLoading(false);
      return;
    }

    try {
      let rawLeads: any[] = [];

      const { data, error: queryError } = await supabase
        .from('leads')
        .select(`
          *,
          appointments (*),
          attachments (*),
          messages (*)
        `)
        .order('priority', { ascending: false })
        .order('missed_call_at', { ascending: false, nullsFirst: false });

      if (queryError) {
        const fallback = await supabase
          .from('leads')
          .select('*')
          .order('priority', { ascending: false })
          .order('missed_call_at', { ascending: false, nullsFirst: false });

        if (fallback.error) {
          throw fallback.error;
        }
        rawLeads = fallback.data || [];
      } else {
        rawLeads = data || [];
      }

      const mappedLeads: Lead[] = rawLeads.map((row: any) => {
        const rawAttachments = Array.isArray(row.attachments) ? row.attachments : [];
        const attachments: Attachment[] = rawAttachments.map((a: any, idx: number) => ({
          id: String(a.id || idx),
          lead_id: String(row.id),
          url: a.url || a.photo_url || a.file_path,
          label: a.label || `Photo ${idx + 1}`,
        }));

        const rawAppointments = Array.isArray(row.appointments) ? row.appointments : row.appointments ? [row.appointments] : [];
        const bookedTimeStr =
          formatBookedTime(row.appointments) ||
          row.booked_time ||
          row.appointment_time ||
          '';

        const timeAgoStr = formatTimeAgo(row.missed_call_at || row.created_at);
        const missedCallClock = formatClockTime(row.missed_call_at || row.created_at);

        const fullName = row.name || (row.first_name ? `${row.first_name} ${row.last_name || ''}`.trim() : 'Unnamed Lead');
        const firstName = row.first_name || fullName.split(' ')[0] || 'Homeowner';

        const rawMessages = Array.isArray(row.messages) ? row.messages : [];
        const messages: Message[] = rawMessages.map((m: any) => ({
          id: String(m.id || Math.random()),
          lead_id: String(row.id),
          sender: (m.sender === 'system' || m.sender === 'lead' || m.sender === 'ai'
            ? (m.sender === 'ai' ? 'system' : m.sender)
            : m.is_from_lead
            ? 'lead'
            : 'system') as 'system' | 'lead' | 'ai',
          text: m.text || m.content || m.body || m.message || '',
          sent_at: m.sent_at || m.created_at,
          time: formatClockTime(m.sent_at || m.created_at),
          photos: m.photos || (m.photo_url ? [m.photo_url] : undefined),
        }));

        const estValue =
          typeof row.estimated_value === 'number'
            ? row.estimated_value
            : typeof row.final_value === 'number'
            ? row.final_value
            : typeof row.value === 'number'
            ? row.value
            : parseFloat(row.estimated_value || row.final_value || row.value || 0) || 0;

        let respSecs =
          typeof row.response_seconds === 'number'
            ? row.response_seconds
            : parseFloat(row.response_seconds || 0) || 0;

        if (!respSecs && row.missed_call_at && messages.length > 0) {
          const firstSysMsg = messages.find((m: any) => m.sender === 'system' && m.sent_at);
          if (firstSysMsg?.sent_at) {
            const diff = Math.floor(
              (new Date(firstSysMsg.sent_at).getTime() - new Date(row.missed_call_at).getTime()) / 1000
            );
            if (diff > 0 && diff < 86400) {
              respSecs = diff;
            }
          }
        }

        return {
          id: String(row.id),
          name: fullName,
          firstName: firstName,
          phone: row.phone || row.phone_number || '',
          address: row.address || row.property_address || 'No address provided',
          insurance: row.insurance || row.insurance_carrier || row.carrier || 'Not specified',
          intent: row.intent || row.intent_line || row.notes || 'Roof repair / inspection inquiry',
          timeAgo: timeAgoStr,
          missedCallTime: missedCallClock,
          isPriority: Boolean(row.priority),
          unread: Boolean(row.unread),
          bookedTime: bookedTimeStr,
          photoCount: attachments.length || row.photo_count || 0,
          attachments: attachments,
          messages: messages,
          missed_call_at: row.missed_call_at,
          created_at: row.created_at,
          response_seconds: respSecs,
          estimated_value: estValue,
          hasAppointment: rawAppointments.length > 0 || Boolean(bookedTimeStr),
          appointments: rawAppointments,
        };
      });

      setLeads(mappedLeads);
      setIsLoading(false);
    } catch (err: any) {
      console.error('Error reading leads from Supabase:', err);
      setError(err?.message || 'Failed to load conversations.');
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Load active lead messages and attachments when a lead is opened
  const loadLeadDetails = useCallback(async (leadId: string, currentLeads: Lead[]) => {
    setIsLoadingThread(true);
    setLeadNotFound(false);

    // If Supabase not configured, use in-memory data
    if (!isSupabaseConfigured) {
      const found = currentLeads.find((l) => l.id === leadId);
      if (!found) {
        setLeadNotFound(true);
      } else {
        setActiveMessages(found.messages || []);
        setActiveAttachments(found.attachments || []);
      }
      setIsLoadingThread(false);
      return;
    }

    try {
      // Mark as read in Supabase and local state if currently unread
      const leadToUpdate = currentLeads.find((l) => l.id === leadId);
      if (leadToUpdate && leadToUpdate.unread) {
        setLeads((prevLeads) =>
          prevLeads.map((l) => (l.id === leadId ? { ...l, unread: false } : l))
        );

        if (isSupabaseConfigured) {
          supabase
            .from('leads')
            .update({ unread: false })
            .eq('id', leadId)
            .then(({ error: updateErr }) => {
              if (updateErr) {
                console.warn('Failed to update unread status in Supabase:', updateErr);
              }
            });
        }
      }

      // 1. Fetch messages ordered by sent_at
      const { data: messagesData, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('sent_at', { ascending: true });

      // 2. Fetch attachments
      const { data: attachmentsData, error: attError } = await supabase
        .from('attachments')
        .select('*')
        .eq('lead_id', leadId);

      // Check if lead belongs to user account
      const found = currentLeads.find((l) => l.id === leadId);
      if (!found) {
        // Double check direct lead query to verify ownership
        const { data: directLead, error: leadErr } = await supabase
          .from('leads')
          .select('*')
          .eq('id', leadId)
          .single();

        if (leadErr || !directLead) {
          setLeadNotFound(true);
          setIsLoadingThread(false);
          return;
        }
      }

      if (messagesData && !msgError) {
        const mappedMsgs: Message[] = messagesData.map((m: any) => ({
          id: String(m.id),
          lead_id: String(m.lead_id),
          sender: (m.sender === 'system' || m.sender === 'lead' || m.sender === 'ai'
            ? (m.sender === 'ai' ? 'system' : m.sender)
            : m.is_from_lead
            ? 'lead'
            : 'system') as 'system' | 'lead' | 'ai',
          text: m.text || m.content || m.body || m.message || '',
          sent_at: m.sent_at || m.created_at,
          time: formatClockTime(m.sent_at || m.created_at),
          photos: m.photos || (m.photo_url ? [m.photo_url] : undefined),
        }));
        setActiveMessages(mappedMsgs);
      } else if (found) {
        setActiveMessages(found.messages || []);
      }

      if (attachmentsData && !attError) {
        const mappedAtts: Attachment[] = attachmentsData.map((a: any, idx: number) => ({
          id: String(a.id),
          lead_id: String(a.lead_id),
          url: a.url || a.photo_url || a.file_path,
          label: a.label || `Photo ${idx + 1}`,
        }));
        setActiveAttachments(mappedAtts);
      } else if (found) {
        setActiveAttachments(found.attachments || []);
      }

      setIsLoadingThread(false);
    } catch (err) {
      console.error('Error loading lead thread:', err);
      setIsLoadingThread(false);
    }
  }, []);

  useEffect(() => {
    if (selectedLeadId && leads.length > 0) {
      loadLeadDetails(selectedLeadId, leads);
    } else if (selectedConversationId && !isLoading && leads.length === 0) {
      setLeadNotFound(true);
    }
  }, [selectedLeadId, leads, selectedConversationId, isLoading, loadLeadDetails]);

  // Handle opening lead and updating route to /conversations/:id
  const handleOpenLead = (id: string) => {
    setSelectedLeadId(id);
    const target = leads.find((l) => l.id === id);
    if (target && target.unread) {
      setLeads((prevLeads) =>
        prevLeads.map((l) => (l.id === id ? { ...l, unread: false } : l))
      );

      if (isSupabaseConfigured) {
        supabase
          .from('leads')
          .update({ unread: false })
          .eq('id', id)
          .then(({ error: updateErr }) => {
            if (updateErr) {
              console.warn('Failed to update unread status in Supabase:', updateErr);
            }
          });
      }
    }

    if (onNavigate) {
      onNavigate(`/conversations/${id}`);
    } else {
      window.history.pushState({}, '', `/conversations/${id}`);
    }
  };

  const handleCloseLead = () => {
    setSelectedLeadId(null);
    if (onNavigate) {
      onNavigate('/queue');
    } else {
      window.history.pushState({}, '', '/queue');
    }
  };

  // If lead id in URL doesn't exist or belongs to another account, render not found page
  if (selectedConversationId && leadNotFound && !isLoading) {
    return <NotFoundPage onNavigate={onNavigate} />;
  }

  // Unread count calculated dynamically from data
  const unreadCount = leads.filter((lead) => Boolean(lead.unread)).length;

  const selectedLead = leads.find((l) => l.id === selectedLeadId);

  // Window metrics calculations
  const windowDurationMs =
    timeWindow === '24h'
      ? 24 * 60 * 60 * 1000
      : timeWindow === '7d'
      ? 7 * 24 * 60 * 60 * 1000
      : 30 * 24 * 60 * 60 * 1000;

  const cutoffTimestamp = Date.now() - windowDurationMs;

  // 1. Calls Captured: leads with a missed call in the window
  const capturedLeads = leads.filter((lead) => {
    const time = lead.missed_call_at
      ? new Date(lead.missed_call_at).getTime()
      : lead.created_at
      ? new Date(lead.created_at).getTime()
      : 0;
    if (!time || isNaN(time)) return true;
    return time >= cutoffTimestamp;
  });

  const callsCapturedCount = capturedLeads.length;

  // 2. Booked: leads with an appointment
  const bookedLeads = capturedLeads.filter(
    (l) => l.hasAppointment || (l.appointments && l.appointments.length > 0) || Boolean(l.bookedTime)
  );
  const bookedCount = bookedLeads.length;

  // 3. Booking Rate: booked divided by captured
  const bookingRate = callsCapturedCount > 0 ? Math.round((bookedCount / callsCapturedCount) * 100) : 0;

  // 4. Pipeline Value: sum of estimated_value for booked leads
  const pipelineValue = bookedLeads.reduce(
    (sum, l) => sum + (typeof l.estimated_value === 'number' ? l.estimated_value : 0),
    0
  );

  // 5. Average Response Time from response_seconds
  const responseSecondsList = capturedLeads
    .map((l) => l.response_seconds)
    .filter((sec): sec is number => typeof sec === 'number' && !isNaN(sec) && sec > 0);

  const avgResponseSeconds =
    responseSecondsList.length > 0
      ? Math.round(responseSecondsList.reduce((acc, curr) => acc + curr, 0) / responseSecondsList.length)
      : 0;

  const formattedResponseTime = formatResponseTime(avgResponseSeconds);
  const formattedPipelineValue = formatCurrency(pipelineValue);

  // Group messages by day dividers
  const renderMessageList = () => {
    const messagesToRender = activeMessages.length > 0 ? activeMessages : (selectedLead?.messages || []);
    let lastDate = '';

    return (
      <div className="space-y-4">
        {/* Top 'Missed call' marker from missed_call_at */}
        <div className="text-center my-3">
          <div className="inline-flex items-center gap-2 bg-[#141b2b] border border-[#25324d] px-4 py-1.5 rounded-full font-['JetBrains_Mono'] text-xs text-slate-300 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            <span className="font-bold text-slate-200">Missed call</span>
            {selectedLead?.missedCallTime && (
              <>
                <span className="text-slate-500">·</span>
                <span className="text-slate-400">{selectedLead.missedCallTime}</span>
              </>
            )}
          </div>
        </div>

        {messagesToRender.map((msg) => {
          const divider = getDayDivider(msg.sent_at);
          const showDivider = divider && divider !== lastDate;
          if (divider) lastDate = divider;

          return (
            <React.Fragment key={msg.id}>
              {showDivider && (
                <div className="text-center my-4">
                  <span className="font-['JetBrains_Mono'] text-[10px] text-slate-400 bg-[#0d121f] border border-[#1f283d] px-3 py-1 rounded-full uppercase tracking-wider">
                    {divider}
                  </span>
                </div>
              )}

              <div className="space-y-1">
                {msg.sender === 'system' ? (
                  /* Summit Roofing (System / Auto-Dispatch) */
                  <div className="flex flex-col items-start max-w-[85%]">
                    <span className="font-['JetBrains_Mono'] text-[11px] text-slate-400 pl-1 uppercase tracking-wider mb-1 font-semibold">
                      Summit Roofing {msg.time ? `· ${msg.time}` : ''}
                    </span>
                    <div className="bg-[#151c2d] border border-[#222d46] text-slate-200 p-4 rounded-2xl rounded-tl-sm text-xs sm:text-sm font-['Inter'] leading-relaxed shadow-sm">
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  /* Homeowner Message (Lead First Name) */
                  <div className="flex flex-col items-end max-w-[85%] ml-auto">
                    <span className="font-['JetBrains_Mono'] text-[11px] text-slate-400 pr-1 uppercase tracking-wider mb-1 font-semibold">
                      {selectedLead?.firstName || 'Homeowner'} {msg.time ? `· ${msg.time}` : ''}
                    </span>
                    <div className="bg-[#f59e0b] text-[#140e04] p-4 rounded-2xl rounded-tr-sm text-xs sm:text-sm font-['Inter'] font-semibold leading-relaxed shadow-sm">
                      {msg.text}
                    </div>
                  </div>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen w-full bg-[#080c16] text-[#dee1f7] font-['Inter'] selection:bg-[#f59e0b]/30 selection:text-[#ffc174] flex flex-col justify-between">
      {/* Compact Top Header */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-8 pt-5 pb-3">
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-[#161f33]/80">
          <div className="flex items-center gap-3">
            {/* Small Logo */}
            <div className="w-8 h-8 rounded-lg bg-[#252939] border border-[#f59e0b]/50 flex items-center justify-center shadow-sm shrink-0">
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 text-[#f59e0b]"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.27 20a2 2 0 0 0 3.46 0l8-14A2 2 0 0 0 20 3H4a2 2 0 0 0-1.73 3Z" fill="none" />
              </svg>
            </div>
            {/* Company Name From Account */}
            <div>
              <span className="font-['Space_Grotesk'] text-base sm:text-lg font-bold text-slate-100 tracking-tight block">
                {companyName}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 font-['JetBrains_Mono'] text-[11px] sm:text-xs text-slate-400 tracking-wider">
              <span className="w-2 h-2 rounded-full bg-[#f59e0b] shadow-[0_0_8px_rgba(245,158,11,0.8)] animate-pulse"></span>
              <span>REFRESHES EVERY 60S</span>
            </div>

            {/* Account Menu Containing Sign Out */}
            <div className="relative" ref={accountMenuRef}>
              <button
                type="button"
                onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[#111728] border border-[#212b42] hover:border-[#314060] text-slate-300 hover:text-white transition-colors cursor-pointer text-xs font-['Inter'] shadow-sm"
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="true"
              >
                <div className="w-5 h-5 rounded-full bg-[#1e273d] border border-[#2d3a5a] flex items-center justify-center text-[10px] font-bold text-[#ffc174] shrink-0">
                  {companyName ? companyName.charAt(0).toUpperCase() : 'U'}
                </div>
                <span className="font-medium text-slate-300 max-w-[120px] sm:max-w-[180px] truncate hidden xs:inline">
                  {userEmail || companyName}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${isAccountMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isAccountMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl bg-[#0f1422] border border-[#222c42] shadow-[0_12px_32px_rgba(0,0,0,0.65)] py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3.5 py-2.5 border-b border-[#1b2336]">
                    <p className="font-['Space_Grotesk'] text-xs font-bold text-slate-200 truncate">
                      {companyName}
                    </p>
                    <p className="font-['JetBrains_Mono'] text-[11px] text-slate-400 truncate mt-0.5">
                      {userEmail}
                    </p>
                  </div>
                  <div className="p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAccountMenuOpen(false);
                        if (onSignOut) onSignOut();
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-['Inter'] text-slate-300 hover:text-red-400 hover:bg-[#192236] rounded-lg transition-colors cursor-pointer text-left"
                    >
                      <LogOut className="w-3.5 h-3.5 text-slate-400 group-hover:text-red-400 shrink-0" />
                      <span className="font-medium">Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Compact Left-Aligned Tabs Control */}
        <div className="flex items-center justify-between gap-4 mt-4 mb-5">
          <div className="inline-flex items-center bg-[#0a0e19] border border-[#1b2336] rounded-xl p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab('overview')}
              className={`px-4 py-2 rounded-lg font-['Space_Grotesk'] text-xs sm:text-sm font-bold transition-all cursor-pointer text-center ${
                activeTab === 'overview'
                  ? 'bg-[#141b2c] border border-[#26324d] text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('conversations')}
              className={`px-4 py-2 rounded-lg font-['Space_Grotesk'] text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center gap-2 ${
                activeTab === 'conversations'
                  ? 'bg-[#141b2c] border border-[#26324d] text-white shadow-sm'
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
                {unreadCount}
              </span>
            </button>
          </div>
        </div>

        {/* MAIN BODY: OVERVIEW OR CONVERSATIONS */}
        {activeTab === 'overview' ? (
          /* OVERVIEW VIEW */
          <div className="space-y-4 animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1">
              <div className="font-['JetBrains_Mono'] text-xs text-slate-400 uppercase tracking-widest pl-1">
                {timeWindow === '24h' ? 'Last 24 hours' : timeWindow === '7d' ? 'Last 7 days' : 'Last 30 days'}
              </div>

              {/* Time-window switch for 24 hours, 7 days and 30 days */}
              <div className="inline-flex items-center bg-[#0a0e19] border border-[#1b2336] rounded-xl p-1 shadow-sm self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setTimeWindow('24h')}
                  className={`px-3 py-1.5 rounded-lg font-['JetBrains_Mono'] text-xs font-semibold transition-all cursor-pointer ${
                    timeWindow === '24h'
                      ? 'bg-[#151c2d] text-[#ffc174] border border-[#ffc174]/20 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  24 hours
                </button>
                <button
                  type="button"
                  onClick={() => setTimeWindow('7d')}
                  className={`px-3 py-1.5 rounded-lg font-['JetBrains_Mono'] text-xs font-semibold transition-all cursor-pointer ${
                    timeWindow === '7d'
                      ? 'bg-[#151c2d] text-[#ffc174] border border-[#ffc174]/20 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  7 days
                </button>
                <button
                  type="button"
                  onClick={() => setTimeWindow('30d')}
                  className={`px-3 py-1.5 rounded-lg font-['JetBrains_Mono'] text-xs font-semibold transition-all cursor-pointer ${
                    timeWindow === '30d'
                      ? 'bg-[#151c2d] text-[#ffc174] border border-[#ffc174]/20 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  30 days
                </button>
              </div>
            </div>

            {leads.length === 0 ? (
              /* Empty State when there are no leads */
              <div className="rounded-2xl border border-[#182133] bg-[#0b101c] p-12 text-center flex flex-col items-center justify-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#131929] border border-[#222c44] flex items-center justify-center text-slate-500 mb-1">
                  <Inbox className="w-6 h-6" />
                </div>
                <p className="font-['Inter'] text-sm text-slate-300 max-w-xs leading-relaxed">
                  No missed calls yet. When someone misses you, they'll show up here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Card 1: Response Speed */}
                <div className="bg-[#0b101c] border border-[#192236] rounded-2xl p-6 sm:p-7 flex flex-col justify-between min-h-[160px] shadow-sm hover:border-[#273552] transition-colors">
                  <div className="font-['JetBrains_Mono'] text-xs font-bold tracking-[0.16em] uppercase text-slate-400">
                    RESPONSE SPEED
                  </div>
                  <div className="my-2">
                    <div className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-extrabold text-[#ffc174]">
                      {formattedResponseTime}
                    </div>
                  </div>
                  <div className="font-['Inter'] text-xs text-slate-400">
                    Average response time.
                  </div>
                </div>

                {/* Card 2: Calls Rescued / Captured */}
                <div className="bg-[#0b101c] border border-[#192236] rounded-2xl p-6 sm:p-7 flex flex-col justify-between min-h-[160px] shadow-sm hover:border-[#273552] transition-colors">
                  <div className="font-['JetBrains_Mono'] text-xs font-bold tracking-[0.16em] uppercase text-slate-400">
                    CALLS RESCUED
                  </div>
                  <div className="my-2">
                    <div className="font-['Space_Grotesk'] text-3xl sm:text-4xl font-extrabold text-slate-100">
                      {callsCapturedCount}
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
                      {formattedPipelineValue}
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
                      {bookingRate}%
                    </div>
                  </div>
                  <div className="font-['Inter'] text-xs text-slate-400">
                    {`${bookedCount} of ${callsCapturedCount} missed calls booked.`}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* CONVERSATIONS VIEW */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start animate-in fade-in duration-150">
            {/* Left Column: Leads List */}
            <div className="lg:col-span-5 space-y-3.5">
              {isLoading ? (
                /* Loading State */
                <div className="rounded-2xl border border-[#182133] bg-[#0b101c] p-12 text-center flex flex-col items-center justify-center space-y-4">
                  <div className="w-10 h-10 rounded-xl bg-[#252939] border border-[#f59e0b]/50 flex items-center justify-center shadow-sm">
                    <div className="w-5 h-5 border-2 border-[#f59e0b] border-t-transparent rounded-full animate-spin" />
                  </div>
                  <p className="font-['JetBrains_Mono'] text-xs uppercase tracking-wider text-slate-400 font-bold">
                    Loading conversations…
                  </p>
                </div>
              ) : error ? (
                /* Error State with Retry Button */
                <div className="rounded-2xl border border-red-900/40 bg-[#121727] p-8 text-center space-y-4 shadow-sm">
                  <div className="w-10 h-10 rounded-xl bg-red-950/50 border border-red-800/40 flex items-center justify-center mx-auto text-red-400">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-['Space_Grotesk'] text-base font-bold text-slate-200">
                      Failed to load conversations
                    </h3>
                    <p className="font-['Inter'] text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                      {error}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchLeads}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#f59e0b] hover:bg-[#fbbf24] text-[#150f05] font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Retry
                  </button>
                </div>
              ) : leads.length === 0 ? (
                /* Empty State */
                <div className="rounded-2xl border border-[#182133] bg-[#0b101c] p-12 text-center flex flex-col items-center justify-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#131929] border border-[#222c44] flex items-center justify-center text-slate-500 mb-1">
                    <Inbox className="w-6 h-6" />
                  </div>
                  <p className="font-['Inter'] text-sm text-slate-300 max-w-xs leading-relaxed">
                    No missed calls yet. When someone misses you, they'll show up here.
                  </p>
                </div>
              ) : (
                /* Real Leads List */
                leads.map((lead) => {
                  const isSelected = selectedLeadId === lead.id;
                  const isUnread = Boolean(lead.unread);

                  return (
                    <div
                      key={lead.id}
                      onClick={() => handleOpenLead(lead.id)}
                      className={`rounded-2xl border p-5 transition-all duration-150 cursor-pointer text-left relative overflow-hidden ${
                        isSelected
                          ? 'bg-[#12192b] border-[#f59e0b]/50 shadow-[0_8px_24px_rgba(0,0,0,0.4)]'
                          : 'bg-[#0b101c] border-[#182133] hover:border-[#273550] hover:bg-[#0e1424]'
                      }`}
                    >
                      {/* Top Row: Indicator + Name + Priority + Time */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2.5">
                          {isUnread && (
                            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shrink-0 shadow-[0_0_8px_rgba(245,158,11,0.8)]" />
                          )}
                          <span
                            className={`font-['Space_Grotesk'] text-base sm:text-lg text-slate-100 ${
                              isUnread ? 'font-bold' : 'font-medium'
                            }`}
                          >
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
                        {lead.bookedTime && (
                          <div className="inline-flex items-center gap-1.5 font-['JetBrains_Mono'] text-xs text-slate-300 bg-[#121727] border border-[#212b42] px-2.5 py-1 rounded-lg">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            <span>Booked {lead.bookedTime}</span>
                          </div>
                        )}

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
                })
              )}
            </div>

            {/* Right Column: Conversation Viewer or Empty State */}
            <div className="lg:col-span-7">
              {selectedLead ? (
                /* Active Lead Conversation Thread */
                <div className="rounded-2xl sm:rounded-3xl bg-[#0b101c] border border-[#192236] shadow-xl overflow-hidden flex flex-col min-h-[580px]">
                  {/* Detailed Thread Header */}
                  <div className="p-5 sm:p-6 bg-[#0f1524] border-b border-[#1c263c] space-y-3.5">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <h2 className="font-['Space_Grotesk'] text-xl sm:text-2xl font-black text-slate-100">
                            {selectedLead.name}
                          </h2>
                          {selectedLead.isPriority && (
                            <span className="font-['JetBrains_Mono'] text-[10px] uppercase font-extrabold tracking-wider bg-[#221c13] text-[#ffc174] border border-[#f59e0b]/40 px-2 py-0.5 rounded">
                              PRIORITY
                            </span>
                          )}
                        </div>

                        {/* Address & Tappable Phone */}
                        <div className="flex items-center gap-2.5 text-xs sm:text-sm text-slate-400 flex-wrap">
                          <div className="flex items-center gap-1 text-slate-300">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            <span>{selectedLead.address}</span>
                          </div>
                          {selectedLead.phone && (
                            <>
                              <span>·</span>
                              <a
                                href={`tel:${selectedLead.phone}`}
                                className="inline-flex items-center gap-1 font-['JetBrains_Mono'] text-slate-300 hover:text-[#ffc174] transition-colors underline-offset-2 hover:underline"
                                title="Click to call"
                              >
                                <Phone className="w-3 h-3 text-[#f59e0b]" />
                                <span>{selectedLead.phone}</span>
                              </a>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedLead.bookedTime && (
                          <div className="font-['JetBrains_Mono'] text-xs bg-[#121727] border border-[#f59e0b]/40 text-[#ffc174] px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>Booked: {selectedLead.bookedTime}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={handleCloseLead}
                          className="p-1.5 rounded-lg bg-[#141b2b] hover:bg-[#1f283d] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                          title="Close conversation"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Metadata Strip: Insurance & Intent Line */}
                    <div className="pt-2 border-t border-[#1a2337] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Shield className="w-3.5 h-3.5 text-[#ffc174] shrink-0" />
                        <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-wider text-slate-500">
                          Insurance:
                        </span>
                        <span className="font-['Inter'] text-slate-200 font-medium">
                          {selectedLead.insurance || 'Not provided'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 text-slate-400 truncate">
                        <FileText className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="font-['JetBrains_Mono'] text-[11px] uppercase tracking-wider text-slate-500">
                          Intent:
                        </span>
                        <span className="font-['Inter'] text-slate-300 truncate max-w-sm">
                          {selectedLead.intent}
                        </span>
                      </div>
                    </div>

                    {/* Neutral Photo Attachment Tiles */}
                    {activeAttachments.length > 0 && (
                      <div className="pt-2 border-t border-[#1a2337]">
                        <div className="font-['JetBrains_Mono'] text-[10px] uppercase tracking-wider text-slate-500 mb-2 font-bold">
                          Attached Photos ({activeAttachments.length})
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {activeAttachments.map((att, idx) => (
                            <div
                              key={att.id || idx}
                              className="bg-[#121727] border border-[#212b42] rounded-xl p-2.5 flex items-center gap-2.5 text-slate-300 shadow-sm"
                            >
                              <div className="w-7 h-7 rounded-lg bg-[#182033] border border-[#2b3855] flex items-center justify-center text-slate-400 shrink-0">
                                <ImageIcon className="w-3.5 h-3.5 text-[#f59e0b]" />
                              </div>
                              <span className="font-['JetBrains_Mono'] text-xs font-bold text-slate-200 truncate">
                                Photo {idx + 1}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Message Thread Body */}
                  <div className="p-5 sm:p-6 space-y-4 flex-1 overflow-y-auto max-h-[440px]">
                    {isLoadingThread ? (
                      <div className="py-12 text-center flex flex-col items-center justify-center space-y-3">
                        <div className="w-6 h-6 border-2 border-[#f59e0b] border-t-transparent rounded-full animate-spin" />
                        <p className="font-['JetBrains_Mono'] text-xs text-slate-500">
                          Loading messages…
                        </p>
                      </div>
                    ) : (
                      renderMessageList()
                    )}
                  </div>

                  {/* SMS Quick Reply Box */}
                  <div className="p-4 bg-[#0d121f] border-t border-[#1a2337] flex items-center gap-3">
                    <input
                      type="text"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder={`Send a text message to ${selectedLead.firstName}...`}
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
                /* Empty Selection State Matching Screenshot */
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
    </div>
  );
};
