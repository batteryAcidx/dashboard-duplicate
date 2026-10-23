// Small pure helpers for the admin tabs: follow-up lists, money, the guarantee, pauses and error messages.
// No React in here, so they are tested on their own (engine-tests/ui.test.ts).

export type HoursParse = { ok: true; hours: number[] } | { ok: false; error: string };

/** "4, 24, 72, 120" becomes [4, 24, 72, 120]. Whole hours, increasing, at most 10. */
export function parseHours(text: string): HoursParse {
  const parts = text.split(/[\s,;]+/).filter(Boolean);
  if (parts.length > 10) return { ok: false, error: 'Use at most 10 follow-ups.' };
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 720)) {
    return { ok: false, error: 'Each follow-up must be a whole number of hours between 1 and 720.' };
  }
  for (let i = 1; i < nums.length; i++) {
    if (nums[i] <= nums[i - 1]) return { ok: false, error: 'Put the hours in increasing order, for example 4, 24, 72.' };
  }
  return { ok: true, hours: nums };
}

export const hoursToText = (h: number[] | null | undefined): string => (h ?? []).join(', ');

/** 69700 becomes "$697". 69750 becomes "$697.50". Credits show as "-$697". */
export function centsToDollars(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const body = `$${whole.toLocaleString('en-US')}${frac ? '.' + String(frac).padStart(2, '0') : ''}`;
  return neg ? `-${body}` : body;
}

/** "697", "$697.50" or "-697" become cents. Returns null for anything else. */
export function dollarsToCents(text: string): number | null {
  const t = text.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d{1,2})?$/.test(t)) return null;
  const n = Math.round(Number(t) * 100);
  return Math.abs(n) <= 10_000_000 ? n : null;
}

export interface Guarantee {
  status: string;
  required?: number;
  booked?: number;
  missed_calls?: number;
  calls_per_week?: number;
  days_left?: number;
}

export interface GuaranteeView {
  label: string;
  tone: 'ok' | 'gold' | 'plain' | 'danger';
  detail: string;
}

/** The plain-words state of the 30-day guarantee. */
export function guaranteeView(g: Guarantee): GuaranteeView {
  const booked = g.booked ?? 0;
  const required = g.required ?? 2;
  const perWeek = g.calls_per_week ?? 0;
  switch (g.status) {
    case 'met':
      return { label: 'Met', tone: 'ok', detail: `${booked} inspections booked in the first 30 days.` };
    case 'in_progress':
      return {
        label: 'In progress',
        tone: 'gold',
        detail: `${booked} of ${required} booked, ${g.days_left ?? 0} day${g.days_left === 1 ? '' : 's'} left in the window.`,
      };
    case 'credit_due':
      return {
        label: 'Credit due',
        tone: 'danger',
        detail: `Only ${booked} booked with ${perWeek} missed calls a week. The next month is free.`,
      };
    case 'not_eligible':
      return {
        label: 'Does not apply',
        tone: 'plain',
        detail: `Only ${perWeek} missed calls a week, under the 6 the guarantee needs.`,
      };
    case 'waived':
      return { label: 'Waived', tone: 'plain', detail: 'You marked the guarantee as waived for this client.' };
    case 'credited':
      return { label: 'Credited', tone: 'ok', detail: 'The free month has been given.' };
    default:
      return { label: 'Not started', tone: 'plain', detail: 'The 30 days start when the texting engine is first turned on.' };
  }
}

export const PAUSE_OPTIONS: { label: string; hours: number }[] = [
  { label: '1 hour', hours: 1 },
  { label: '4 hours', hours: 4 },
  { label: '24 hours', hours: 24 },
];

export function pauseUntilIso(hours: number, now: number = Date.now()): string {
  return new Date(now + hours * 3600_000).toISOString();
}

