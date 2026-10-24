// Rules for the engine controls: office hours, pausing, and what must be true before the engine can be turned on.

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

