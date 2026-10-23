import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeUrgency, buildDetails, compareByUrgency, countByFilter, eventLabel, filterOf, isCountedLead, matchesFilter,
  normalizeType, showFilterBar, visibleFilters, whyWithYou,
} from '../src/lib/leadView.ts';
import { formatPhone, parseContactCsv, toE164 } from '../src/lib/contacts.ts';
import { formatBlock, zonedToUtc } from '../src/lib/tz.ts';
import {
  EMPTY_FILTERS, REFRESH_CHOICES, actionLabel, activityArgs, detectProblems, filtersActive, formatDuration, getRefreshSeconds, healthLevel, isStripeCustomerId,
  pageInfo, percent, relativeTime, setRefreshSeconds, stripeCustomerUrl,
  adminErrorText, centsToDollars, dollarsToCents, guaranteeView, hoursToText, parseHours, pauseLeft, pauseUntilIso, readiness,
} from '../src/lib/adminTools.ts';

const future = new Date(Date.now() + 86400000).toISOString();
const past = new Date(Date.now() - 86400000).toISOString();

describe('urgency and sorting', () => {
  test('emergencies first, then urgent, then the rest by newest', () => {
    const rows = [
      { id: 'a', u: 'normal' as const, at: '2026-10-22T10:00:00Z' },
      { id: 'b', u: 'urgent' as const, at: '2026-10-22T08:00:00Z' },
      { id: 'c', u: 'emergency' as const, at: '2026-10-20T08:00:00Z' },
      { id: 'd', u: 'normal' as const, at: '2026-10-22T12:00:00Z' },
      { id: 'e', u: 'urgent' as const, at: '2026-10-22T09:00:00Z' },
    ];
    const sorted = [...rows].sort((x, y) => compareByUrgency(x.u, y.u, x.at, y.at)).map((r) => r.id);
    assert.deepEqual(sorted, ['c', 'e', 'b', 'd', 'a']);
  });

  test('urgency only counts while the lead is live', () => {
    const base = { priority: false, appointments: [] as { starts_at: string; status: string }[] };
    assert.equal(activeUrgency({ ...base, status: 'following_up', urgency: 'emergency' }), 'emergency');
    assert.equal(activeUrgency({ ...base, status: 'won', urgency: 'emergency' }), 'normal');
    assert.equal(activeUrgency({ ...base, status: 'lost', urgency: 'urgent' }), 'normal');
    assert.equal(activeUrgency({ ...base, status: 'not_a_lead', urgency: 'urgent' }), 'normal');
  });

  test('once every appointment is in the past, the urgent moment is over', () => {
    assert.equal(activeUrgency({ status: 'booked', urgency: 'urgent', appointments: [{ starts_at: past, status: 'scheduled' }] }), 'normal');
    assert.equal(activeUrgency({ status: 'booked', urgency: 'urgent', appointments: [{ starts_at: future, status: 'scheduled' }] }), 'urgent');
    assert.equal(activeUrgency({ status: 'booked', urgency: 'urgent', appointments: [{ starts_at: past, status: 'cancelled' }] }), 'urgent');
  });

  test('older leads that only have the priority flag still sort as urgent', () => {
    assert.equal(activeUrgency({ status: 'booked', priority: true, appointments: [] }), 'urgent');
    assert.equal(activeUrgency({ status: 'booked', priority: true, urgency: 'emergency', appointments: [] }), 'emergency');
  });
});

