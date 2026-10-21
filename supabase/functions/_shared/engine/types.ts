// Shared types for the WedgeScale conversation engine.
// Pure TypeScript: runs the same in Deno (Edge Functions) and Node (tests).

export type Urgency = 'emergency' | 'urgent' | 'normal';
export type Stage =
  | 'new' | 'qualifying' | 'awaiting_photo' | 'awaiting_time'
  | 'booked' | 'handed_off' | 'closed' | 'opted_out';
export type LeadStatus = 'booked' | 'following_up' | 'needs_you' | 'not_a_lead' | 'won' | 'lost';
export type JobType = 'repair' | 'storm_damage' | 'full_reroof' | 'commercial';
export type Payment = 'insurance' | 'out_of_pocket' | 'unknown';
export type AskField = 'issue' | 'active_now' | 'confirm_address' | 'address' | 'name' | 'slot' | 'photo' | 'payment' | 'cancel_confirm' | 'purpose' | 'callback_details' | 'opener' | null;

/** Who is calling. Sorts the owner's list and decides how a missed call is handled. */
export type ContactType = 'unknown' | 'homeowner' | 'past_client' | 'recurring_client' | 'supplier' | 'crew' | 'other';
/** What the conversation decides this caller is. */
export type CallerKind = 'unknown' | 'homeowner' | 'vendor' | 'existing';
export type AlertKind = 'priority' | 'needs_you' | 'handoff' | 'booked' | 'rescheduled' | 'cancelled' | 'heads_up';
/** engine = normal conversation. owner_only = tell the owner, send nothing. silent = ignore completely. */
export type AutoReply = 'engine' | 'owner_only' | 'silent';

export interface ContactInfo {
  type: ContactType;
  autoReply: AutoReply;
  name?: string;
  company?: string;
  address?: string;
  lastJob?: string;
}

export interface ContactUpdate {
  type: ContactType;
  needsReview: boolean;   // the engine suggests, the owner confirms in the dashboard
}

export interface Collected {
  name?: string;
  address?: string;
  issue?: string;
  job_type?: JobType;
  active_now?: boolean;
  payment?: Payment;
  carrier?: string;
  photo_received?: boolean;
  photo_declined?: boolean;
  preferred_time?: string;
  commercial?: boolean;
}

export interface Slot {
  start: string; // ISO timestamp
  end: string;
}

export interface Flags {
  safety_warned?: boolean;
  priority_alerted?: boolean;
  identified_self?: boolean;
  language_notice_sent?: boolean;
  photo_asked?: boolean;
  payment_asked?: boolean;
  weather_mentioned?: boolean;
  address_from_contact?: boolean;
  address_confirmed?: boolean;
  address_rejected?: boolean;
  rescheduling?: boolean;
  caller_kind?: CallerKind;
  opener?: 'leak_or_quote' | 'storm_or_routine' | 'returning';
  purpose_asked?: boolean;
  details_asked?: boolean;
}

export interface LeadStateLite {
  stage: Stage;
  urgency: Urgency;
  collected: Collected;
  flags: Flags;
  unclearStreak: number;
  aiReplyCount: number;
  inboundCount: number;
  followUpsSent: number;
  offeredSlots: Slot[];
  lastAsk: AskField;
  contactType: ContactType;
  autoReply: AutoReply;
}

export interface AccountContext {
  name: string;
  timezone: string;
  officeOpen: string;   // 'HH:MM' or 'HH:MM:SS'
  officeClose: string;
  worksWeekends: boolean;
  quietStart: string | null;
  quietEnd: string | null;
  services?: string | null;
  serviceArea?: string | null;
}

export interface WeatherFacts {
  stormMode: boolean;
  /** When the storm happened, so the text can say tonight's, last night's or yesterday's correctly. */
  storm?: 'now' | 'earlier' | 'last_night' | 'yesterday' | 'days_ago';
  facts: string[];      // plain sentences the model may use, nothing else
  fetchedAt?: string;
}

export type Goal =
  | 'first_message' | 'identify_self' | 'ask_issue' | 'ask_active' | 'ask_address' | 'ask_name'
  | 'ask_purpose' | 'ask_callback_details' | 'confirm_address' | 'offer_slots' | 'confirm_booking' | 'confirm_reschedule' | 'confirm_cancel'
  | 'acknowledge_cancel' | 'keep_appointment' | 'post_booking_details'
  | 'acknowledge_decline' | 'acknowledge_snooze' | 'handoff_notice' | 'language_notice'
  | 'opt_out_ack' | 'wrong_number_ack' | 'follow_up' | 'none';

export interface Signals {
  optOutIntent: boolean;
  danger: boolean;
  emergencyIssue: boolean;
  activeNow: boolean | null;
  wantsHuman: boolean;
  angry: boolean;
  legal: boolean;
  priceAsk: boolean;
  insuranceAsk: boolean;
  insurance: 'insurance' | 'out_of_pocket' | null;
  carrier: string | null;
  decline: boolean;
  snoozeHours: number | null;
  whoIsThis: boolean;
  wrongNumber: boolean;
  vendorSpam: boolean;
  commercial: boolean;
  nonEnglish: boolean;
  yes: boolean;
  no: boolean;
  reschedule: boolean;
  cancel: boolean;
  thanksOnly: boolean;
  roofCue: boolean;
  existingJobLike: boolean;
  supplierLike: boolean;
  pastClientLike: boolean;
  recurringLike: boolean;
  priorJobIssue: boolean;
}

export interface Decision {
  callerKind: CallerKind;
  goal: Goal;
  nextStage: Stage;
  collected: Collected;
  flags: Flags;
  unclearStreak: number;
  urgency: Urgency;
  urgencyReason: string;
  ask: AskField;
  offer: Slot[];
  bookSlot: Slot | null;
  rescheduleSlot: Slot | null;
  cancelAppointment: boolean;
  handoffReason: string | null;
  alert: { kind: AlertKind; immediate: boolean } | null;
  optOut: boolean;
  status: LeadStatus | null;
  snoozeHours: number | null;
  safetyNotice: boolean;
  answerFirst: 'price' | 'insurance' | null;
  rephrase: boolean;
  spanish: boolean;
  contactUpdate: ContactUpdate | null;
  reply: boolean;       // false = stay silent
}

/** The homeowner's current inspection, if they have one. */
export interface AppointmentLite {
  startsAt: string;
  endsAt?: string | null;
}
