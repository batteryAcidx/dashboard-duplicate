import type {
  AccountContext, AppointmentLite, AskField, CallerKind, Collected, ContactInfo, ContactType, ContactUpdate, Decision, Flags,
  LeadStateLite, Signals, Slot, WeatherFacts,
} from './types.ts';
import { computeUrgency, leakish, maxUrgency } from './priority.ts';
import { filterSlotsByCues, hasTimeCues, matchSlotChoice, pickSlots } from './slots.ts';

export interface DecideInput {
  state: LeadStateLite;
  text: string;                    // what the caller just wrote
  signals: Signals;                // from classify(text)
  extracted: Partial<Collected>;   // from the model or the fallback guessers, already sanitized
  photoReceived?: boolean;
  contact?: ContactInfo | null;    // what the owner already knows about this number
  appointment?: AppointmentLite | null; // their current inspection, if any
  bookExistingCustomers?: boolean; // owner setting. Off by default: existing customers are flagged, not booked.
  account: AccountContext;
  availableSlots: Slot[];
  weather: WeatherFacts;
  now: Date;
}

/** A conversation hands the lead to the owner only when a human is needed. A message count is never the reason. */
export const SAFETY_CEILING_AI_REPLIES = 40;

export function mergeCollected(
  old: Collected, ex: Partial<Collected>, s: Signals, lastAsk: AskField, photoReceived?: boolean,
): Collected {
  const c: Collected = { ...old };
  for (const k of Object.keys(ex) as (keyof Collected)[]) {
    const v = ex[k];
    if (v !== undefined && v !== null && (v as unknown) !== '') (c as Record<string, unknown>)[k] = v;
  }
  if (s.insurance) c.payment = s.insurance;
  if (s.carrier) c.carrier = s.carrier;
  if (s.commercial) { c.commercial = true; c.job_type = 'commercial'; }
  if (s.activeNow !== null) c.active_now = s.activeNow;
  else if (lastAsk === 'active_now') {
    if (s.yes) c.active_now = true;
    else if (s.no) c.active_now = false;
  }
  if (lastAsk === 'photo' && s.no) c.photo_declined = true;
  if (lastAsk === 'payment' && !s.insurance) {
    if (s.no) c.payment = 'out_of_pocket';
    else if (s.yes) c.payment = 'insurance';
  }
  if (photoReceived) c.photo_received = true;
  return c;
}

const ASKED_FIELDS = new Set<AskField>(['issue', 'active_now', 'confirm_address', 'address', 'name']);

function answered(ask: AskField, c: Collected, f: Flags): boolean {
  switch (ask) {
    case 'issue': return !!c.issue;
    case 'active_now': return c.active_now !== undefined;
    case 'confirm_address': return !!f.address_confirmed || !c.address;
    case 'address': return !!c.address;
    case 'name': return !!c.name;
    default: return true;
  }
}

function nextMissing(c: Collected, f: Flags, lastAsk: AskField, unclearStreak: number): AskField {
  // they ignored our last question: ask it again (once, for the "is it active" question) before moving on
  if (lastAsk && ASKED_FIELDS.has(lastAsk) && !answered(lastAsk, c, f)) {
    if (lastAsk !== 'active_now' || unclearStreak < 1) return lastAsk;
  }
  if (!c.issue) return 'issue';
  if (leakish(c.issue) && c.active_now === undefined && lastAsk !== 'active_now') return 'active_now';
  if (c.address && f.address_from_contact && !f.address_confirmed) return 'confirm_address';
  if (!c.address) return 'address';
  if (!c.name) return 'name';
  return null;
}

const ASK_GOAL: Record<'issue' | 'active_now' | 'confirm_address' | 'address' | 'name', Decision['goal']> = {
  issue: 'ask_issue', active_now: 'ask_active', confirm_address: 'confirm_address', address: 'ask_address', name: 'ask_name',
};

const RE_LEAK = /\b(active|actively|leak\w*|drip\w*|pouring|water|first (one|option)|the leak)\b/i;
const RE_ROUTINE = /\b(quote|estimate|routine|inspection|check|second (one|option)|just (a|an)|looking for)\b/i;
const RE_HIT = /\b(it did|hit|hail|damage\w*|shingles|tree|leak\w*|storm|wind)\b/i;

