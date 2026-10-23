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
