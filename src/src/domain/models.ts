// The shapes of the data the app works with. Plain types: no React, no network.
// The data layer (src/api) returns these, and the screens (src/features, src/components) show them.
import type { Guarantee } from './billing';
import type { InfoField } from './setup';

export interface Controls {
  engine_enabled: boolean;
  paused_until: string | null;
  test_mode: boolean;
  book_existing_customers: boolean;
  daily_message_cap: number;
  daily_conversation_cap: number;
  inspection_minutes: number;
  slot_step_minutes: number;
  min_notice_hours: number;
  max_days_ahead: number;
  concurrent_inspections: number;
  follow_up_schedule_hours: number[];
  reply_delay_min_seconds: number;
  reply_delay_max_seconds: number;
  ai_model: string | null;
  phone_number: string | null;
  forwarding_status: string;
  twilio_ready: boolean;
  registration_status: string | null;
  account_status: string | null;
  notification_phone: string | null;
  service_lat: number | null;
  service_lon: number | null;
  service_country: string | null;
  storm_mode: boolean | null;
  weather_error: string | null;
  pending_events: number;
  failed_events: number;
}

export interface StripeInvoice {
  id: string;
  number: string | null;
  status: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  currency: string;
  hosted_invoice_url: string | null;
  issued_at: string | null;
  paid_at: string | null;
}

export interface Billing {
  exists: boolean;
  linked: boolean;
  plan: string;
  monthly_price_cents: number;
  status: string;
  go_live_at: string | null;
  guarantee_override: string | null;
  notes: string | null;
  stripe: {
    customer_id: string | null;
    subscription_id: string | null;
    status: string | null;
    price_label: string | null;
    current_period_end: string | null;
    cancel_at_period_end: boolean;
    payment_method: string | null;
    synced_at: string | null;
  };
  paid_cents: number;
  open_cents: number;
  invoices: StripeInvoice[];
  guarantee: Guarantee & { go_live_at?: string; window_end?: string };
}

export interface Cal {
  provider: string;
  status: string;
  calendar_label: string | null;
  external_calendar_id: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  sync_requested_at: string | null;
  busy_blocks: number;
  pending_writes: number;
  failed_writes: number;
  synced_appointments: number;
  upcoming_appointments: number;
}

export interface Twilio {
  twilio_subaccount_sid: string | null;
  messaging_service_sid: string | null;
  phone_number: string | null;
  phone_number_sid: string | null;
  brand_sid: string | null;
  campaign_sid: string | null;
  forwarding_status: string;
  has_token: boolean;
  registration_status: string | null;
  account_status: string | null;
  notification_phone: string | null;
}

export interface Business {
  legal_name?: string | null;
  website?: string | null;
  address1?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  public_phone?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  license_number?: string | null;
  notes?: string | null;
}

export interface ActivityRow {
  id: string | null;
  created_at: string;
  action: string;
  detail: string | null;
  actor_id: string | null;
  actor_email: string | null;
}

export interface ActivityResult {
  total: number;
  rows: ActivityRow[];
  actors: { id: string; email: string | null }[];
  actions: string[];
  limit: number;
  offset: number;
}

export type StepStatus = 'pending' | 'in_progress' | 'waiting_on_you' | 'done';

export interface SetupStep {
  id: string;
  step_key: string;
  title: string;
  description: string | null;
  status: StepStatus;
  note: string | null;
  sort_order: number;
  completed_at: string | null;
  info_prompt: string | null;
  info_fields: InfoField[];
  info_response: Record<string, string> | null;
  info_submitted_at: string | null;
  action: string | null;
  info_link: string | null;
  info_link_label: string | null;
  emails_sent: number;
  last_email_at: string | null;
}

export interface SetupEmail {
  id: string;
  step_key: string | null;
  to_email: string;
  subject: string;
  status: 'sent' | 'failed';
  error: string | null;
  created_at: string;
}

export interface SetupOverview {
  owner: { email: string | null; name: string | null };
  registration?: { status: string; submitted_at: string | null } | null;
  steps: SetupStep[];
  emails: SetupEmail[];
}

export interface ClientStep {
  id: string;
  step_key: string;
  title: string;
  description: string | null;
  status: StepStatus;
  note: string | null;
  sort_order: number;
  completed_at: string | null;
  info_prompt?: string | null;
  info_fields?: InfoField[] | null;
  info_response?: Record<string, string> | null;
  info_submitted_at?: string | null;
  action?: string | null;
  info_link?: string | null;
  info_link_label?: string | null;
}

/** What the owner (or the admin) sees of a registration. The EIN is never in here, only its last 4 digits. */
export interface RegistrationSaved {
  status?: string;
  path?: 'standard' | 'sole_proprietor';
  business_type?: string | null;
  legal_name?: string | null;
  dba?: string | null;
  has_ein?: boolean;
  ein_last4?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  country?: string | null;
  website?: string | null;
  contact_name?: string | null;
  contact_title?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  authorized?: boolean;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  /** only what the client is allowed to see: why it was sent back */
  note?: string | null;
  /** admin only */
  admin_notes?: string | null;
}
