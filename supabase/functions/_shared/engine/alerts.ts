import type { AccountContext, AlertKind, CallerKind, Collected, Slot, Urgency } from './types.ts';
import { formatSlot } from './slots.ts';

// The text the owner gets. The website promises "you get the details by text", so every alert says who it is,
// the number to call back, what happened, and whether anything was booked. No links, plain text, 320 characters at most.

export interface OwnerAlertInput {
  kind: AlertKind;
  account: AccountContext;
  phone: string;                      // E.164
  callerKind: CallerKind;
  urgency: Urgency;
  collected: Collected;
  quote?: string | null;              // the caller's own words
  slot?: Slot | null;                 // the booked, new or cancelled time
  previousSlot?: Slot | null;         // for a reschedule
  reason?: string | null;             // why it was handed over
  company?: string | null;
}

export function formatPhone(e164: string): string {
  const d = e164.replace(/\D/g, '').replace(/^1/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

function tidy(t: string | null | undefined, max: number): string {
  const s = (t ?? '').replace(/[\u0000-\u001f"\u201c\u201d]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).replace(/\s+\S*$/, '') + '...' : s;
}

const REASON: Record<string, string> = {
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
  conversation_limit: 'Long conversation, needs a human',
  question_after_booking: 'They asked something after booking',
  cancel_unclear: 'Unclear if they want to cancel',
  non_english: 'They wrote in Spanish',
};

export function buildOwnerAlert(i: OwnerAlertInput): string {
  const tz = i.account.timezone;
  const who = tidy(i.collected.name, 40) || tidy(i.company, 40);
  const phone = formatPhone(i.phone);
  const tag = i.urgency === 'emergency' ? 'EMERGENCY: ' : i.urgency === 'urgent' ? 'PRIORITY: ' : '';
  const issue = tidy(i.collected.issue, 70);
  const quote = tidy(i.quote, 90);
  const when = i.slot ? formatSlot(i.slot, tz) : '';
  let t: string;

  if (i.kind === 'booked') {
    const extra = [issue, i.collected.carrier ? i.collected.carrier : i.collected.payment === 'insurance' ? 'insurance' : ''].filter(Boolean).join(', ');
    t = `${tag}BOOKED: ${who || 'New lead'}, ${when}${i.collected.address ? ', ' + tidy(i.collected.address, 50) : ''}.${extra ? ' ' + extra + '.' : ''} ${phone}`;
  } else if (i.kind === 'rescheduled') {
    t = `${tag}RESCHEDULED: ${who || phone}${i.previousSlot ? ', was ' + formatSlot(i.previousSlot, tz) : ''}, now ${when}. ${phone}`;
  } else if (i.kind === 'cancelled') {
    t = `${tag}CANCELLED: ${who || phone}${when ? ', ' + when : ''}. The time is open again. ${phone}`;
  } else if (i.callerKind === 'vendor') {
    t = `VENDOR CALL: ${who || 'Caller'}, ${phone}.${quote ? ` They said: "${quote}".` : ''} Flagged, not booked.`;
  } else if (i.callerKind === 'existing') {
    const need = issue || quote;
    t = `${tag}EXISTING CUSTOMER: ${who || 'Name not given'}, ${phone}.${need ? ` They need: ${need}.` : ''} Flagged for you, not booked.`;
  } else if (i.kind === 'priority' || i.kind === 'heads_up') {
    t = `${tag.trim() || 'NEW LEAD:'} ${who || 'Caller'}, ${phone}.${issue ? ' ' + issue + '.' : ''} Still collecting details.`.replace(/^(EMERGENCY:|PRIORITY:) /, '$1 ');
  } else {
    const why = REASON[i.reason ?? ''] ?? 'Needs a person';
    t = `${tag}NEEDS YOU: ${who || 'Caller'}, ${phone}. ${why}.${quote ? ` They said: "${quote}".` : ''}`;
  }
  t = t.replace(/\s+/g, ' ').trim();
  return t.length > 320 ? t.slice(0, 317).replace(/\s+\S*$/, '') + '...' : t;
}