describe('contact types and the filter bar', () => {
  test('rows with no type were homeowners', () => {
    assert.equal(normalizeType(undefined), 'homeowner');
    assert.equal(normalizeType(null), 'homeowner');
    assert.equal(normalizeType('nonsense'), 'homeowner');
    assert.equal(normalizeType('supplier'), 'supplier');
  });

  test('every type belongs to exactly one tab', () => {
    assert.equal(filterOf('homeowner'), 'homeowners');
    assert.equal(filterOf('past_client'), 'past');
    assert.equal(filterOf('recurring_client'), 'recurring');
    assert.equal(filterOf('supplier'), 'vendors');
    assert.equal(filterOf('crew'), 'vendors');
    assert.equal(filterOf('other'), 'vendors');
    assert.equal(filterOf('unknown'), 'unsorted');
  });

  test('counts, visible tabs and the filter bar', () => {
    const only = countByFilter(['homeowner', 'homeowner']);
    assert.equal(showFilterBar(only), false, 'owners with only homeowners never see tabs');
    const mixed = countByFilter(['homeowner', 'past_client', 'supplier', 'crew', 'unknown']);
    assert.deepEqual(mixed, { all: 5, homeowners: 1, past: 1, recurring: 0, vendors: 2, unsorted: 1 });
    assert.equal(showFilterBar(mixed), true);
    assert.deepEqual(visibleFilters(mixed), ['all', 'homeowners', 'past', 'vendors', 'unsorted']);
    assert.equal(matchesFilter('crew', 'vendors'), true);
    assert.equal(matchesFilter('crew', 'homeowners'), false);
    assert.equal(matchesFilter('crew', 'all'), true);
  });

  test('only homeowners count toward the numbers', () => {
    assert.equal(isCountedLead({ status: 'booked', contact_type: 'homeowner' }), true);
    assert.equal(isCountedLead({ status: 'following_up', contact_type: 'unknown' }), true);
    assert.equal(isCountedLead({ status: 'booked' }), true, 'older leads');
    assert.equal(isCountedLead({ status: 'needs_you', contact_type: 'past_client' }), false);
    assert.equal(isCountedLead({ status: 'not_a_lead', contact_type: 'supplier' }), false);
    assert.equal(isCountedLead({ status: 'booked', contact_type: 'recurring_client' }), false);
  });
});

describe('words on screen', () => {
  test('conversation lines for the new events', () => {
    assert.equal(eventLabel({ event_type: 'urgency_changed', detail: 'emergency: Active leak right now', actor: 'system' }), 'Flagged EMERGENCY: Active leak right now');
    assert.equal(eventLabel({ event_type: 'urgency_changed', detail: 'urgent: Storm damage', actor: 'system' }), 'Flagged PRIORITY: Storm damage');
    assert.equal(eventLabel({ event_type: 'contact_classified', detail: 'supplier (engine)', actor: 'system' }), 'Sorted as supplier');
    assert.equal(eventLabel({ event_type: 'contact_classified', detail: 'past_client (owner)', actor: 'owner' }), 'You sorted this as past client');
    assert.equal(eventLabel({ event_type: 'rescheduled', detail: 'Wed Oct 21, 09:00 AM to Thu Oct 22, 01:00 PM', actor: 'system' }), 'Wed Oct 21, 09:00 AM to Thu Oct 22, 01:00 PM');
  });

  test('the original owner lines are unchanged', () => {
    assert.equal(eventLabel({ event_type: 'status_changed', detail: 'Marked Won', actor: 'owner' }), 'You marked this Won');
    assert.equal(eventLabel({ event_type: 'lead_edited', detail: 'Job value updated to $9,500', actor: 'owner' }), 'You updated the job value to $9,500');
    assert.equal(eventLabel({ event_type: 'opted_out', detail: 'Replied STOP', actor: 'system' }), 'Replied STOP');
  });

  test('why a lead is with the owner', () => {
    assert.equal(whyWithYou('asked_for_a_person', 'homeowner'), 'They asked for a person');
    assert.equal(whyWithYou('existing_customer', 'past_client'), 'Existing customer. Flagged for you, not booked.');
    assert.equal(whyWithYou('supplier', 'supplier'), 'Vendor call. Flagged, not booked.');
    assert.equal(whyWithYou('prior_job_issue', 'past_client'), 'A problem with a previous job');
    assert.equal(whyWithYou(null, 'homeowner'), undefined);
    assert.equal(whyWithYou('something_new', 'homeowner'), 'Needs a person');
  });

  test('what the assistant learned, in plain words', () => {
    const rows = buildDetails({
      collected: { issue: 'storm damage', active_now: true, payment: 'insurance', carrier: 'Allstate', preferred_time: 'Thursday morning' },
      photoCount: 2,
    });
    assert.deepEqual(rows, [
      { label: 'Needs', value: 'storm damage' },
      { label: 'Happening now', value: 'Yes, right now' },
      { label: 'Insurance', value: 'Claim, Allstate' },
      { label: 'Preferred time', value: 'Thursday morning' },
      { label: 'Photos', value: '2 received' },
    ]);
    assert.deepEqual(buildDetails({ collected: null, photoCount: 0 }), []);
    assert.deepEqual(buildDetails({ collected: { payment: 'out_of_pocket', photo_declined: true }, photoCount: 0 }), [
      { label: 'Paying', value: 'Out of pocket' }, { label: 'Photos', value: 'Declined' },
    ]);
  });
});

