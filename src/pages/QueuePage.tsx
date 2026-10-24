import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { accessApi, isConfigured, ownerApi } from '../api';
import { NotFoundPage } from './NotFoundPage';
import { DashboardBody, DashboardLead, DashboardStats, WindowKey } from '../components/DashboardBody';
import { LeadStatus } from '../components/LeadStatusControl';
import { buildChart } from '../lib/chart';
import { AppHeader } from '../components/AppHeader';
import { PlatformFooter } from '../components/PlatformFooter';
import { useSynced } from '../lib/sync';
import { getCachedCompany, setCachedCompany, setCachedSetup } from '../lib/accountCache';
import {
  ContactType, activeUrgency, buildDetails, compareByUrgency, eventLabel, isCountedLead, normalizeType, whyWithYou,
} from '../lib/leadView';

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

function whenLabel(iso: string, tz: string): string {
  const day = relDay(new Date(iso), tz);
  return day === 'Today' ? clock(iso, tz) : `${day} ${shortClock(iso, tz)}`;
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
  status: string;
  final_value: number | null;
  job_type: string | null;
  status_changed_by: string;
  status_changed_at: string;
  estimated_value: number | null;
  missed_call_at: string | null;
  response_seconds: number | null;
  created_at: string;
  urgency?: string | null;
  urgency_reason?: string | null;
  contact_type?: string | null;
  phone_e164?: string | null;
  appointments: { starts_at: string; status: string }[];
  attachments: { id: string }[];
  messages: { sent_at: string }[];
}

