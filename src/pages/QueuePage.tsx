import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, RotateCcw } from 'lucide-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { NotFoundPage } from './NotFoundPage';
import { DashboardBody, DashboardLead, DashboardStats } from '../components/DashboardBody';

/* ---------- time helpers (use the ACCOUNT's time zone, not the browser's) ---------- */

const dayKey = (d: Date, tz: string) => d.toLocaleDateString('en-CA', { timeZone: tz });

const clock = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });

const shortClock = (iso: string, tz: string) => clock(iso, tz).replace(':00', '');

function relDay(d: Date, tz: string, long = false): string {
  const k = dayKey(d, tz);
  const now = Date.now();
  if (k === dayKey(new Date(now), tz)) return 'Today';
  if (k === dayKey(new Date(now + 86400000), tz)) return 'Tomorrow';
  if (k === dayKey(new Date(now - 86400000), tz)) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: long ? 'long' : 'short', timeZone: tz });
}

function ago(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const mb = (bytes?: number | null) => (bytes ? `${(bytes / 1048576).toFixed(1)} MB` : '');

const money = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

function formatResponse(sec: number): string {
  if (!sec) return '0s';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m === 0 ? `${s}s` : `${m}m ${s < 10 ? '0' : ''}${s}s`;
}

/* ---------- row types ---------- */

interface LeadRow {
  id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  insurance_carrier: string | null;
  payment_type: string;
  priority: boolean;
  unread: boolean;
  estimated_value: number | null;
  missed_call_at: string | null;
  response_seconds: number | null;
  created_at: string;
  appointments: { starts_at: string; status: string }[];
  attachments: { id: string }[];
  messages: { sent_at: string }[];
}

interface MessageRow {
  id: string;
  sender: string;
  body: string | null;
  sent_at: string;
}

interface AttachmentRow {
  id: string;
  message_id: string | null;
  file_name: string | null;
  size_bytes: number | null;
}

interface Thread {
  messages: MessageRow[];
  attachments: AttachmentRow[];
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
  userEmail = '',
  selectedConversationId = null,
}) => {
  const [companyName, setCompanyName] = useState('');
  const [tz, setTz] = useState('America/Chicago');
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(selectedConversationId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /* close the account menu on outside click */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  useEffect(() => {
    setSelectedLeadId(selectedConversationId);
  }, [selectedConversationId]);

  /* account name and time zone (row-level security returns only the user's own account) */
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase
      .from('accounts')
      .select('name, timezone')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) setCompanyName(data.name);
        if (data?.timezone) setTz(data.timezone);
      });
  }, []);

  /* leads list (light query: no message bodies) */
  const loadLeads = useCallback(async (silent = false) => {
    if (!isSupabaseConfigured) {
      setError('The dashboard is not connected to its database. Contact support.');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    const { data, error: err } = await supabase
      .from('leads')
      .select('*, appointments(starts_at, status), attachments(id), messages(sent_at)');
    if (err) {
      if (!silent) setError(err.message || 'Failed to load conversations.');
    } else {
      setError(null);
      setRows((data as unknown as LeadRow[]) || []);
    }
    setLoading(false);
  }, []);

  /* one thread */
  const loadThread = useCallback(async (leadId: string) => {
    const [m, a] = await Promise.all([
      supabase.from('messages').select('id, sender, body, sent_at').eq('lead_id', leadId).order('sent_at', { ascending: true }),
      supabase.from('attachments').select('id, message_id, file_name, size_bytes').eq('lead_id', leadId),
    ]);
    if (!m.error && !a.error) {
      setThreads((prev) => ({
        ...prev,
        [leadId]: { messages: (m.data as MessageRow[]) || [], attachments: (a.data as AttachmentRow[]) || [] },
      }));
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  /* refresh every 60 seconds (this makes the "refreshes every 60s" label true) */
  useEffect(() => {
    const t = setInterval(() => {
      loadLeads(true);
      if (selectedLeadId) loadThread(selectedLeadId);
    }, 60000);
    return () => clearInterval(t);
  }, [loadLeads, loadThread, selectedLeadId]);

  /* open a lead: load its thread */
  useEffect(() => {
    if (!selectedLeadId) return;
    loadThread(selectedLeadId);
  }, [selectedLeadId, loadThread]);

  /* mark a lead read (one place only) */
  const markRead = useCallback(async (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, unread: false } : r)));
    await supabase.from('leads').update({ unread: false }).eq('id', id);
  }, []);

  /* a lead opened straight from the address bar should also be marked read */
  useEffect(() => {
    if (!selectedLeadId) return;
    const row = rows.find((r) => r.id === selectedLeadId);
    if (row?.unread) markRead(selectedLeadId);
  }, [selectedLeadId, rows, markRead]);

  const handleSelect = (id: string) => {
    setSelectedLeadId(id);
    if (onNavigate) onNavigate(`/conversations/${id}`);
    else window.history.pushState({}, '', `/conversations/${id}`);
  };

  // FIX 3: the in-app Back button clears the selection and returns the address to /queue
  const handleBack = () => {
    setSelectedLeadId(null);
    if (onNavigate) onNavigate('/queue');
    else window.history.pushState({}, '', '/queue');
  };

  /* ---------- map rows to what DashboardBody expects ---------- */

  const latest = (r: LeadRow) =>
    r.messages.reduce((mx, m) => (m.sent_at > mx ? m.sent_at : mx), r.missed_call_at || r.created_at);

  const sortedRows = [...rows].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    return latest(b).localeCompare(latest(a));
  });

  const leads: DashboardLead[] = sortedRows.map((r) => {
    const appt = [...r.appointments]
      .filter((x) => x.status !== 'cancelled')
      .sort((x, y) => x.starts_at.localeCompare(y.starts_at))[0];
    const when = appt ? new Date(appt.starts_at) : null;
    const thread = threads[r.id];
    const place = [r.address, r.city].filter(Boolean).join(', ');

    let transcript: DashboardLead['chatTranscript'] = [];
    if (thread) {
      let lastDay = '';
      transcript = thread.messages.map((m) => {
        const d = new Date(m.sent_at);
        const k = dayKey(d, tz);
        const showDay = k !== lastDay;
        lastDay = k;
        return {
          sender: m.sender === 'homeowner' ? 'homeowner' : 'wedge',
          text: m.body || '',
          time: clock(m.sent_at, tz),
          hasAttachment: thread.attachments.some((a) => a.message_id === m.id),
          dayDivider: showDay ? relDay(d, tz, true) : undefined,
        };
      });
    }

    const missed = r.missed_call_at ? new Date(r.missed_call_at) : null;
    const missedLabel = missed
      ? (dayKey(missed, tz) === dayKey(new Date(), tz) ? '' : `${relDay(missed, tz)} · `) + clock(r.missed_call_at!, tz)
      : undefined;

    return {
      id: r.id,
      name: r.name || 'Unnamed lead',
      phone: r.phone || '',
      address: place || 'No address provided',
      timeAgo: ago(latest(r)),
      priority: r.priority,
      unread: r.unread,
      missedCallTime: missedLabel,
      conversationTag: {
        icon: 'calendar',
        label: when ? `Booked ${relDay(when, tz)} ${shortClock(appt!.starts_at, tz)}` : 'Not booked yet',
      },
      secondaryTag: r.attachments.length
        ? { icon: 'photos', label: `${r.attachments.length} ${r.attachments.length === 1 ? 'Photo' : 'Photos'}` }
        : undefined,
      attachments: (thread?.attachments || []).map((a) => ({
        name: a.file_name || 'Photo',
        size: mb(a.size_bytes),
      })),
      insurance: r.payment_type === 'out_of_pocket' ? 'Out of pocket' : r.insurance_carrier || 'Not specified',
      scheduledTime: when ? `${relDay(when, tz, true)} at ${clock(appt!.starts_at, tz)}` : '',
      chatTranscript: transcript,
    };
  });

  /* ---------- overview numbers, last 24 hours, from the data ---------- */

  const cutoff = Date.now() - 24 * 3600 * 1000;
  const captured = rows.filter((r) => new Date(r.missed_call_at || r.created_at).getTime() >= cutoff);
  const booked = captured.filter((r) => r.appointments.some((a) => a.status !== 'cancelled'));
  const responses = captured.map((r) => r.response_seconds || 0).filter((s) => s > 0);
  const avgResponse = responses.length ? Math.round(responses.reduce((x, y) => x + y, 0) / responses.length) : 0;

  const stats: DashboardStats = {
    responseSpeed: formatResponse(avgResponse),
    callsRescued: String(captured.length),
    pipelineValue: money(booked.reduce((s, r) => s + (r.estimated_value || 0), 0)),
    bookingRate: `${captured.length ? Math.round((booked.length / captured.length) * 100) : 0}%`,
    bookingDetail: `${booked.length} of ${captured.length} missed calls booked.`,
  };

  /* ---------- render ---------- */

  if (selectedConversationId && !loading && !error && !rows.some((r) => r.id === selectedConversationId)) {
    return <NotFoundPage onNavigate={onNavigate} />;
  }

  return (
    <div className="min-h-screen w-full bg-[#090e1c] text-[#dee1f7] font-['Inter']">
      {/* compact header */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-9 pt-5 pb-3 flex items-center justify-between gap-4">
        <span className="font-['Space_Grotesk'] text-lg font-bold text-slate-100 tracking-tight truncate">
          {companyName}
        </span>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 font-['JetBrains_Mono'] text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            <span className="h-1.5 w-1.5 rounded-full bg-[#ffc174] animate-pulse" />
            <span>Refreshes every 60s</span>
          </div>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#111728] border border-[#212b42] text-slate-300 text-xs"
              aria-expanded={menuOpen}
            >
              <span className="max-w-[140px] truncate hidden sm:inline">{userEmail}</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl bg-[#0f1422] border border-[#222c42] py-1.5 z-50">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onSignOut?.();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-300 hover:text-red-400 hover:bg-[#192236] text-left"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-24 text-center font-['JetBrains_Mono'] text-xs uppercase tracking-wider text-slate-400">
          Loading conversations…
        </div>
      ) : error ? (
        <div className="mx-auto max-w-md py-16 text-center space-y-4">
          <p className="text-sm text-slate-300">{error}</p>
          <button
            type="button"
            onClick={() => loadLeads()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#f59e0b] text-[#150f05] font-['Space_Grotesk'] font-bold text-xs uppercase tracking-wider"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <DashboardBody
          companyName={companyName}
          hideTitleRow
          initialMobileView={selectedConversationId ? 'chat' : 'list'}
          stats={stats}
          statsWindowLabel="Last 24 hours"
          leads={leads}
          selectedLeadId={selectedLeadId}
          onSelectLead={handleSelect}
          onBack={handleBack}
        />
      )}
    </div>
  );
};