describe('phone numbers and the customer import', () => {
  test('phone numbers', () => {
    assert.equal(toE164('(214) 555-0101'), '+12145550101');
    assert.equal(toE164('1-214-555-0101'), '+12145550101');
    assert.equal(toE164('214.555.0101'), '+12145550101');
    assert.equal(toE164('555-0101'), null);
    assert.equal(toE164('(014) 555-0101'), null);
    assert.equal(toE164('(214) 155-0101'), null);
    assert.equal(formatPhone('+12145550101'), '(214) 555-0101');
    assert.equal(formatPhone(null), '');
  });

  test('a pasted list with a header row, quotes and a bad line', () => {
    const csv = 'Name,Phone,Address,Last job\n"Ruiz, Dana",(214) 555-0101,"9 Elm Dr, Plano",2024 full reroof\nSam Lee,214-555-0102,,repair\nBroken,12345,,\nDana again,(214) 555-0101,,';
    const r = parseContactCsv(csv);
    assert.equal(r.rows.length, 2);
    assert.deepEqual(r.rows[0], { phone: '+12145550101', name: 'Ruiz, Dana', address: '9 Elm Dr, Plano', last_job: '2024 full reroof' });
    assert.deepEqual(r.rows[1], { phone: '+12145550102', name: 'Sam Lee', last_job: 'repair' });
    assert.deepEqual(r.skipped.map((s) => s.reason), ['No valid US or Canadian phone number', 'Duplicate number']);
  });

  test('a list with no header uses the order phone, name, address, last job', () => {
    const r = parseContactCsv('(214) 555-0101, Dana Ruiz, 9 Elm Dr, new roof\n(214) 555-0102');
    assert.equal(r.rows.length, 2);
    assert.equal(r.rows[0].name, 'Dana Ruiz');
    assert.equal(r.rows[0].last_job, 'new roof');
    assert.equal(r.rows[1].name, undefined);
  });

  test('tab separated (copied from a spreadsheet) and extra columns', () => {
    const r = parseContactCsv('Email\tCell\tCustomer\nx@y.com\t214-555-0103\tPat Kim');
    assert.deepEqual(r.rows, [{ phone: '+12145550103', name: 'Pat Kim' }]);
  });

  test('empty input and too-long lists', () => {
    assert.deepEqual(parseContactCsv('').rows, []);
    const big = Array.from({ length: 2100 }, (_, i) => `(214) ${String(200 + Math.floor(i / 9000)).padStart(3, '2')}-${String(1000 + i).padStart(4, '0')},Name ${i}`).join('\n');
    const r = parseContactCsv(big);
    assert.equal(r.rows.length, 2000);
    assert.equal(r.tooMany, true);
  });
});