/** A reply to our first question is usually a word or two: "leak", "just a quote", "yes it did". */
export function interpretOpener(text: string, variant: Flags['opener'], s: Signals): Partial<Collected> | null {
  if (variant === 'leak_or_quote') {
    const stain = /\b(stain\w*|stopped|wet|moisture|mold|damp)\b/i.test(text);
    const leak = RE_LEAK.test(text) || stain;
    const routine = RE_ROUTINE.test(text);
    const stopped = s.activeNow === false || stain;
    if (leak && !routine) return stopped ? { issue: 'leak that has stopped', active_now: false } : { issue: 'active leak', active_now: true };
    if (leak && routine) return stopped ? { issue: 'leak that has stopped', active_now: false } : { issue: 'leak, wants a quote' };
    if (routine) return { issue: 'routine quote' };
  }
  if (variant === 'storm_or_routine') {
    if (s.yes || RE_HIT.test(text)) return { issue: 'storm damage', job_type: 'storm_damage' };
    if (RE_ROUTINE.test(text) || /^\s*(no|nope|nah|not really)\b/i.test(text)) return { issue: 'routine inspection' };
  }
  return null;
}

function kindFromType(t: ContactType): CallerKind {
  switch (t) {
    case 'homeowner': return 'homeowner';
    case 'supplier': case 'crew': case 'other': return 'vendor';
    case 'past_client': case 'recurring_client': return 'existing';
    default: return 'unknown';
  }
}