interface LeadStateRow {
  lead_id: string;
  stage: string | null;
  collected: Record<string, unknown> | null;
  handoff_reason: string | null;
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

interface EventRow {
  id: string;
  event_type: string;
  detail: string | null;
  actor: string;
  created_at: string;
}

interface Thread {
  messages: MessageRow[];
  attachments: AttachmentRow[];
  events: EventRow[];
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
  const [companyName, setCompanyName] = useState(getCachedCompany(userEmail));
  const [tz, setTz] = useState('America/Chicago');
  const [jobValues, setJobValues] = useState<Record<string, number>>({});
  const [accountStatus, setAccountStatus] = useState('live');
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [threads, setThreads] = useState<Record<string, Thread>>({});
  const [states, setStates] = useState<Record<string, LeadStateRow>>({});
  const [reviewPhones, setReviewPhones] = useState<Set<string>>(new Set());
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(selectedConversationId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowKey, setWindowKey] = useState<WindowKey>('7d');
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setSelectedLeadId(selectedConversationId);
  }, [selectedConversationId]);

  /* account name and time zone (row-level security returns only the user's own account) */
  useEffect(() => {
    if (!isConfigured) return;
    ownerApi.account.summary()
      .then(({ data }) => {
        if (data?.name) {
          setCompanyName(data.name);
          setCachedCompany(userEmail, data.name);
        }
        if (data?.timezone) setTz(data.timezone);
        if (data?.status) {
          setAccountStatus(data.status);
          setCachedSetup(userEmail, data.status === 'setup');
        }
      });
  }, []);

  useEffect(() => {
    if (!isConfigured) return;
    ownerApi.settings.jobValues()
      .then(({ data }) => {
        const map: Record<string, number> = {};
        (data || []).forEach((r: { job_type: string; typical_value: number }) => {
          map[r.job_type] = Number(r.typical_value);
        });
        setJobValues(map);
      });
  }, []);

  // admins get a link to the admin page; an admin login with no client account goes straight there
  useEffect(() => {
    if (!isConfigured) return;
    (async () => {
      if (!(await accessApi.isAdmin())) return;
      setIsAdmin(true);
      if (!(await accessApi.hasClientAccount())) {
        if (onNavigate) onNavigate('/admin');
        else window.location.assign('/admin');
      }
    })();
  }, []);

  /* extras for the list: what the assistant learned, and which numbers are waiting to be confirmed.
     A problem here never hides the leads themselves. */
  const loadExtras = useCallback(async () => {
    const [st, ct] = await Promise.all([
      ownerApi.leads.states(),
      ownerApi.leads.numbersToConfirm(),
    ]);
    if (!st.error) {
      const map: Record<string, LeadStateRow> = {};
      ((st.data as LeadStateRow[]) || []).forEach((x) => (map[x.lead_id] = x));
      setStates(map);
    }
    if (!ct.error) {
      setReviewPhones(new Set(((ct.data as { phone_e164: string }[]) || []).map((x) => x.phone_e164)));
    }
  }, []);

  /* leads list (light query: no message bodies) */
  const loadLeads = useCallback(async (silent = false) => {
    if (!isConfigured) {
      setError('The dashboard is not connected to its database. Contact support.');
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    const { data, error: err } = await ownerApi.leads.list();
    if (err) {
      if (!silent) setError(err.message || 'Failed to load conversations.');
    } else {
      setError(null);
      setRows((data as unknown as LeadRow[]) || []);
      loadExtras();
    }
    setLoading(false);
  }, [loadExtras]);

  /* one thread */
    const loadThread = useCallback(async (leadId: string) => {
    const [m, a, ev] = await Promise.all([
      ownerApi.leads.messages(leadId),
      ownerApi.leads.attachments(leadId),
      ownerApi.leads.events(leadId),
    ]);
    if (!m.error && !a.error) {
      setThreads((prev) => ({
        ...prev,
        [leadId]: {
          messages: (m.data as MessageRow[]) || [],
          attachments: (a.data as AttachmentRow[]) || [],
          // a problem loading events should never hide the conversation itself
          events: ev.error ? [] : ((ev.data as EventRow[]) || []),
        },
      }));
    }
  }, []);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  /* open a lead: load its thread */
  useEffect(() => {
    if (!selectedLeadId) return;
    loadThread(selectedLeadId);
  }, [selectedLeadId, loadThread]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadLeads(true), selectedLeadId ? loadThread(selectedLeadId) : Promise.resolve()]);
  }, [loadLeads, loadThread, selectedLeadId]);

  // the one main Sync keeps this page fresh (on a timer, when you come back to the tab, and when you press Sync)
  useSynced(refreshAll, selectedLeadId ?? '', { initial: false });

  /* mark a lead read (one place only) */
  const markRead = useCallback(async (id: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, unread: false } : r)));
    await ownerApi.leads.markRead(id);
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

   const handleChangeStatus = async (
    id: string,
    status: LeadStatus,
    finalValue: number | null
  ): Promise<string | null> => {
    const before = rows.find((r) => r.id === id);
    if (!before) return 'Lead not found.';
    const nextValue = status === 'won' ? finalValue : null;
    const nowIso = new Date().toISOString();

    // show the change immediately
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, status, final_value: nextValue, status_changed_by: 'owner', status_changed_at: nowIso }
          : r
      )
    );

    const { error: err } = await ownerApi.leads.changeStatus(id, status, nextValue);

    if (err) {
      // put it back if it did not save
      setRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? {
                ...r,
                status: before.status,
                final_value: before.final_value,
                status_changed_by: before.status_changed_by,
                status_changed_at: before.status_changed_at,
              }
            : r
        )
      );
            return 'Could not save. Check your connection and try again.';
    }
    await loadThread(id); // show the new "You marked this…" line right away
    return null;
  };

  const handleChangeType = async (id: string, type: ContactType): Promise<string | null> => {
    if (!rows.some((r) => r.id === id)) return 'Lead not found.';
    const { error: err } = await ownerApi.leads.setType(id, type);
    if (err) return 'Could not save. Check your connection and try again.';
    // the status can change with the type (vendors are filed as not a lead), so reload everything
    await Promise.all([loadLeads(true), loadThread(id)]);
    return null;
  };

  /* ---------- map rows to what DashboardBody expects ---------- */

  const latest = (r: LeadRow) =>
    r.messages.reduce((mx, m) => (m.sent_at > mx ? m.sent_at : mx), r.missed_call_at || r.created_at);

  // emergencies first, then urgent, then everything else, newest first inside each group
  const urgencyNow = (r: LeadRow) => activeUrgency(r);
  const sortedRows = [...rows].sort((a, b) => compareByUrgency(urgencyNow(a), urgencyNow(b), latest(a), latest(b)));

  const leads: DashboardLead[] = sortedRows.map((r) => {
    const appt = [...r.appointments]
      .filter((x) => x.status !== 'cancelled')
      .sort((x, y) => x.starts_at.localeCompare(y.starts_at))[0];
    const when = appt ? new Date(appt.starts_at) : null;
    const thread = threads[r.id];
    const place = [r.address, r.city].filter(Boolean).join(', ');
    const type = normalizeType(r.contact_type);
    const learned = states[r.id];

    let transcript: DashboardLead['chatTranscript'] = [];
    if (thread) {
      type Item =
        | { kind: 'message'; at: string; m: MessageRow }
        | { kind: 'event'; at: string; e: EventRow };

      // messages and events in one timeline, oldest first; messages come first when the time is identical
      const items: Item[] = [
        ...thread.messages.map((m): Item => ({ kind: 'message', at: m.sent_at, m })),
        ...thread.events.map((e): Item => ({ kind: 'event', at: e.created_at, e })),
      ].sort((a, b) => {
        const diff = new Date(a.at).getTime() - new Date(b.at).getTime();
        if (diff !== 0) return diff;
        return a.kind === b.kind ? 0 : a.kind === 'message' ? -1 : 1;
      });

      let lastDay = '';
      transcript = items.map((it) => {
        const d = new Date(it.at);
        const k = dayKey(d, tz);
        const showDay = k !== lastDay;
        lastDay = k;
        const dayDivider = showDay ? relDay(d, tz, true) : undefined;

        if (it.kind === 'event') {
          return {
            kind: 'event' as const,
            eventActor:
              it.e.actor === 'owner'
                ? ('owner' as const)
                : it.e.actor === 'support'
                ? ('support' as const)
                : ('system' as const),
            sender: 'wedge' as const,
            text: eventLabel(it.e),
            time: clock(it.at, tz),
            dayDivider,
          };
        }
        return {
          kind: 'message' as const,
          sender: it.m.sender === 'homeowner' ? ('homeowner' as const) : ('wedge' as const),
          text: it.m.body || '',
          time: clock(it.at, tz),
          hasAttachment: thread.attachments.some((a) => a.message_id === it.m.id),
          dayDivider,
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
      priority: urgencyNow(r) !== 'normal',
      urgency: urgencyNow(r),
      urgencyReason: r.urgency_reason || undefined,
      contactType: type,
      needsReview: Boolean(r.phone_e164 && reviewPhones.has(r.phone_e164)),
      details: buildDetails({ collected: learned?.collected ?? null, photoCount: r.attachments.length }),
      whyWithYou: whyWithYou(learned?.handoff_reason, type),
      unread: r.unread,
      status: (r.status as LeadStatus) || 'booked',
      finalValue: r.final_value,
      statusChangedBy:
      r.status_changed_by === 'owner' ? 'owner' : r.status_changed_by === 'support' ? 'support' : 'system',
      statusChangedLabel: r.status_changed_at ? whenLabel(r.status_changed_at, tz) : '',
      missedCallTime: missedLabel,
      conversationTag: {
        icon: 'calendar',
        label: when
          ? `Booked ${relDay(when, tz)} ${shortClock(appt!.starts_at, tz)}`
          : type === 'supplier' || type === 'crew' || type === 'other'
          ? 'Vendor, not booked'
          : type === 'past_client' || type === 'recurring_client'
          ? 'Flagged for you'
          : 'Not booked yet',
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

   const estimateOf = (r: LeadRow): number => {
    // a won job counts for what it actually sold for
    if (r.status === 'won' && typeof r.final_value === 'number') return r.final_value;
    // an estimate the owner entered after seeing the roof
    if (typeof r.estimated_value === 'number') return r.estimated_value;
    // otherwise: the owner's typical value for this kind of job
    const key = (r.job_type || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    return jobValues[key] || 0;
  };

  const windowHours = windowKey === '24h' ? 24 : windowKey === '7d' ? 24 * 7 : 24 * 30;
  const cutoff = Date.now() - windowHours * 3600 * 1000;
  const windowLabel =
    windowKey === '24h' ? 'Last 24 hours' : windowKey === '7d' ? 'Last 7 days' : 'Last 30 days';
    // "Not a lead" (vendors, existing customers, spam) is not a missed lead
  // only homeowners count: vendors and existing customers are flagged for you, not part of the booking numbers
  const captured = rows.filter((r) => isCountedLead(r) && new Date(r.missed_call_at || r.created_at).getTime() >= cutoff);
  // a lead marked Lost is no longer pipeline
  const booked = captured.filter(
    (r) => r.status !== 'lost' && r.appointments.some((a) => a.status !== 'cancelled')
  );
  const responses = captured.map((r) => r.response_seconds || 0).filter((s) => s > 0);
  const avgResponse = responses.length ? Math.round(responses.reduce((x, y) => x + y, 0) / responses.length) : 0;

  const stats: DashboardStats = {
    responseSpeed: avgResponse ? formatResponse(avgResponse) : '—',
    callsRescued: String(captured.length),
    pipelineValue: money(booked.reduce((s, r) => s + estimateOf(r), 0)),
    bookingRate: captured.length ? `${Math.round((booked.length / captured.length) * 100)}%` : '—',
    bookingDetail: captured.length
      ? `${booked.length} of ${captured.length} missed calls booked.`
      : 'No missed calls in this period.',
  };

    const chart = buildChart(rows.filter(isCountedLead), windowKey, tz);

  /* ---------- render ---------- */

  if (selectedConversationId && !loading && !error && !rows.some((r) => r.id === selectedConversationId)) {
    return <NotFoundPage onNavigate={onNavigate} />;
  }

  return (
    <div className="min-h-screen w-full bg-[#090e1c] text-[#dee1f7] font-body">
      <AppHeader
        companyName={companyName}
        userEmail={userEmail}
        current="dashboard"
        isAdmin={isAdmin}
        onNavigate={onNavigate}
        onSignOut={onSignOut}
        showSetup={accountStatus === 'setup'}
        hideTabs={Boolean(selectedLeadId)}
      />

      {loading ? (
        <div className="py-24 text-center font-body text-xs tracking-wide text-slate-400">
          Loading conversations…
        </div>
      ) : error ? (
        <div className="mx-auto max-w-md py-16 text-center space-y-4">
          <p className="text-sm text-slate-300">{error}</p>
          <button
            type="button"
            onClick={() => loadLeads()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#f59e0b] text-[#150f05] font-display font-bold text-xs tracking-wide"
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
          statsWindowLabel={windowLabel}
          windowKey={windowKey}
          onWindowChange={setWindowKey}
          chart={chart}
          leads={leads}
          selectedLeadId={selectedLeadId}
          onSelectLead={handleSelect}
          onBack={handleBack}
          onChangeStatus={handleChangeStatus}
          onChangeType={handleChangeType}
        />
      )}
      <PlatformFooter />
    </div>
  );
};