describe('time zones for blocked times', () => {
  test('a time typed in Chicago becomes the right moment', () => {
    assert.equal(zonedToUtc('2026-10-21', '09:30', 'America/Chicago')?.toISOString(), '2026-10-21T14:30:00.000Z');
    assert.equal(zonedToUtc('2026-12-21', '09:30', 'America/Chicago')?.toISOString(), '2026-12-21T15:30:00.000Z');
    assert.equal(zonedToUtc('2026-10-21', '09:30', 'America/New_York')?.toISOString(), '2026-10-21T13:30:00.000Z');
    assert.equal(zonedToUtc('2026-10-21', '09:30', 'America/Los_Angeles')?.toISOString(), '2026-10-21T16:30:00.000Z');
  });
  test('daylight saving changes are handled', () => {
    assert.equal(zonedToUtc('2026-11-01', '12:00', 'America/Chicago')?.toISOString(), '2026-11-01T18:00:00.000Z');
    assert.equal(zonedToUtc('2026-10-31', '12:00', 'America/Chicago')?.toISOString(), '2026-10-31T17:00:00.000Z');
  });
  test('bad input', () => {
    assert.equal(zonedToUtc('21/10/2026', '09:30', 'America/Chicago'), null);
    assert.equal(zonedToUtc('2026-10-21', '9:30', 'America/Chicago'), null);
  });
  test('a block is shown in the account time zone', () => {
    assert.equal(formatBlock('2026-10-21T14:30:00Z', '2026-10-21T16:00:00Z', 'America/Chicago'), 'Wed, Oct 21, 9:30 AM to 11:00 AM');
  });
});


describe('admin helpers', () => {
  test('follow-up hours', () => {
    assert.deepEqual(parseHours('4, 24, 72, 120, 168'), { ok: true, hours: [4, 24, 72, 120, 168] });
    assert.deepEqual(parseHours('4 24;72'), { ok: true, hours: [4, 24, 72] });
    assert.deepEqual(parseHours(''), { ok: true, hours: [] });
    assert.equal(parseHours('4, 4').ok, false);
    assert.equal(parseHours('24, 4').ok, false);
    assert.equal(parseHours('0, 5').ok, false);
    assert.equal(parseHours('1.5').ok, false);
    assert.equal(parseHours('900').ok, false);
    assert.equal(parseHours('abc').ok, false);
    assert.equal(parseHours('1,2,3,4,5,6,7,8,9,10,11').ok, false);
    assert.equal(hoursToText([4, 24, 72]), '4, 24, 72');
    assert.equal(hoursToText(null), '');
  });

  test('money', () => {
    assert.equal(centsToDollars(69700), '$697');
    assert.equal(centsToDollars(69750), '$697.50');
    assert.equal(centsToDollars(-69700), '-$697');
    assert.equal(centsToDollars(123456700), '$1,234,567');
    assert.equal(centsToDollars(0), '$0');
    assert.equal(dollarsToCents('697'), 69700);
    assert.equal(dollarsToCents('$1,250.50'), 125050);
    assert.equal(dollarsToCents('-697'), -69700);
    assert.equal(dollarsToCents('12.345'), null);
    assert.equal(dollarsToCents('abc'), null);
    assert.equal(dollarsToCents(''), null);
    assert.equal(dollarsToCents('999999999'), null);
  });

  test('the guarantee in plain words', () => {
    assert.deepEqual(guaranteeView({ status: 'met', booked: 3 }), { label: 'Met', tone: 'ok', detail: '3 inspections booked in the first 30 days.' });
    assert.equal(guaranteeView({ status: 'in_progress', booked: 1, required: 2, days_left: 12 }).detail, '1 of 2 booked, 12 days left in the window.');
    assert.equal(guaranteeView({ status: 'in_progress', booked: 0, required: 2, days_left: 1 }).detail, '0 of 2 booked, 1 day left in the window.');
    const due = guaranteeView({ status: 'credit_due', booked: 1, calls_per_week: 8.2 });
    assert.equal(due.tone, 'danger');
    assert.match(due.detail, /The next month is free/);
    assert.match(guaranteeView({ status: 'not_eligible', calls_per_week: 2.1 }).detail, /under the 6/);
    assert.equal(guaranteeView({ status: 'not_started' }).label, 'Not started');
    assert.equal(guaranteeView({ status: 'waived' }).label, 'Waived');
  });

  test('pauses', () => {
    const now = new Date('2026-10-20T20:00:00Z').getTime();
    assert.equal(pauseUntilIso(4, now), '2026-10-21T00:00:00.000Z');
    assert.equal(pauseLeft('2026-10-20T22:15:00Z', now), '2h 15m left');
    assert.equal(pauseLeft('2026-10-20T20:30:00Z', now), '30m left');
    assert.equal(pauseLeft('2026-10-20T19:00:00Z', now), null, 'a finished pause shows nothing');
    assert.equal(pauseLeft(null, now), null);
  });

  test('what blocks the engine from turning on', () => {
    assert.equal(readiness({}).ready, false);
    const all = readiness({ account_status: 'live', registration_status: 'approved', phone_number: '+12145550100', twilio_ready: true, forwarding_status: 'verified' });
    assert.equal(all.ready, true);
    const missing = readiness({ account_status: 'live', registration_status: 'pending', phone_number: '+12145550100', twilio_ready: true, forwarding_status: 'pending' });
    assert.equal(missing.registrationApproved, false);
    assert.equal(missing.forwardingVerified, false);
    assert.equal(missing.accountLive, true);
    assert.equal(missing.ready, false);
  });

  test('error messages are in plain words', () => {
    assert.match(adminErrorText('mfa_required'), /authenticator code/);
    assert.match(adminErrorText('not_ready'), /approved registration/);
    assert.match(adminErrorText('new row for relation "x" violates check constraint "y"'), /not allowed/);
    assert.match(adminErrorText('duplicate key value violates unique constraint'), /already in use/);
    assert.match(adminErrorText('boom'), /Something went wrong/);
  });
});