export function decide(inp: DecideInput): Decision {
  const { state, signals: s, account, now, text } = inp;
  const tz = account.timezone;
  const flags: Flags = { ...state.flags };
  const collected = mergeCollected(state.collected, inp.extracted, s, state.lastAsk, inp.photoReceived);

  // ---- the answer to our first question ------------------------------------
  const vendorOrExisting = s.supplierLike || s.pastClientLike || s.recurringLike || s.existingJobLike || s.vendorSpam;
  if (state.lastAsk === 'opener' && !collected.issue && !vendorOrExisting) {
    const o = interpretOpener(text, flags.opener, s);
    if (o) Object.assign(collected, o);
  }

  // ---- confirming an address that was already on file ----------------------
  if (state.lastAsk === 'confirm_address') {
    if (inp.extracted.address) { flags.address_confirmed = true; flags.address_from_contact = false; }
    else if (s.yes) flags.address_confirmed = true;
    else if (s.no) { delete collected.address; flags.address_rejected = true; flags.address_from_contact = false; }
  }
  if (inp.contact && kindFromType(state.contactType) === 'existing') {
    if (!collected.name && inp.contact.name) collected.name = inp.contact.name;
    if (!collected.address && inp.contact.address && !flags.address_rejected) {
      collected.address = inp.contact.address;
      flags.address_from_contact = true;
    }
  }

  const computed = computeUrgency(collected, s, inp.weather);
  const urgency = maxUrgency(state.urgency, computed.urgency);
  const urgencyReason = urgency === computed.urgency ? computed.reason : 'Flagged earlier in the conversation';

  let priorityAlert: Decision['alert'] = null;
  if (urgency !== 'normal' && !flags.priority_alerted) {
    priorityAlert = { kind: 'priority', immediate: true };
    flags.priority_alerted = true;
  }

  const safetyNotice = s.danger && !flags.safety_warned;
  if (safetyNotice) flags.safety_warned = true;

  let callerKind: CallerKind = 'unknown';
  let contactUpdate: ContactUpdate | null = null;

  const out = (d: Partial<Decision> & Pick<Decision, 'goal' | 'nextStage'>): Decision => ({
    callerKind, collected, flags, unclearStreak: 0, urgency, urgencyReason, ask: null, offer: [], bookSlot: null,
    rescheduleSlot: null, cancelAppointment: false,
    handoffReason: null, alert: priorityAlert, optOut: false, status: null, snoozeHours: null,
    safetyNotice, answerFirst: null, rephrase: false, spanish: false, contactUpdate, reply: true,
    ...d,
  });

  const handoff = (reason: string, immediate = urgency !== 'normal'): Decision =>
    out({
      goal: 'handoff_notice', nextStage: 'handed_off', handoffReason: reason, status: 'needs_you',
      alert: { kind: 'handoff', immediate },
    });

  // ---- hard stops ----------------------------------------------------------
  // Note for the sender: the opt-out acknowledgement goes out BEFORE the opt-out is recorded,
  // because recording it closes the "can text" gate for this number.
  if (s.optOutIntent) return out({ goal: 'opt_out_ack', nextStage: 'opted_out', optOut: true, alert: null });
  if (s.wrongNumber) {
    return out({ goal: 'wrong_number_ack', nextStage: 'closed', optOut: true, status: 'not_a_lead', alert: null });
  }

  // numbers the owner told us not to answer
  if (state.autoReply === 'silent') {
    return out({ goal: 'none', nextStage: state.stage, reply: false, alert: null, contactUpdate: null });
  }
  if (state.autoReply === 'owner_only') {
    return out({
      goal: 'none', nextStage: 'handed_off', reply: false, handoffReason: state.contactType, callerKind: 'vendor',
      alert: { kind: 'handoff', immediate: false }, contactUpdate: null,
    });
  }

  // cold-call solicitors are filed as not-a-lead and never texted or alerted
  if (s.vendorSpam) {
    return out({ goal: 'none', nextStage: 'closed', status: 'not_a_lead', handoffReason: 'vendor', reply: false, alert: null, callerKind: 'vendor' });
  }

  // a handed-off or opted-out lead belongs to the owner now
  if (state.stage === 'handed_off' || state.stage === 'opted_out') {
    return out({ goal: 'none', nextStage: state.stage, reply: false, alert: null });
  }

  // ---- who this is, as far as we can tell ----------------------------------
  const typeKind = kindFromType(state.contactType);
  const hasRoofCue = s.roofCue || !!collected.issue;
  // "warranty" on its own is just a question. It only means a previous job when it is tied to our own work.
  const ownedWork = /\byour (crew|guys|team)\b|\bafter you(r (crew|guys|team))? (fixed|repaired|replaced|installed)\b/i.test(text);
  const existingCue = s.pastClientLike || s.recurringLike || s.existingJobLike || (s.priorJobIssue && ownedWork);
  let kind: CallerKind = typeKind !== 'unknown' ? typeKind : (flags.caller_kind ?? 'unknown');
  if (kind === 'unknown') {
    if (s.supplierLike && !hasRoofCue && !s.existingJobLike) kind = 'vendor';   // "my invoice" is a customer, "your invoice" is a vendor
    else if (existingCue) kind = 'existing';
    else if (hasRoofCue) kind = 'homeowner';
  }
  callerKind = kind;
  if (typeKind === 'unknown' && kind !== 'unknown') {
    flags.caller_kind = kind;
    contactUpdate = kind === 'vendor' ? { type: 'supplier', needsReview: true }
      : kind === 'existing' ? { type: s.recurringLike ? 'recurring_client' : 'past_client', needsReview: true }
      : { type: 'homeowner', needsReview: false };
  }

  if (s.legal) return handoff('legal', true);
  if (s.wantsHuman) return handoff('asked_for_a_person');
  if (s.angry) return handoff('upset_customer');
  const existingContext = s.pastClientLike || s.existingJobLike || kind === 'existing' || ownedWork;
  if (s.priorJobIssue && existingContext) return handoff('prior_job_issue', true);
  if (s.commercial && !state.collected.commercial) return handoff('commercial_job', true);

  // ---- changing or cancelling an existing inspection -----------------------
  const appt = inp.appointment ?? null;
  const apptAware = !!appt && (state.stage === 'booked' || !!flags.rescheduling);
  if (!apptAware && (s.cancel || s.reschedule)) return handoff(s.cancel ? 'cancel_request' : 'reschedule_request');

  if (apptAware && appt) {
    const current: Slot = { start: appt.startsAt, end: appt.endsAt ?? appt.startsAt };
    const soon = new Date(appt.startsAt).getTime() - now.getTime() < 24 * 3600_000;
    const apptAlert = (k: 'rescheduled' | 'cancelled') => ({ kind: k, immediate: soon || urgency !== 'normal' });
    const openSlots = inp.availableSlots.filter((sl) => sl.start !== appt.startsAt);
    const wantsOther = s.reschedule || /\b(another|different|other) (time|day)\b/i.test(text);
    const keepWords = /\b(keep|never ?mind|forget it|leave it|still (want|need)|don'?t cancel)\b/i.test(text);
    const plainNoThanks = /^\s*no,? thanks?[.! ]*$/i.test(text);
    const strictYes = /^\s*(yes|yeah|yep|yup|correct|please do|cancel)\b/i.test(text);

    const startReschedule = (): Decision => {
      const hits = filterSlotsByCues(text, openSlots, tz, now);
      if (hits && hits.length === 1) {
        flags.rescheduling = false;
        return out({ goal: 'confirm_reschedule', nextStage: 'booked', rescheduleSlot: hits[0], offer: [hits[0]], alert: apptAlert('rescheduled') });
      }
      const pool = hits && hits.length > 1 ? hits : openSlots;
      const offer = pickSlots(pool, 3, tz);
      if (offer.length === 0) return handoff('no_availability');
      flags.rescheduling = true;
      return out({ goal: 'offer_slots', nextStage: 'awaiting_time', offer, ask: 'slot' });
    };

    // we asked "cancel it, or another time?" and this is the answer
    if (state.lastAsk === 'cancel_confirm') {
      if (keepWords) return out({ goal: 'keep_appointment', nextStage: 'booked', offer: [current] });
      if (wantsOther || hasTimeCues(text)) return startReschedule();
      if (strictYes || s.cancel || (s.decline && !plainNoThanks)) {
        return out({ goal: 'acknowledge_cancel', nextStage: 'closed', cancelAppointment: true, status: 'lost', alert: apptAlert('cancelled') });
      }
      if (s.no || plainNoThanks) return out({ goal: 'keep_appointment', nextStage: 'booked', offer: [current] });
      const streak = state.unclearStreak + 1;
      if (streak >= 2) return handoff('cancel_unclear');
      return out({ goal: 'confirm_cancel', nextStage: 'booked', ask: 'cancel_confirm', offer: [current], rephrase: true, unclearStreak: streak });
    }
    // never cancel on a guess: ask first, and offer another time while asking
    if (s.cancel || (s.decline && state.stage === 'booked')) {
      return out({ goal: 'confirm_cancel', nextStage: 'booked', ask: 'cancel_confirm', offer: [current] });
    }
    if (s.reschedule) return startReschedule();
    // they changed their mind in the middle of choosing a new time
    if (flags.rescheduling && (keepWords || plainNoThanks)) {
      flags.rescheduling = false;
      return out({ goal: 'keep_appointment', nextStage: 'booked', offer: [current] });
    }
  }

  if (s.nonEnglish && !flags.language_notice_sent) {
    flags.language_notice_sent = true;
    return out({
      goal: 'language_notice', nextStage: 'handed_off', handoffReason: 'non_english', status: 'needs_you',
      spanish: true, alert: { kind: 'handoff', immediate: urgency !== 'normal' },
    });
  }

  if (s.decline) return out({ goal: 'acknowledge_decline', nextStage: 'closed', status: 'lost', alert: null });

  if (state.aiReplyCount >= SAFETY_CEILING_AI_REPLIES) return handoff('conversation_limit');

  const answerFirst: Decision['answerFirst'] = s.priceAsk ? 'price' : s.insuranceAsk ? 'insurance' : null;

  // ---- after booking -------------------------------------------------------
  if (state.stage === 'booked') {
    if (inp.photoReceived && collected.payment === undefined && !flags.payment_asked) {
      flags.payment_asked = true;
      return out({ goal: 'post_booking_details', nextStage: 'booked', ask: 'payment' });
    }
    if (inp.photoReceived) return out({ goal: 'post_booking_details', nextStage: 'booked' });
    if ((s.thanksOnly || s.yes) && collected.payment === undefined && !flags.payment_asked) {
      flags.payment_asked = true;
      return out({ goal: 'post_booking_details', nextStage: 'booked', ask: 'payment' });
    }
    if (s.thanksOnly || s.yes) return out({ goal: 'none', nextStage: 'booked', reply: false, alert: null });
    if (answerFirst) return out({ goal: 'post_booking_details', nextStage: 'booked', answerFirst });
    return handoff('question_after_booking');
  }

  // ---- a reply that is only "later" ---------------------------------------
  if (s.snoozeHours && Object.keys(inp.extracted).length === 0 && !s.emergencyIssue && text.length < 100
      && state.stage !== 'awaiting_time') {
    return out({ goal: 'acknowledge_snooze', nextStage: state.stage === 'closed' ? 'qualifying' : state.stage, snoozeHours: s.snoozeHours });
  }

  // ---- choosing a time -----------------------------------------------------
  const stage = state.stage === 'closed' ? 'qualifying' : state.stage;
  if (stage === 'awaiting_time' && state.offeredSlots.length > 0) {
    const resched = !!flags.rescheduling && !!appt;
    const pickFrom = resched && appt ? inp.availableSlots.filter((sl) => sl.start !== appt.startsAt) : inp.availableSlots;
    const soonAppt = !!appt && new Date(appt.startsAt).getTime() - now.getTime() < 24 * 3600_000;
    const finalize = (slot: Slot): Decision => {
      if (resched) {
        flags.rescheduling = false;
        return out({
          goal: 'confirm_reschedule', nextStage: 'booked', rescheduleSlot: slot, offer: [slot], answerFirst,
          alert: { kind: 'rescheduled', immediate: soonAppt || urgency !== 'normal' },
        });
      }
      return out({
        goal: 'confirm_booking', nextStage: 'booked', bookSlot: slot, offer: [slot], status: 'booked',
        alert: { kind: 'booked', immediate: urgency !== 'normal' }, answerFirst,
      });
    };

    const m = matchSlotChoice(text, state.offeredSlots, tz, now);
    if (m.slot) return finalize(m.slot);
    if (m.ambiguous) {
      return out({ goal: 'offer_slots', nextStage: 'awaiting_time', offer: state.offeredSlots, ask: 'slot', rephrase: true, answerFirst });
    }
    // they want something other than what we offered: look at everything that is open
    const hits = filterSlotsByCues(text, pickFrom, tz, now);
    if (hits && hits.length === 1) return finalize(hits[0]);
    const pool = hits && hits.length > 1 ? hits : pickFrom;
    const fresh = pickSlots(pool, 3, tz, hits && hits.length > 1 ? [] : state.offeredSlots);
    if (fresh.length === 0) return handoff('no_availability');
    return out({ goal: 'offer_slots', nextStage: 'awaiting_time', offer: fresh, ask: 'slot', answerFirst });
  }

  // ---- the conversation sorts the call --------------------------------------
  // Only homeowners are booked. Vendors and existing customers are flagged, and the owner gets the details by text.
  if (kind === 'vendor') {
    const enough = text.trim().length >= 15 || !!collected.name || !!flags.details_asked;
    if (!enough) {
      flags.details_asked = true;
      return out({ goal: 'ask_callback_details', nextStage: 'qualifying', ask: 'callback_details', status: 'not_a_lead' });
    }
    return out({
      goal: 'handoff_notice', nextStage: 'handed_off', handoffReason: 'supplier', status: 'not_a_lead',
      alert: { kind: 'handoff', immediate: false },
    });
  }

  if (kind === 'existing' && !inp.bookExistingCustomers) {
    if (!collected.issue) {
      // use their own words when they already said what they need, and only ask when there is nothing to go on
      const words = text.replace(/\s+/g, ' ').trim();
      if (words.length >= 12) collected.issue = words.slice(0, 200);
      else if (!flags.purpose_asked) {
        flags.purpose_asked = true;
        return out({ goal: 'ask_purpose', nextStage: 'qualifying', ask: 'purpose', status: 'following_up' });
      } else collected.issue = words || 'Existing customer, details not given';
    }
    if (!collected.name && !flags.details_asked) {
      flags.details_asked = true;
      return out({ goal: 'ask_name', nextStage: 'qualifying', ask: 'name', status: 'following_up' });
    }
    return out({
      goal: 'handoff_notice', nextStage: 'handed_off', handoffReason: 'existing_customer', status: 'needs_you',
      alert: { kind: 'handoff', immediate: urgency !== 'normal' },
    });
  }

  if (kind === 'unknown') {
    if (s.whoIsThis && !flags.identified_self) {
      flags.identified_self = true;
      flags.opener = 'leak_or_quote';
      return out({ goal: 'identify_self', nextStage: 'qualifying', ask: 'opener', status: 'following_up' });
    }
    if (!flags.purpose_asked) {
      flags.purpose_asked = true;
      return out({ goal: 'ask_purpose', nextStage: 'qualifying', ask: 'purpose', status: 'following_up', answerFirst });
    }
    return handoff('unclear_purpose', false);
  }

  // ---- a homeowner: collect what we need to book ----------------------------
  const ask = nextMissing(collected, flags, state.lastAsk, state.unclearStreak);
  if (ask) {
    const got = answered(state.lastAsk, collected, flags);
    const streak = got || state.lastAsk === null || state.lastAsk === 'purpose' || state.lastAsk === 'opener' ? 0 : state.unclearStreak + 1;
    if (streak >= 4) return handoff('unclear_replies');
    const goal = s.whoIsThis && !flags.identified_self
      ? 'identify_self'
      : ASK_GOAL[ask as 'issue' | 'active_now' | 'confirm_address' | 'address' | 'name'];
    if (s.whoIsThis) flags.identified_self = true;
    return out({
      goal, nextStage: 'qualifying', ask, unclearStreak: streak, rephrase: streak > 0 && ask === state.lastAsk && !s.whoIsThis,
      status: 'following_up', answerFirst,
    });
  }

  // ---- we have enough: offer real times -----------------------------------
  const preferred = collected.preferred_time ? filterSlotsByCues(collected.preferred_time, inp.availableSlots, tz, now) : null;
  const pool = preferred && preferred.length > 0 ? preferred : inp.availableSlots;
  const offer = pickSlots(pool, 3, tz);
  if (offer.length === 0) return handoff('no_availability');
  return out({ goal: 'offer_slots', nextStage: 'awaiting_time', offer, ask: 'slot', status: 'following_up', answerFirst });
}
