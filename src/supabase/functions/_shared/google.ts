// Pure helpers for the Google Calendar connection. No network and no database in here, so all of it is tested on its own.
// Works in Deno (Edge Functions) and Node (tests).

export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/calendar.events'];
export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';
export const CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message))));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* ---------------------------------------------------------------- the "state" that travels through Google and back */

export interface OAuthState {
  a: string;                 // the client's account id
  u: string;                 // who started it
  r: 'admin' | 'client';     // where to send them back to
  exp: number;               // seconds since 1970
  n: string;                 // random, so two links are never the same
}

/** Signed so nobody can forge a link that connects a calendar to someone else's account. */
export async function signState(payload: OAuthState, secret: string): Promise<string> {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifyState(state: string, secret: string, nowSec: number = Math.floor(Date.now() / 1000)): Promise<OAuthState | null> {
  if (!state || !secret) return null;
  const [body, sig, ...rest] = state.split('.');
  if (!body || !sig || rest.length > 0) return null;
  if (!safeEqual(sig, await hmac(secret, body))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(body))) as OAuthState;
    if (typeof p.a !== 'string' || typeof p.u !== 'string' || (p.r !== 'admin' && p.r !== 'client') || typeof p.exp !== 'number') return null;
    return p.exp > nowSec ? p : null;
  } catch {
    return null;
  }
}

export function randomNonce(): string {
  return b64url(crypto.getRandomValues(new Uint8Array(12)));
}

/** access_type=offline and prompt=consent are what make Google hand back a refresh token. */
export function buildAuthUrl(o: { clientId: string; redirectUri: string; state: string; loginHint?: string }): string {
  const q = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: o.state,
  });
  if (o.loginHint) q.set('login_hint', o.loginHint);
  return `${AUTH_ENDPOINT}?${q.toString()}`;
}

/** The token endpoint hands the id token straight to us over TLS, so reading it is enough. Only the email is used. */
export function emailFromIdToken(idToken: string | undefined | null): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(idToken.split('.')[1])));
    return typeof payload.email === 'string' ? payload.email : null;
  } catch {
    return null;
  }
}

/** The consent screen must list calendar access. If the person unticked it, the connection would be useless. */
export function hasCalendarScope(scope: string | undefined | null): boolean {
  return (scope ?? '').split(' ').some((s) => s === 'https://www.googleapis.com/auth/calendar.events' || s === 'https://www.googleapis.com/auth/calendar');
}

/* ---------------------------------------------------------------- what Google says when something is wrong */

export type FailureKind = 'needs_reauth' | 'retry' | 'gone' | 'error';

export function failureKind(status: number, body?: { error?: unknown; error_description?: string } | null): FailureKind {
  const err = typeof body?.error === 'string' ? body.error : typeof (body?.error as { status?: string })?.status === 'string' ? (body?.error as { status: string }).status : '';
  if (err === 'invalid_grant' || err === 'invalid_client' || err === 'unauthorized_client') return 'needs_reauth';
  if (status === 401) return 'needs_reauth';
  if (status === 403 && /insufficient|forbidden|PERMISSION/i.test(JSON.stringify(body ?? {}))) return 'needs_reauth';
  if (status === 404 || status === 410) return 'gone';
  if (status === 429 || status >= 500) return 'retry';
  return 'error';
}

/* ---------------------------------------------------------------- reading the owner's calendar */

export interface GEvent {
  id: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

function offsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(utcMs));
  const o: Record<string, number> = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = parseInt(p.value, 10);
  return Math.round((Date.UTC(o.year, o.month - 1, o.day, o.hour % 24, o.minute, o.second) - utcMs) / 60000);
}

/** Midnight at the start of a calendar date, in a time zone, as a real moment. */
export function zonedMidnight(date: string, tz: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0);
  const o1 = offsetMinutes(guess, tz);
  let t = guess - o1 * 60000;
  const o2 = offsetMinutes(t, tz);
  if (o2 !== o1) t = guess - o2 * 60000;
  return new Date(t);
}

export const OUR_MARK = 'wedgescale';

/**
 * The owner's busy times. Skips cancelled events, ones marked "free", and the inspections WE wrote to the calendar
 * (they are already counted as appointments, so counting them again would block extra crews).
 * Only times are kept, never titles or attendees.
 */
export function eventsToBusy(items: GEvent[], tz: string): { id: string; starts_at: string; ends_at: string }[] {
  const out = new Map<string, { id: string; starts_at: string; ends_at: string }>();
  for (const e of items) {
    if (!e?.id || e.status === 'cancelled' || e.transparency === 'transparent') continue;
    if (e.extendedProperties?.private?.[OUR_MARK] === '1') continue;
    let start: Date | null = null;
    let end: Date | null = null;
    if (e.start?.dateTime && e.end?.dateTime) {
      start = new Date(e.start.dateTime);
      end = new Date(e.end.dateTime);
    } else if (e.start?.date && e.end?.date) {
      start = zonedMidnight(e.start.date, tz);
      end = zonedMidnight(e.end.date, tz);
    }
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) continue;
    out.set(e.id, { id: e.id, starts_at: start.toISOString(), ends_at: end.toISOString() });
  }
  return [...out.values()];
}

/* ---------------------------------------------------------------- writing an inspection to the owner's calendar */

export interface CalendarAppointment {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  address: string | null;
  name: string | null;
  phone: string | null;
  issue: string | null;
  timezone: string;
  company: string;
}

export function appointmentToEvent(a: CalendarAppointment) {
  const end = a.ends_at ?? new Date(new Date(a.starts_at).getTime() + 3600_000).toISOString();
  const lines = [
    a.phone ? `Phone: ${a.phone}` : '',
    a.issue ? `What they said: ${a.issue}` : '',
    `Booked automatically by ${a.company}'s missed-call assistant.`,
  ].filter(Boolean);
  return {
    summary: `Roof inspection: ${a.name?.trim() || 'New lead'}`,
    location: a.address || undefined,
    description: lines.join('\n'),
    start: { dateTime: new Date(a.starts_at).toISOString(), timeZone: a.timezone },
    end: { dateTime: new Date(end).toISOString(), timeZone: a.timezone },
    reminders: { useDefault: true },
    extendedProperties: { private: { [OUR_MARK]: '1', appointment: a.id } },
  };
}

/** Where to send the person after Google is done. */
export function returnUrl(appUrl: string, state: OAuthState, result: 'connected' | 'error'): string {
  const base = appUrl.replace(/\/+$/, '');
  return state.r === 'admin'
    ? `${base}/admin/${state.a}?calendar=${result}`
    : `${base}/setup?calendar=${result}`;
}