describe('activity log helpers', () => {
  test('actions read like sentences', () => {
    assert.equal(actionLabel('engine_on'), 'Engine turned on');
    assert.equal(actionLabel('set_status'), 'Account status changed');
    assert.equal(actionLabel('some_new_thing'), 'Some new thing');
    assert.equal(actionLabel(''), 'Action');
  });

  test('page numbers', () => {
    assert.deepEqual(pageInfo(53, 0, 25), { from: 1, to: 25, total: 53, page: 1, pages: 3, hasPrev: false, hasNext: true });
    assert.deepEqual(pageInfo(53, 25, 25), { from: 26, to: 50, total: 53, page: 2, pages: 3, hasPrev: true, hasNext: true });
    assert.deepEqual(pageInfo(53, 50, 25), { from: 51, to: 53, total: 53, page: 3, pages: 3, hasPrev: true, hasNext: false });
    assert.deepEqual(pageInfo(0, 0, 25), { from: 0, to: 0, total: 0, page: 1, pages: 1, hasPrev: false, hasNext: false });
  });

  test('filters become function arguments, and the last day is included in full', () => {
    assert.equal(filtersActive(EMPTY_FILTERS), false);
    assert.equal(filtersActive({ ...EMPTY_FILTERS, search: '  ' }), false);
    assert.equal(filtersActive({ ...EMPTY_FILTERS, action: 'engine_on' }), true);
    const a = activityArgs('acct', { from: '2026-10-01', to: '2026-10-03', actor: 'u1', action: 'engine_on', search: ' leak ' }, 50, 25) as Record<string, string>;
    assert.equal(a.p_account_id, 'acct');
    assert.equal(a.p_actor, 'u1');
    assert.equal(a.p_action, 'engine_on');
    assert.equal(a.p_search, 'leak');
    assert.equal(a.p_limit, 25 as unknown as string);
    assert.equal(a.p_offset, 50 as unknown as string);
    const from = new Date(a.p_from).getTime();
    const to = new Date(a.p_to).getTime();
    assert.equal(Math.round((to - from) / 86400000), 3, 'Oct 1 to Oct 3 inclusive is three days');
    const none = activityArgs('acct', EMPTY_FILTERS, 0, 25) as Record<string, unknown>;
    assert.deepEqual([none.p_from, none.p_to, none.p_actor, none.p_action, none.p_search], [null, null, null, null, null]);
  });
});

