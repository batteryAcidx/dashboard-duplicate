import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appointmentToEvent, buildAuthUrl, emailFromIdToken, eventsToBusy, failureKind, hasCalendarScope, returnUrl, signState, verifyState, zonedMidnight,
} from '../supabase/functions/_shared/google.ts';
import { isEmail, textToHtml, validateEmailInput } from '../supabase/functions/_shared/email.ts';

const SECRET = 'a-long-random-secret-for-tests';
const NOW = 1_790_000_000;
const state = { a: 'acct-1', u: 'user-1', r: 'admin' as const, exp: NOW + 600, n: 'nonce' };

describe('the link that goes to Google and comes back', () => {
  test('a state we signed comes back intact', async () => {
    const s = await signState(state, SECRET);
    assert.deepEqual(await verifyState(s, SECRET, NOW), state);
  });
  test('a forged, changed or expired state is refused', async () => {
    const s = await signState(state, SECRET);
    assert.equal(await verifyState(s, 'another-secret', NOW), null);
    assert.equal(await verifyState(s.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')), SECRET, NOW), null, 'a changed body');
    assert.equal(await verifyState(s + 'x', SECRET, NOW), null, 'a changed signature');
    assert.equal(await verifyState(s, SECRET, NOW + 601), null, 'expired');
    assert.equal(await verifyState('', SECRET, NOW), null);
    assert.equal(await verifyState('a.b.c', SECRET, NOW), null);
    // someone swapping in a different client's id and keeping the old signature
    const [body, sig] = s.split('.');
    const evil = Buffer.from(JSON.stringify({ ...state, a: 'someone-elses' })).toString('base64url');
    assert.notEqual(evil, body);
    assert.equal(await verifyState(`${evil}.${sig}`, SECRET, NOW), null);
  });
  test('the Google address asks for a long-lived sign-in and calendar access only', () => {
    const u = new URL(buildAuthUrl({ clientId: 'cid', redirectUri: 'https://x.supabase.co/functions/v1/calendar-callback', state: 'st' }));
    assert.equal(u.origin + u.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(u.searchParams.get('access_type'), 'offline');
    assert.equal(u.searchParams.get('prompt'), 'consent');
    assert.equal(u.searchParams.get('response_type'), 'code');
    assert.equal(u.searchParams.get('state'), 'st');
    assert.equal(u.searchParams.get('scope'), 'openid email https://www.googleapis.com/auth/calendar.events');
    assert.doesNotMatch(u.searchParams.get('scope') ?? '', /gmail|drive|contacts/);
  });
  test('the email on the account comes from the id token, and the permission check works', () => {
    const idToken = `x.${Buffer.from(JSON.stringify({ email: 'owner@summit.example' })).toString('base64url')}.y`;
    assert.equal(emailFromIdToken(idToken), 'owner@summit.example');
    assert.equal(emailFromIdToken('garbage'), null);
    assert.equal(emailFromIdToken(undefined), null);
    assert.equal(hasCalendarScope('openid email https://www.googleapis.com/auth/calendar.events'), true);
    assert.equal(hasCalendarScope('openid email'), false, 'the person unticked the calendar box');
    assert.equal(hasCalendarScope(undefined), false);
  });
  test('people are sent back to the right page', () => {
    assert.equal(returnUrl('https://dashboard.wedgescale.com/', state, 'connected'), 'https://dashboard.wedgescale.com/admin/acct-1?calendar=connected');
    assert.equal(returnUrl('https://dashboard.wedgescale.com', { ...state, r: 'client' }, 'error'), 'https://dashboard.wedgescale.com/setup?calendar=error');
  });
});

describe('what Google says when something is wrong', () => {
  test('a revoked or expired sign-in means the owner has to connect again', () => {
    assert.equal(failureKind(400, { error: 'invalid_grant' }), 'needs_reauth');
    assert.equal(failureKind(401, {}), 'needs_reauth');
    assert.equal(failureKind(403, { error: { status: 'PERMISSION_DENIED' } }), 'needs_reauth');
  });
  test('busy servers are retried, missing events are fine to ignore, anything else is an error', () => {
    assert.equal(failureKind(429, {}), 'retry');
    assert.equal(failureKind(503, {}), 'retry');
    assert.equal(failureKind(404, {}), 'gone');
    assert.equal(failureKind(410, {}), 'gone');
    assert.equal(failureKind(400, { error: 'bad request' }), 'error');
  });
});

describe('copying the owner\'s busy times in', () => {
  const tz = 'America/Chicago';
  test('real events become busy blocks with only times kept', () => {
    const rows = eventsToBusy([{ id: 'e1', start: { dateTime: '2026-10-21T09:00:00-05:00' }, end: { dateTime: '2026-10-21T10:30:00-05:00' } }], tz);
    assert.deepEqual(rows, [{ id: 'e1', starts_at: '2026-10-21T14:00:00.000Z', ends_at: '2026-10-21T15:30:00.000Z' }]);
    assert.deepEqual(Object.keys(rows[0]).sort(), ['ends_at', 'id', 'starts_at']);
  });
  test('cancelled, "free" and our own inspections are not counted', () => {
    const t = (id: string, extra: object) => ({ id, start: { dateTime: '2026-10-21T09:00:00-05:00' }, end: { dateTime: '2026-10-21T10:00:00-05:00' }, ...extra });
    const rows = eventsToBusy([
      t('keep', {}), t('gone', { status: 'cancelled' }), t('free', { transparency: 'transparent' }),
      t('ours', { extendedProperties: { private: { wedgescale: '1', appointment: 'a1' } } }),
    ], tz);
    assert.deepEqual(rows.map((r) => r.id), ['keep']);
  });
  test('an all-day event blocks the whole day in the client\'s own time zone', () => {
    const rows = eventsToBusy([{ id: 'day', start: { date: '2026-10-22' }, end: { date: '2026-10-23' } }], tz);
    assert.equal(rows[0].starts_at, '2026-10-22T05:00:00.000Z');
    assert.equal(rows[0].ends_at, '2026-10-23T05:00:00.000Z');
    assert.equal(zonedMidnight('2026-11-02', tz).toISOString(), '2026-11-02T06:00:00.000Z', 'after daylight saving ends');
  });
  test('broken or empty events are skipped, and repeats of one id count once', () => {
    const rows = eventsToBusy([
      { id: 'bad' }, { id: 'zero', start: { dateTime: '2026-10-21T09:00:00Z' }, end: { dateTime: '2026-10-21T09:00:00Z' } },
      { id: 'nan', start: { dateTime: 'nope' }, end: { dateTime: 'nope' } },
      { id: 'dup', start: { dateTime: '2026-10-21T09:00:00Z' }, end: { dateTime: '2026-10-21T10:00:00Z' } },
      { id: 'dup', start: { dateTime: '2026-10-21T09:00:00Z' }, end: { dateTime: '2026-10-21T10:00:00Z' } },
    ], tz);
    assert.deepEqual(rows.map((r) => r.id), ['dup']);
  });
});

describe('writing an inspection to the owner\'s calendar', () => {
  const appt = { id: 'appt-1', status: 'scheduled', starts_at: '2026-10-21T14:00:00Z', ends_at: '2026-10-21T15:00:00Z', address: '5624 Cedar Elm Ln, Frisco', name: 'Marcus Brooks', phone: '+12145550101', issue: 'storm damage', timezone: 'America/Chicago', company: 'Summit Roofing' };
  test('the event says who, where, when and how to reach them', () => {
    const e = appointmentToEvent(appt);
    assert.equal(e.summary, 'Roof inspection: Marcus Brooks');
    assert.equal(e.location, '5624 Cedar Elm Ln, Frisco');
    assert.equal(e.start.dateTime, '2026-10-21T14:00:00.000Z');
    assert.equal(e.start.timeZone, 'America/Chicago');
    assert.match(e.description, /Phone: \+12145550101/);
    assert.match(e.description, /What they said: storm damage/);
    assert.match(e.description, /Booked automatically by Summit Roofing/);
  });
  test('it is marked as ours so it is never counted twice', () => {
    const e = appointmentToEvent(appt);
    assert.deepEqual(e.extendedProperties.private, { wedgescale: '1', appointment: 'appt-1' });
    assert.deepEqual(eventsToBusy([{ id: 'x', start: { dateTime: e.start.dateTime }, end: { dateTime: e.end.dateTime }, extendedProperties: e.extendedProperties }], 'America/Chicago'), []);
  });
  test('missing details do not break it', () => {
    const e = appointmentToEvent({ ...appt, name: null, address: null, phone: null, issue: null, ends_at: null });
    assert.equal(e.summary, 'Roof inspection: New lead');
    assert.equal(e.location, undefined);
    assert.equal(e.end.dateTime, '2026-10-21T15:00:00.000Z', 'defaults to an hour');
    assert.doesNotMatch(e.description, /Phone:|What they said/);
  });
});

describe('emails to clients', () => {
  test('what is typed can never become markup', () => {
    const html = textToHtml('Hi Mike,\n\nPlease reply with <script>alert(1)</script> & thanks.\nSecond line');
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
    assert.match(html, /&amp; thanks/);
    assert.equal((html.match(/<p /g) ?? []).length, 2, 'two paragraphs');
    assert.match(html, /Please reply[^<]*<br>/, 'a single line break is kept');
  });
  test('a subject and a message are required, and kept sensible', () => {
    assert.deepEqual(validateEmailInput('  Hello  ', ' Body '), { ok: true, subject: 'Hello', body: 'Body' });
    assert.equal(validateEmailInput('', 'x').ok, false);
    assert.equal(validateEmailInput('x', '  ').ok, false);
    assert.equal(validateEmailInput('two\nlines', 'x').ok, false, 'a subject with a line break could inject headers');
    assert.equal(validateEmailInput('x'.repeat(151), 'x').ok, false);
    assert.equal(validateEmailInput('x', 'y'.repeat(5001)).ok, false);
    assert.equal(validateEmailInput(undefined, 'x').ok, false);
  });
  test('email addresses', () => {
    assert.equal(isEmail('mike@summit.example'), true);
    assert.equal(isEmail('mike@'), false);
    assert.equal(isEmail('a b@c.com'), false);
  });
});
