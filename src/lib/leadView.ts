// Pure helpers for how the owner's list is sorted, filtered and labelled.
// No React in here, so it can be tested on its own (engine-tests/ui.test.ts).

export type ContactType = 'unknown' | 'homeowner' | 'past_client' | 'recurring_client' | 'supplier' | 'crew' | 'other';
export type Urgency = 'emergency' | 'urgent' | 'normal';
export type LeadFilter = 'all' | 'homeowners' | 'past' | 'recurring' | 'vendors' | 'unsorted';

const TYPES: ContactType[] = ['unknown', 'homeowner', 'past_client', 'recurring_client', 'supplier', 'crew', 'other'];

export const TYPE_LABEL: Record<ContactType, string> = {
  unknown: 'Unsorted',
  homeowner: 'Homeowner',
  past_client: 'Past client',
  recurring_client: 'Recurring client',
  supplier: 'Supplier',
  crew: 'Crew',
  other: 'Other',
};

export const TYPE_HINT: Record<ContactType, string> = {
  unknown: 'Not sorted yet',
  homeowner: 'A new lead',
  past_client: 'We did work for them before',
  recurring_client: 'Regular or maintenance customer',
  supplier: 'Materials, deliveries, vendors',
  crew: 'Your own team',
  other: 'Not a customer',
};

/** The types an owner can pick. "Unsorted" is only ever a starting point. */
export const PICKABLE_TYPES: ContactType[] = ['homeowner', 'past_client', 'recurring_client', 'supplier', 'crew', 'other'];

export const FILTER_LABEL: Record<LeadFilter, string> = {
  all: 'All',
  homeowners: 'Homeowners',
  past: 'Past clients',
  recurring: 'Recurring',
  vendors: 'Vendors',
  unsorted: 'Unsorted',
};

export const FILTER_ORDER: LeadFilter[] = ['all', 'homeowners', 'past', 'recurring', 'vendors', 'unsorted'];

/** Rows from before the engine existed have no type. They were homeowners, so they stay homeowners. */
export function normalizeType(t?: string | null): ContactType {
  return TYPES.includes(t as ContactType) ? (t as ContactType) : 'homeowner';
}

export function filterOf(t: ContactType): LeadFilter {
  switch (t) {
    case 'past_client': return 'past';
    case 'recurring_client': return 'recurring';
    case 'supplier': case 'crew': case 'other': return 'vendors';
    case 'unknown': return 'unsorted';
    default: return 'homeowners';
  }
}

export function countByFilter(types: ContactType[]): Record<LeadFilter, number> {
  const c: Record<LeadFilter, number> = { all: types.length, homeowners: 0, past: 0, recurring: 0, vendors: 0, unsorted: 0 };
  for (const t of types) c[filterOf(t)] += 1;
  return c;
}

/** Owners who only ever get homeowners never see a filter bar. It appears the moment anything else shows up. */
export function showFilterBar(counts: Record<LeadFilter, number>): boolean {
  return counts.past + counts.recurring + counts.vendors + counts.unsorted > 0;
}

export function visibleFilters(counts: Record<LeadFilter, number>): LeadFilter[] {
  return FILTER_ORDER.filter((f) => f === 'all' || counts[f] > 0);
}

export function matchesFilter(t: ContactType, f: LeadFilter): boolean {
  return f === 'all' || filterOf(t) === f;
}

/* ---------- urgency ---------- */

export const URGENCY_RANK: Record<Urgency, number> = { emergency: 0, urgent: 1, normal: 2 };

/**
 * The words for each priority, used everywhere (list, conversation, details). There is no "low":
 * a routine call is simply not flagged, so nothing is shown for it.
 */
export const URGENCY_LABEL: Record<Urgency, string> = { emergency: 'Emergency', urgent: 'High priority', normal: 'Routine' };

export function normalizeUrgency(u?: string | null): Urgency {
  return u === 'emergency' || u === 'urgent' ? u : 'normal';
}

const ACTIVE_STATUSES = ['booked', 'following_up', 'needs_you'];

export interface UrgencyRow {
  status: string;
  priority?: boolean | null;
  urgency?: string | null;
  appointments: { starts_at: string; status: string }[];
}

/**
 * The priority a lead was given, whether or not it is still live. Use this to SHOW it (a won job was still an emergency).
 * Use activeUrgency to decide what needs attention NOW.
 */
export function recordedUrgency(r: { urgency?: string | null; priority?: boolean | null }): Urgency {
  const u = normalizeUrgency(r.urgency);
  return u === 'normal' && r.priority ? 'urgent' : u;
}

/** Urgency only counts while the lead is still live. Once every appointment is in the past, the urgent moment is over. */
export function activeUrgency(r: UrgencyRow, now: number = Date.now()): Urgency {
  if (!ACTIVE_STATUSES.includes(r.status)) return 'normal';
  const open = r.appointments.filter((a) => a.status !== 'cancelled');
  if (open.length > 0 && !open.some((a) => new Date(a.starts_at).getTime() >= now)) return 'normal';
  const u = normalizeUrgency(r.urgency);
  if (u === 'normal' && r.priority) return 'urgent'; // older leads only have the yes/no flag
  return u;
}