const calmHealth = () => ({
  window_days: 7,
  messages: { inbound: 20, outbound: 22, delivered: 22, failed: 0, queued: 0 },
  conversations: { started: 12, booked: 5, handed_off: 1, opted_out: 0 },
  response: { avg_seconds: 45, slowest_seconds: 90, measured: 12 },
  ai: { calls: 40, errors: 0, fallbacks: 1, blocked: 2, avg_latency_ms: 1100, input_tokens: 20000, output_tokens: 2400 },
  engine: { pending: 0, failed: 0, last_inbound_at: null, last_outbound_at: null },
  alerts: { sent: 6, failed: 0, pending: 0 },
  calendar: { status: 'not_connected', last_synced_at: null, failed_writes: 0 },
  weather: { last_error: null, fetched_at: null, storm_mode: false },
  recent_errors: [],
});
const liveCtx = { engine_enabled: true, forwarding_status: 'verified', registration_status: 'approved' };

describe('how the system is performing: what is wrong', () => {
  test('a healthy client has nothing to report', () => {
    const p = detectProblems(calmHealth(), liveCtx);
    assert.deepEqual(p, []);
    assert.equal(healthLevel(p), 'healthy');
  });

  test('an engine that is off or paused is only information', () => {
    const off = detectProblems(calmHealth(), { engine_enabled: false });
    assert.deepEqual(off.map((x) => x.level), ['info']);
    assert.equal(healthLevel(off), 'healthy');
    const paused = detectProblems(calmHealth(), { ...liveCtx, paused_until: new Date(Date.now() + 3600000).toISOString() });
    assert.equal(paused[0].title, 'The engine is paused');
    const test = detectProblems(calmHealth(), { ...liveCtx, test_mode: true });
    assert.equal(test[0].title, 'Test mode is on');
  });

  test('a live engine with forwarding or registration missing is critical', () => {
    const p = detectProblems(calmHealth(), { engine_enabled: true, forwarding_status: 'pending', registration_status: 'pending' });
    assert.deepEqual(p.map((x) => x.title), ['Call forwarding is not verified', 'The texting registration is not approved']);
    assert.equal(healthLevel(p), 'problem');
  });

  test('texts that do not arrive, and an owner who is not told, are the worst problems', () => {
    const h = calmHealth();
    h.messages.failed = 3;
    h.alerts.failed = 2;
    const p = detectProblems(h, liveCtx);
    assert.equal(p[0].level, 'critical');
    assert.ok(p.some((x) => x.title === 'The owner is not being told'));
    assert.ok(p.some((x) => /3 texts were not delivered/.test(x.title)));
    const one = calmHealth();
    one.messages.outbound = 100;
    one.messages.failed = 1;
    const w = detectProblems(one, liveCtx);
    assert.equal(w[0].level, 'warning', 'one failure in 100 is only a warning');
    assert.match(w[0].title, /1 text was not delivered/);
  });

  test('AI trouble only counts once there is enough to judge', () => {
    const few = calmHealth();
    few.ai = { ...few.ai, calls: 5, errors: 5 };
    assert.deepEqual(detectProblems(few, liveCtx), []);
    const bad = calmHealth();
    bad.ai = { ...bad.ai, calls: 20, errors: 4, fallbacks: 0 };
    assert.equal(detectProblems(bad, liveCtx)[0].title, 'The AI is failing often');
    const fb = calmHealth();
    fb.ai = { ...fb.ai, calls: 20, errors: 0, fallbacks: 5 };
    assert.equal(detectProblems(fb, liveCtx)[0].title, 'The AI is falling back to fixed messages');
    const blocked = calmHealth();
    blocked.ai = { ...blocked.ai, calls: 20, blocked: 8 };
    assert.match(detectProblems(blocked, liveCtx)[0].title, /blocked by the safety checks/);
  });

  test('slow replies, a stuck queue, a quiet engine and calendar trouble', () => {
    const slow = calmHealth();
    slow.response = { avg_seconds: 400, slowest_seconds: 900, measured: 6 };
    assert.match(detectProblems(slow, liveCtx)[0].detail, /7 minutes/);
    const stuck = calmHealth();
    stuck.engine.pending = 50;
    assert.equal(detectProblems(stuck, liveCtx)[0].title, 'Texts are piling up');
    const quiet = calmHealth();
    quiet.messages.outbound = 0;
    assert.match(detectProblems(quiet, liveCtx)[0].title, /no texts went out/);
    const cal = calmHealth();
    cal.calendar = { status: 'needs_reauth', last_synced_at: null, failed_writes: 2 };
    const titles = detectProblems(cal, liveCtx).map((x) => x.title);
    assert.ok(titles.some((t) => /sign in again/.test(t)));
    assert.ok(titles.some((t) => /2 bookings could not be written/.test(t)));
  });

  test('problems are listed worst first', () => {
    const h = calmHealth();
    h.weather.last_error = 'NWS 503';
    h.engine.failed = 1;
    h.alerts.failed = 1;
    assert.deepEqual(detectProblems(h, liveCtx).map((x) => x.level), ['critical', 'warning', 'info']);
  });

  test('numbers for the cards', () => {
    assert.equal(percent(22, 22), '100%');
    assert.equal(percent(1, 3), '33%');
    assert.equal(percent(0, 0), '—');
    assert.equal(formatDuration(0), '—');
    assert.equal(formatDuration(45), '45s');
    assert.equal(formatDuration(125), '2m 5s');
    assert.equal(formatDuration(180), '3m');
    assert.equal(formatDuration(3900), '1h 5m');
  });
});