/** "2h 15m left" while a pause is running, otherwise null. */
export function pauseLeft(pausedUntil: string | null | undefined, now: number = Date.now()): string | null {
  if (!pausedUntil) return null;
  const ms = new Date(pausedUntil).getTime() - now;
  if (!(ms > 0)) return null;
  const mins = Math.ceil(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h ${m}m left` : `${m}m left`;
}

export function adminErrorText(message: string): string {
  const m = message || '';
  if (m.includes('mfa_required')) return 'Confirm your authenticator code first: sign out, sign in again and enter the code.';
  if (m.includes('forbidden')) return 'Admin access is required.';
  if (m.includes('not_ready')) return 'Not ready yet. The account needs to be live, with a texting number, an approved registration and verified call forwarding.';
  if (m.includes('not_connected')) return 'Connect a calendar first.';
  if (m.includes('provider_cannot_be_active')) return 'Only Google and Microsoft calendars can be marked as connected.';
  if (m.includes('duplicate key') || m.includes('already exists')) return 'That value is already in use by another client.';
  if (m.includes('violates check constraint') || m.includes('invalid input')) return 'That value is not allowed. Check the numbers and try again.';
  return 'Something went wrong. Check your connection and try again.';
}

export interface Readiness {
  accountLive: boolean;
  registrationApproved: boolean;
  numberSet: boolean;
  phoneServiceReady: boolean;
  forwardingVerified: boolean;
  ready: boolean;
}

/** Everything that has to be true before the engine can be turned on. */
export function readiness(c: {
  account_status?: string | null;
  registration_status?: string | null;
  phone_number?: string | null;
  twilio_ready?: boolean;
  forwarding_status?: string | null;
}): Readiness {
  const r = {
    accountLive: c.account_status === 'live',
    registrationApproved: c.registration_status === 'approved',
    numberSet: Boolean(c.phone_number),
    phoneServiceReady: Boolean(c.twilio_ready),
    forwardingVerified: c.forwarding_status === 'verified',
  };
  return { ...r, ready: Object.values(r).every(Boolean) };
}

/* ---------------------------------------------------------------- activity log */

const ACTION_LABEL: Record<string, string> = {
  engine_on: 'Engine turned on',
  engine_off: 'Engine turned off',
  engine_controls_changed: 'Controls changed',
  engine_retry_failed: 'Failed texts retried',
  calendar_set: 'Calendar connection changed',
  calendar_sync_requested: 'Calendar sync requested',
  calendar_disconnected: 'Calendar disconnected',
  billing_changed: 'Billing details changed',
  stripe_linked: 'Stripe customer linked',
  legacy_ghl_changed: 'Legacy GHL changed',
  set_status: 'Account status changed',
  update_step: 'Setup step updated',
};

/** "engine_on" becomes "Engine turned on". Anything unknown is made readable instead of shown raw. */
export function actionLabel(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  const t = action.replace(/[_-]+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Action';
}

export interface PageInfo {
  from: number;
  to: number;
  total: number;
  page: number;
  pages: number;
  hasPrev: boolean;
  hasNext: boolean;
}

export function pageInfo(total: number, offset: number, limit: number): PageInfo {
  const pages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(pages, Math.floor(offset / limit) + 1);
  return {
    from: total === 0 ? 0 : offset + 1,
    to: Math.min(total, offset + limit),
    total,
    page,
    pages,
    hasPrev: offset > 0,
    hasNext: offset + limit < total,
  };
}

export interface ActivityFilters {
  from: string;   // YYYY-MM-DD or ''
  to: string;     // YYYY-MM-DD or '', inclusive
  actor: string;  // admin user id or ''
  action: string; // '' for all
  search: string;
}

export const EMPTY_FILTERS: ActivityFilters = { from: '', to: '', actor: '', action: '', search: '' };

export function filtersActive(f: ActivityFilters): boolean {
  return Boolean(f.from || f.to || f.actor || f.action || f.search.trim());
}

/** The arguments for the admin_activity_list function. The "to" day is included in full. */
export function activityArgs(accountId: string, f: ActivityFilters, offset: number, limit: number): Record<string, unknown> {
  const start = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : null);
  const endExclusive = (d: string) => {
    if (!d) return null;
    const x = new Date(`${d}T00:00:00`);
    x.setDate(x.getDate() + 1);
    return x.toISOString();
  };
  return {
    p_account_id: accountId,
    p_from: start(f.from),
    p_to: endExclusive(f.to),
    p_actor: f.actor || null,
    p_action: f.action || null,
    p_search: f.search.trim() || null,
    p_limit: limit,
    p_offset: offset,
  };
}

/* ---------------------------------------------------------------- how the system is performing */

export interface Health {
  window_days: number;
  messages: { inbound: number; outbound: number; delivered: number; failed: number; queued: number };
  conversations: { started: number; booked: number; handed_off: number; opted_out: number };
  response: { avg_seconds: number; slowest_seconds: number; measured: number };
  ai: { calls: number; errors: number; fallbacks: number; blocked: number; avg_latency_ms: number; input_tokens: number; output_tokens: number };
  engine: { pending: number; failed: number; last_inbound_at: string | null; last_outbound_at: string | null };
  alerts: { sent: number; failed: number; pending: number };
  calendar: { status: string; last_synced_at: string | null; failed_writes: number };
  weather: { last_error: string | null; fetched_at: string | null; storm_mode: boolean };
  recent_errors: { at: string; kind: string; detail: string }[];
}

export interface HealthContext {
  engine_enabled: boolean;
  test_mode?: boolean;
  paused_until?: string | null;
  forwarding_status?: string | null;
  registration_status?: string | null;
}

export type ProblemLevel = 'critical' | 'warning' | 'info';
export interface Problem {
  level: ProblemLevel;
  title: string;
  detail: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const LEVEL_ORDER: Record<ProblemLevel, number> = { critical: 0, warning: 1, info: 2 };

/** Turns the raw numbers into a short list of what to look at, worst first. */
export function detectProblems(h: Health, c: HealthContext, now: number = Date.now()): Problem[] {
  const out: Problem[] = [];
  const on = c.engine_enabled;
  const paused = Boolean(c.paused_until && new Date(c.paused_until).getTime() > now);

  if (!on) out.push({ level: 'info', title: 'The engine is off', detail: 'No texts are being sent for this client.' });
  if (on && paused) out.push({ level: 'info', title: 'The engine is paused', detail: 'Texting resumes when the pause ends.' });
  if (on && c.test_mode) out.push({ level: 'info', title: 'Test mode is on', detail: 'Only the owner is being texted, not real homeowners.' });

  if (on && c.forwarding_status !== 'verified') {
    out.push({ level: 'critical', title: 'Call forwarding is not verified', detail: 'Missed calls may not be reaching the engine.' });
  }
  if (on && c.registration_status !== 'approved') {
    out.push({ level: 'critical', title: 'The texting registration is not approved', detail: 'Carriers may block these texts.' });
  }

  const m = h.messages;
  if (m.failed > 0) {
    const rate = m.outbound > 0 ? m.failed / m.outbound : 1;
    out.push({
      level: rate >= 0.05 || m.failed >= 5 ? 'critical' : 'warning',
      title: `${plural(m.failed, 'text was', 'texts were')} not delivered`,
      detail: `${Math.round(rate * 100)}% of the texts sent in this period failed to reach the phone.`,
    });
  }

  if (h.alerts.failed > 0) {
    out.push({
      level: 'critical',
      title: 'The owner is not being told',
      detail: `${plural(h.alerts.failed, 'alert text', 'alert texts')} to the owner failed to send.`,
    });
  }

  if (h.engine.failed > 0) {
    out.push({
      level: h.engine.failed >= 5 ? 'critical' : 'warning',
      title: `${plural(h.engine.failed, 'incoming text', 'incoming texts')} could not be processed`,
      detail: 'A homeowner may be waiting for a reply. You can retry them from Controls.',
    });
  }
  if (h.engine.pending > 20) {
    out.push({ level: 'warning', title: 'Texts are piling up', detail: `${h.engine.pending} are waiting to be handled.` });
  }

  if (h.ai.calls >= 10) {
    const bad = h.ai.errors + h.ai.fallbacks;
    if (h.ai.errors / h.ai.calls >= 0.1) {
      out.push({ level: 'critical', title: 'The AI is failing often', detail: `${h.ai.errors} of ${h.ai.calls} AI calls errored.` });
    } else if (bad / h.ai.calls >= 0.2) {
      out.push({ level: 'warning', title: 'The AI is falling back to fixed messages', detail: `${bad} of ${h.ai.calls} replies used a fallback or errored.` });
    }
    if (h.ai.blocked / h.ai.calls >= 0.3) {
      out.push({ level: 'warning', title: 'Many replies are blocked by the safety checks', detail: `${h.ai.blocked} of ${h.ai.calls} were blocked. The prompt may need attention.` });
    }
  }

  if (h.response.measured >= 3 && h.response.avg_seconds > 120) {
    out.push({ level: 'warning', title: 'First replies are slow', detail: `Average first reply took ${Math.round(h.response.avg_seconds / 60)} minutes.` });
  }

  if (on && h.conversations.started > 0 && m.outbound === 0) {
    out.push({ level: 'warning', title: 'Missed calls came in but no texts went out', detail: 'Check that the engine is on, not paused, and the number is connected.' });
  }

  if (h.calendar.status === 'needs_reauth') {
    out.push({ level: 'warning', title: 'The calendar needs the owner to sign in again', detail: 'Booked times are not being checked against their calendar.' });
  } else if (h.calendar.status === 'error') {
    out.push({ level: 'warning', title: 'The calendar connection has an error', detail: 'Open the Calendar tab to see the last error.' });
  }
  if (h.calendar.failed_writes > 0) {
    out.push({ level: 'warning', title: `${plural(h.calendar.failed_writes, 'booking', 'bookings')} could not be written to the calendar`, detail: 'The inspection exists, but it is not on the owner\'s calendar.' });
  }

  if (h.weather.last_error) {
    out.push({ level: 'info', title: 'Weather alerts are not updating', detail: h.weather.last_error });
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

export type HealthLevel = 'healthy' | 'attention' | 'problem';

export function healthLevel(problems: Problem[]): HealthLevel {
  if (problems.some((p) => p.level === 'critical')) return 'problem';
  if (problems.some((p) => p.level === 'warning')) return 'attention';
  return 'healthy';
}

export const HEALTH_TEXT: Record<HealthLevel, { label: string; tone: 'ok' | 'gold' | 'danger'; line: string }> = {
  healthy: { label: 'Healthy', tone: 'ok', line: 'Nothing needs your attention.' },
  attention: { label: 'Needs attention', tone: 'gold', line: 'A few things are worth a look.' },
  problem: { label: 'Problem', tone: 'danger', line: 'Something is wrong and may be costing this client leads.' },
};

export function percent(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : '—';
}

export function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : s ? `${m}m ${s}s` : `${m}m`;
}

/* ---------------------------------------------------------------- staying in sync */

export const REFRESH_CHOICES: [number, string][] = [
  [0, 'Off'],
  [30, 'Every 30 seconds'],
  [60, 'Every minute'],
  [300, 'Every 5 minutes'],
];
const REFRESH_KEY = 'ws_admin_refresh';

export function getRefreshSeconds(storage?: Pick<Storage, 'getItem'>): number {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    const raw = s?.getItem(REFRESH_KEY);
    const n = raw === null || raw === undefined ? 60 : Number(raw);
    return REFRESH_CHOICES.some(([v]) => v === n) ? n : 60;
  } catch {
    return 60;
  }
}

export function setRefreshSeconds(n: number, storage?: Pick<Storage, 'setItem'>): void {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    s?.setItem(REFRESH_KEY, String(n));
  } catch {
    /* a browser that blocks storage simply keeps the default */
  }
}

export function relativeTime(at: number | string | null | undefined, now: number = Date.now()): string {
  if (at === null || at === undefined) return 'Never';
  const t = typeof at === 'number' ? at : new Date(at).getTime();
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/* ---------------------------------------------------------------- Stripe */

export const stripeCustomerUrl = (id: string) => `https://dashboard.stripe.com/customers/${id}`;
export const isStripeCustomerId = (id: string) => /^cus_[A-Za-z0-9]{6,60}$/.test(id.trim());

export const SUBSCRIPTION_LABEL: Record<string, string> = {
  active: 'Active', trialing: 'Trial', past_due: 'Past due', unpaid: 'Unpaid', canceled: 'Canceled', paused: 'Paused',
  incomplete: 'Incomplete', incomplete_expired: 'Expired',
};
export const INVOICE_LABEL: Record<string, string> = { paid: 'Paid', open: 'Waiting', draft: 'Draft', void: 'Void', uncollectible: 'Uncollectible' };