/** Emergencies first, then urgent, then everything else, newest first inside each group. */
export function compareByUrgency(aUrgency: Urgency, bUrgency: Urgency, aLatest: string, bLatest: string): number {
  const d = URGENCY_RANK[aUrgency] - URGENCY_RANK[bUrgency];
  return d !== 0 ? d : bLatest.localeCompare(aLatest);
}

/* ---------- what counts toward the numbers ---------- */

/** Only homeowners count toward missed calls rescued, pipeline and booking rate. Vendors and existing customers do not. */
export function isCountedLead(r: { status: string; contact_type?: string | null }): boolean {
  if (r.status === 'not_a_lead') return false;
  const t = normalizeType(r.contact_type);
  return t === 'homeowner' || t === 'unknown';
}

/* ---------- words ---------- */

export const REASON_LABEL: Record<string, string> = {
  asked_for_a_person: 'They asked for a person',
  upset_customer: 'They sound upset',
  legal: 'They mentioned legal action',
  commercial_job: 'Commercial job',
  cancel_request: 'They want to cancel',
  reschedule_request: 'They want to reschedule',
  prior_job_issue: 'A problem with a previous job',
  unclear_replies: 'Their replies were unclear',
  unclear_purpose: "It wasn't clear what they need",
  no_availability: 'No open inspection times',
  conversation_limit: 'Long conversation, needs a person',
  question_after_booking: 'They asked something after booking',
  cancel_unclear: 'Unclear if they want to cancel',
  non_english: 'They wrote in Spanish',
};

export function whyWithYou(handoffReason: string | null | undefined, type: ContactType): string | undefined {
  if (handoffReason === 'existing_customer' || type === 'past_client' || type === 'recurring_client') {
    if (handoffReason && handoffReason !== 'existing_customer' && REASON_LABEL[handoffReason]) return REASON_LABEL[handoffReason];
    if (handoffReason === 'existing_customer') return 'Existing customer. Flagged for you, not booked.';
    return undefined;
  }
  if (handoffReason === 'supplier' || type === 'supplier') return handoffReason ? 'Vendor call. Flagged, not booked.' : undefined;
  if (handoffReason) return REASON_LABEL[handoffReason] ?? 'Needs a person';
  return undefined;
}

export interface DetailRow { label: string; value: string }

/** What the assistant learned, in plain words. Name and address are already in the header. */
export function buildDetails(i: {
  collected?: Record<string, unknown> | null;
  photoCount: number;
  paymentType?: string | null;
  insuranceCarrier?: string | null;
}): DetailRow[] {
  const c = i.collected ?? {};
  const rows: DetailRow[] = [];
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : '');

  const issue = str(c.issue);
  if (issue) rows.push({ label: 'Needs', value: issue });
  if (typeof c.active_now === 'boolean') rows.push({ label: 'Happening now', value: c.active_now ? 'Yes, right now' : 'No' });

  const carrier = str(c.carrier) || str(i.insuranceCarrier);
  const pay = str(c.payment) || (i.paymentType && i.paymentType !== 'unknown' ? i.paymentType : '');
  if (pay === 'out_of_pocket') rows.push({ label: 'Paying', value: 'Out of pocket' });
  else if (pay === 'insurance' || carrier) rows.push({ label: 'Insurance', value: carrier ? `Claim, ${carrier}` : 'Claim' });

  const pref = str(c.preferred_time);
  if (pref) rows.push({ label: 'Preferred time', value: pref });

  if (i.photoCount > 0) rows.push({ label: 'Photos', value: `${i.photoCount} received` });
  else if (c.photo_declined === true) rows.push({ label: 'Photos', value: 'Declined' });
  return rows;
}

export interface EventLike { event_type: string; detail: string | null; actor: string }

/** The line shown in the conversation when something happened that was not a text message. */
export function eventLabel(e: EventLike): string {
  const d = e.detail || '';
  if (e.actor === 'owner') {
    if (d.startsWith('Marked ')) return 'You marked this ' + d.slice('Marked '.length);
    if (d.startsWith('Job value updated to')) return 'You updated the job value to' + d.slice('Job value updated to'.length);
  }
  if (e.event_type === 'urgency_changed') {
    const m = d.match(/^(emergency|urgent|normal)(?:: (.*))?$/);
    if (m) {
      const tag = m[1] === 'emergency' ? 'EMERGENCY' : m[1] === 'urgent' ? 'PRIORITY' : 'normal';
      return m[2] ? `Flagged ${tag}: ${m[2]}` : `Flagged ${tag}`;
    }
  }
  if (e.event_type === 'contact_classified') {
    const m = d.match(/^(\w+) \((\w+)\)$/);
    if (m) {
      const label = TYPE_LABEL[normalizeType(m[1])].toLowerCase();
      return e.actor === 'owner' ? `You sorted this as ${label}` : `Sorted as ${label}`;
    }
  }
  return d;
}