describe('staying in sync, and Stripe links', () => {
  test('the refresh setting defaults to a minute and ignores nonsense', () => {
    assert.equal(getRefreshSeconds({ getItem: () => null }), 60);
    assert.equal(getRefreshSeconds({ getItem: () => '30' }), 30);
    assert.equal(getRefreshSeconds({ getItem: () => '0' }), 0);
    assert.equal(getRefreshSeconds({ getItem: () => '7' }), 60);
    assert.equal(getRefreshSeconds({ getItem: () => { throw new Error('blocked'); } }), 60);
    let saved = '';
    setRefreshSeconds(300, { setItem: (_k, v) => { saved = v; } });
    assert.equal(saved, '300');
    assert.equal(REFRESH_CHOICES.length, 4);
  });

  test('"updated" text', () => {
    const now = 1_000_000_000_000;
    assert.equal(relativeTime(now - 3000, now), 'just now');
    assert.equal(relativeTime(now - 25000, now), '25s ago');
    assert.equal(relativeTime(now - 5 * 60000, now), '5 min ago');
    assert.equal(relativeTime(now - 3 * 3600000, now), '3 h ago');
    assert.equal(relativeTime(new Date(now - 2 * 86400000).toISOString(), now), '2 d ago');
    assert.equal(relativeTime(null, now), 'Never');
  });

  test('Stripe customer ids and links', () => {
    assert.equal(isStripeCustomerId('cus_NffrFeUfNV2Hib'), true);
    assert.equal(isStripeCustomerId(' cus_NffrFeUfNV2Hib '), true);
    assert.equal(isStripeCustomerId('cust_123'), false);
    assert.equal(isStripeCustomerId('cus_12'), false);
    assert.equal(isStripeCustomerId(''), false);
    assert.equal(stripeCustomerUrl('cus_abc123456'), 'https://dashboard.stripe.com/customers/cus_abc123456');
  });
});
