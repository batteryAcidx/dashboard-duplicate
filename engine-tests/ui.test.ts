import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeUrgency, buildDetails, compareByUrgency, countByFilter, eventLabel, filterOf, isCountedLead, matchesFilter,
  normalizeType, showFilterBar, visibleFilters, whyWithYou,
} from '../src/lib/leadView.ts';
import { formatPhone, parseContactCsv, toE164 } from '../src/lib/contacts.ts';
import { formatBlock, zonedToUtc } from '../src/lib/tz.ts';
import {
  INFO_PRESETS, answersToRows, buildStepEmail, businessKeysIn, firstName, keyFromLabel, mailtoHref, mailtoTooLong, suggestPreset, validateFields,
} from '../src/domain/setup.ts';

/** presets are looked up by name, so adding a new one never breaks a test that wanted another */
const PRESET = (id: string) => INFO_PRESETS.find((p) => p.id === id)!;
import {
  EMPTY_DRAFT, cleanDraft, draftAsks, draftFromStep, needLine, outcomePhrase, sameDraft, stepChanges, validateDraft,
} from '../src/domain/setup.ts';
import { START_HERE, WIKI_TOPICS, isWikiTopic } from '../src/integrations/wiki.ts';
import {
  activeOwnerTab, adminMenu, ownerMenu, ownerTabs, parseTarget,
  EMPTY_REGISTRATION, PATH_LABEL, REGISTRATION_STATUS, einDigits, errorCount, formFromSaved, formatEin, isHttpsLink, isPluggedIn, maskEin,
  registrationErrorText, registrationLocked, registrationPath, registrationPayload, validateRegistration,
} from '../src/domain/index.ts';
import { getGuideProgress, setGuideProgress } from '../src/lib/preferences.ts';
import { INTEGRATIONS, integrationInfo } from '../src/integrations/catalog.ts';
import {
  EMPTY_FILTERS,
  actionLabel,
  activityArgs,
  detectProblems,
  filtersActive,
  formatDuration,
  healthLevel,
  isStripeCustomerId,
  pageInfo,
  percent,
  relativeTime,
  stripeCustomerUrl,
  adminErrorText,
  centsToDollars,
  dollarsToCents,
  guaranteeView,
  hoursToText,
  parseHours,
  pauseLeft,
  pauseUntilIso,
  readiness,
} from '../src/domain/index.ts';
import { REFRESH_CHOICES, getRefreshSeconds, setRefreshSeconds } from '../src/lib/preferences.ts';

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


describe('setup requests', () => {
  test('presets are valid, ready to use, and cover the common asks', () => {
    assert.deepEqual(INFO_PRESETS.map((p) => p.id), ['registration', 'business', 'owner', 'forwarding', 'calendar']);
    for (const p of INFO_PRESETS) assert.equal(validateFields(p.fields), null, p.id);
    assert.equal(INFO_PRESETS.find((p) => p.id === 'calendar')?.action, 'connect_calendar');
    assert.equal(INFO_PRESETS.find((p) => p.id === 'registration')?.action, 'registration_form');
    assert.ok(INFO_PRESETS.find((p) => p.id === 'business')!.fields.some((f) => f.key === 'legal_name' && f.required));
  });

  test('a preset is suggested from the step name', () => {
    assert.equal(suggestPreset({ step_key: 'calendar_connected', title: 'Connect your calendar' }), 'calendar');
    assert.equal(suggestPreset({ step_key: 'call_forwarding', title: 'Forward missed calls' }), 'forwarding');
    assert.equal(suggestPreset({ step_key: 'brand_registration', title: 'Business registration' }), 'registration');
    assert.equal(suggestPreset({ step_key: 'business_profile', title: 'Business details' }), 'business');
    assert.equal(suggestPreset({ step_key: 'owner_phone', title: 'Who should we text?' }), 'owner');
    assert.equal(suggestPreset({ step_key: 'kickoff', title: 'Kickoff call' }), null);
  });

  test('the same checks as the database', () => {
    assert.equal(validateFields([]), null);
    assert.match(validateFields([{ key: 'a', label: '', type: 'text' }]) ?? '', /label/);
    assert.match(validateFields([{ key: 'a', label: 'A', type: 'text' }, { key: 'a', label: 'B', type: 'text' }]) ?? '', /called the same/);
    assert.match(validateFields([{ key: 'Bad Key', label: 'X', type: 'text' }]) ?? '', /simpler name/);
    assert.match(validateFields([{ key: 'c', label: 'Choice', type: 'select', options: [] }]) ?? '', /choices/);
    assert.match(validateFields(Array.from({ length: 9 }, (_, i) => ({ key: `k${i}`, label: `K${i}`, type: 'text' as const }))) ?? '', /at most 8/);
  });

  test('a label becomes a safe key', () => {
    assert.equal(keyFromLabel('Legal business name'), 'legal_business_name');
    assert.equal(keyFromLabel('  Your phone # '), 'your_phone');
    assert.equal(keyFromLabel('123 numbers'), 'f_123_numbers');
    assert.equal(keyFromLabel('!!!'), '');
    assert.ok(keyFromLabel('x'.repeat(80)).length <= 40);
  });

  test('answers are shown in the order asked, and only what was answered', () => {
    const fields = PRESET('owner').fields;
    assert.deepEqual(answersToRows(fields, { contact_phone: '(214) 555-0100', contact_name: 'Mike' }), [
      { label: 'Your name', value: 'Mike' }, { label: 'Mobile number for booking alerts', value: '(214) 555-0100' },
    ]);
    assert.deepEqual(answersToRows(fields, null), []);
    assert.deepEqual(businessKeysIn({ legal_name: 'X', crew: '4-10', city: 'Dallas' }), ['legal_name', 'city']);
    assert.deepEqual(businessKeysIn(null), []);
  });

  test('the email draft is friendly, names what is needed, and says it is optional', () => {
    const e = buildStepEmail({
      ownerName: 'Mike Brooks', stepTitle: 'Business details', prompt: 'We need a few details for the registration.',
      fields: PRESET('business').fields.slice(0, 2), link: 'https://dashboard.wedgescale.com/setup', signer: 'Vlad at WedgeScale',
    });
    assert.equal(e.subject, 'Quick question about Business details');
    assert.match(e.body, /^Hi Mike,\n\nWe need a few details for the registration\./);
    assert.match(e.body, /- Legal business name\n- Website \(optional\)/);
    assert.match(e.body, /reply right here with it, or add it in your dashboard whenever suits you: https:\/\/dashboard\.wedgescale\.com\/setup/);
    assert.match(e.body, /no rush/);
    assert.match(e.body, /Vlad at WedgeScale$/);
    const cal = buildStepEmail({ ownerEmail: 'mike.b@x.co', stepTitle: 'Calendar', fields: [], action: 'connect_calendar', link: 'L' });
    assert.match(cal.body, /^Hi Mike,/);
    assert.match(cal.body, /sign in with Google/);
    assert.match(cal.body, /The WedgeScale team$/);
  });

  test('first names and the mail link', () => {
    assert.equal(firstName('Mike Brooks'), 'Mike');
    assert.equal(firstName(null, 'dana.ruiz@x.co'), 'Dana');
    assert.equal(firstName('', ''), 'there');
    const href = mailtoHref('mike@x.co', 'Hello there', 'Line one\nLine two & more');
    assert.equal(href, 'mailto:mike@x.co?subject=Hello%20there&body=Line%20one%0ALine%20two%20%26%20more');
    assert.equal(mailtoTooLong(href), false);
    assert.equal(mailtoTooLong(mailtoHref('a@b.co', 's', 'x'.repeat(2000))), true);
  });
});


const goodForm = () => ({
  ...EMPTY_REGISTRATION, business_type: 'llc', legal_name: 'Summit Roofing LLC', ein: '12-3456789', address1: '1 Main St', city: 'Dallas', region: 'TX',
  postal_code: '75201', contact_name: 'Mike Brooks', contact_email: 'mike@summit.example', contact_phone: '(214) 555-0100', authorized: true,
});

describe('the business registration form', () => {
  test('an empty form lists everything that is missing, in plain words', () => {
    const e = validateRegistration(EMPTY_REGISTRATION);
    for (const k of ['business_type', 'legal_name', 'ein', 'address1', 'city', 'region', 'postal_code', 'contact_name', 'contact_email', 'contact_phone', 'authorized'] as const) {
      assert.ok(e[k], `${k} should be reported`);
    }
    assert.equal(errorCount(e), 11);
    assert.match(e.legal_name!, /IRS letter/);
  });

  test('a complete form has no errors', () => {
    assert.deepEqual(validateRegistration(goodForm()), {});
  });

  test('the EIN: 9 digits, formatted as you type, and never required again once saved', () => {
    assert.equal(einDigits('12-3456789 '), '123456789');
    assert.equal(einDigits('1234567890123'), '123456789', 'extra digits are cut');
    assert.equal(formatEin('1'), '1');
    assert.equal(formatEin('12'), '12');
    assert.equal(formatEin('123'), '12-3');
    assert.equal(formatEin('123456789'), '12-3456789');
    assert.ok(validateRegistration({ ...goodForm(), ein: '12-345' }).ein);
    assert.equal(validateRegistration({ ...goodForm(), ein: '' }, { hasSavedEin: true }).ein, undefined, 'blank keeps the saved EIN');
    assert.ok(validateRegistration({ ...goodForm(), ein: '' }, { hasSavedEin: false }).ein);
    assert.equal(maskEin('6789'), '••-•••6789');
    assert.equal(maskEin(null), 'Not given');
  });

  test('no EIN is allowed only for a sole proprietor, and that is the path used', () => {
    assert.ok(validateRegistration({ ...goodForm(), has_ein: false, ein: '' }).has_ein, 'an LLC with no EIN is refused');
    assert.deepEqual(validateRegistration({ ...goodForm(), business_type: 'sole_proprietor', has_ein: false, ein: '' }), {});
    assert.equal(registrationPath(true), 'standard');
    assert.equal(registrationPath(false), 'sole_proprietor');
    assert.match(PATH_LABEL.standard, /has an EIN/);
  });

  test('email, phone, website and the authorisation tick are checked', () => {
    assert.ok(validateRegistration({ ...goodForm(), contact_email: 'nope' }).contact_email);
    assert.ok(validateRegistration({ ...goodForm(), contact_phone: '555' }).contact_phone);
    assert.equal(validateRegistration({ ...goodForm(), contact_phone: '2145550100' }).contact_phone, undefined);
    assert.ok(validateRegistration({ ...goodForm(), website: 'summit.example' }).website);
    assert.equal(validateRegistration({ ...goodForm(), website: '' }).website, undefined, 'website is optional');
    assert.ok(validateRegistration({ ...goodForm(), authorized: false }).authorized);
  });

  test('the EIN travels on its own, so it is never part of a stored form', () => {
    const { data, ein } = registrationPayload(goodForm());
    assert.equal(ein, '12-3456789');
    assert.equal('ein' in data, false);
    assert.doesNotMatch(JSON.stringify(data), /3456789/);
    assert.equal(registrationPayload({ ...goodForm(), has_ein: false, business_type: 'sole_proprietor' }).ein, null);
    assert.equal(registrationPayload({ ...goodForm(), ein: '' }).ein, null, 'blank means keep the saved one');
  });

  test('what we saved comes back into the form, without the EIN', () => {
    assert.deepEqual(formFromSaved(null), EMPTY_REGISTRATION);
    const f = formFromSaved({ business_type: 'llc', legal_name: 'X LLC', has_ein: true, ein_last4: '6789', country: 'CA', authorized: true });
    assert.equal(f.legal_name, 'X LLC');
    assert.equal(f.ein, '');
    assert.equal(f.country, 'CA');
    assert.equal(f.authorized, true);
  });

  test('once approved it is locked, and every status reads sensibly to the client', () => {
    assert.equal(registrationLocked('submitted'), false);
    assert.equal(registrationLocked('needs_changes'), false);
    assert.equal(registrationLocked('ready'), true);
    assert.equal(registrationLocked('sent_to_twilio'), true);
    for (const k of ['draft', 'submitted', 'needs_changes', 'ready', 'sent_to_twilio']) assert.ok(REGISTRATION_STATUS[k].clientLine.length > 5, k);
  });

  test('database refusals become sentences', () => {
    assert.match(registrationErrorText('locked'), /being filed/);
    assert.match(registrationErrorText('bad_ein'), /9 digits/);
    assert.match(registrationErrorText('ein_required'), /sole proprietor/);
    assert.match(registrationErrorText('schema "vault" does not exist'), /securely/);
    assert.match(registrationErrorText('boom'), /email us/);
  });
});

describe('links, and the email that goes with a step', () => {
  test('only secure links are accepted', () => {
    assert.equal(isHttpsLink('https://forms.example.com/a'), true);
    assert.equal(isHttpsLink('http://forms.example.com'), false);
    assert.equal(isHttpsLink('javascript:alert(1)'), false);
    assert.equal(isHttpsLink('https://has space.com'), false);
    assert.equal(isHttpsLink('https://' + 'a'.repeat(600)), false);
  });

  test('the registration email never asks for the EIN by email', () => {
    const e = buildStepEmail({ ownerName: 'Mike', stepTitle: 'Business registration', fields: [], action: 'registration_form', kind: 'secure_form', link: 'https://dashboard.wedgescale.com/registration' });
    assert.match(e.body, /secure form rather than replying by email/);
    assert.match(e.body, /last 4 digits/);
    assert.match(e.body, /dashboard\.wedgescale\.com\/registration/);
    assert.doesNotMatch(e.body, /reply right here/);
  });

  test('a link step says where to go, and still allows a reply', () => {
    const e = buildStepEmail({ ownerName: 'Mike', stepTitle: 'Insurance', fields: [], kind: 'external', link: 'https://forms.example.com/ins' });
    assert.match(e.body, /Here is the link: https:\/\/forms\.example\.com\/ins/);
    assert.match(e.body, /reply to this email/);
  });
});

describe('integrations: the catalog, the guides and the waiting list', () => {
  const ctx = { backendUrl: 'https://abcd1234.supabase.co', appUrl: 'https://dashboard.wedgescale.com' };

  test('a service is hidden only when the backend clearly says it is not set up', () => {
    assert.equal(isPluggedIn(undefined), true, 'unknown never locks anyone out');
    assert.equal(isPluggedIn({ state: 'unknown', missing: [] }), true);
    assert.equal(isPluggedIn({ state: 'ready', missing: [] }), true);
    assert.equal(isPluggedIn({ state: 'manual', missing: [] }), true);
    assert.equal(isPluggedIn({ state: 'not_configured', missing: ['X'] }), false);
  });

  test('every service has a catalog entry and a complete guide', () => {
    assert.deepEqual(INTEGRATIONS.map((i) => i.id).sort(), ['call_forwarding', 'email', 'google_calendar', 'stripe', 'twilio']);
    for (const info of INTEGRATIONS) {
      const g = info.guide(ctx);
      assert.equal(g.id, info.id);
      assert.ok(g.intro.length > 40 && g.time && g.cost, info.id);
      assert.ok(g.steps.length >= 3, info.id);
      assert.ok(g.checks.length >= 1, info.id);
      for (const st of g.steps) assert.ok(st.title && st.body.length > 0, `${info.id}: ${st.title}`);
      assert.ok(info.unlocks.length >= 1 && info.withoutIt.length > 10, info.id);
    }
    assert.throws(() => integrationInfo('nope' as never), /Unknown integration/);
  });

  test('the guides give the real addresses to paste', () => {
    const copy = (id: string) => JSON.stringify(integrationInfo(id as never).guide(ctx));
    assert.match(copy('stripe'), /https:\/\/abcd1234\.supabase\.co\/functions\/v1\/stripe-webhook/);
    assert.match(copy('google_calendar'), /https:\/\/abcd1234\.supabase\.co\/functions\/v1\/calendar-callback/);
    assert.match(copy('google_calendar'), /https:\/\/dashboard\.wedgescale\.com/);
    assert.match(copy('google_calendar'), /calendar\.events/);
  });

  test('guide progress is remembered, cleaned up, and survives a blocked browser', () => {
    let saved = '';
    setGuideProgress('stripe', [3, 1, 1, 2], { setItem: (_k, v) => { saved = v; } });
    assert.equal(saved, '[1,2,3]');
    assert.deepEqual(getGuideProgress('stripe', { getItem: () => '[2,0,"x",-1]' }), [2, 0]);
    assert.deepEqual(getGuideProgress('stripe', { getItem: () => 'not json' }), []);
    assert.deepEqual(getGuideProgress('stripe', { getItem: () => { throw new Error('blocked'); } }), []);
  });

});


describe('one Save button: knowing what changed on a step', () => {
  const step = {
    status: 'pending', note: null as string | null, info_prompt: 'We need details.', info_fields: [{ key: 'a', label: 'Name', type: 'text' as const }],
    action: null as string | null, info_link: null as string | null, info_link_label: null as string | null,
  };

  test('an untouched step has nothing to save', () => {
    const c = stepChanges(step, 'pending', '', draftFromStep(step));
    assert.deepEqual(c, { statusOrNote: false, request: false, any: false });
  });

  test('changing only the status, or only the note, or only the request is each noticed on its own', () => {
    const d = draftFromStep(step);
    assert.deepEqual(stepChanges(step, 'done', '', d), { statusOrNote: true, request: false, any: true });
    assert.deepEqual(stepChanges(step, 'pending', 'hello', d), { statusOrNote: true, request: false, any: true });
    assert.deepEqual(stepChanges(step, 'pending', '', { ...d, prompt: 'Different.' }), { statusOrNote: false, request: true, any: true });
  });

  test('changing both is one change to save, not two', () => {
    const d = draftFromStep(step);
    const c = stepChanges(step, 'waiting_on_you', 'Please send it', { ...d, action: 'registration_form' });
    assert.deepEqual(c, { statusOrNote: true, request: true, any: true });
  });

  test('typing a space, or toggling "required" off and on, is not a change', () => {
    const d = draftFromStep(step);
    assert.equal(sameDraft(d, { ...d, prompt: '  We need details.  ' }), true);
    assert.equal(sameDraft(d, { ...d, fields: [{ ...d.fields[0], required: false }] }), true);
    assert.equal(sameDraft(d, { ...d, fields: [{ ...d.fields[0], label: ' Name ' }] }), true);
    assert.equal(sameDraft(d, { ...d, fields: [{ ...d.fields[0], required: true }] }), false);
  });

  test('a button text with no link does not count, and a draft that asks for nothing says so', () => {
    assert.equal(cleanDraft({ ...EMPTY_DRAFT, linkLabel: 'Open it' }).linkLabel, '');
    assert.equal(draftAsks(EMPTY_DRAFT), false);
    assert.equal(draftAsks({ ...EMPTY_DRAFT, action: 'connect_calendar' }), true);
    assert.equal(draftAsks({ ...EMPTY_DRAFT, link: 'https://x.co' }), true);
  });

  test('a draft cannot be saved with a bad question or an insecure link', () => {
    assert.equal(validateDraft(draftFromStep(step)), null);
    assert.match(validateDraft({ ...EMPTY_DRAFT, fields: [{ key: 'a', label: '', type: 'text' }] }) ?? '', /label/);
    assert.match(validateDraft({ ...EMPTY_DRAFT, link: 'http://x.co' }) ?? '', /https/);
    assert.equal(validateDraft({ ...EMPTY_DRAFT, link: 'https://x.co' }), null);
  });

  test('"Stop asking" is just an empty draft, saved with everything else', () => {
    assert.equal(stepChanges(step, 'pending', '', EMPTY_DRAFT).request, true);
    assert.equal(stepChanges({ ...step, info_prompt: null, info_fields: [] }, 'pending', '', EMPTY_DRAFT).request, false);
  });
});

describe('what we tell the client we need', () => {
  test('a step name that describes an outcome becomes "have your ... ..."', () => {
    assert.equal(outcomePhrase('Carrier registration submitted'), 'have your carrier registration submitted');
    assert.equal(outcomePhrase('Calendar connected'), 'have your calendar connected');
    assert.equal(outcomePhrase('Your call forwarding verified'), 'have your call forwarding verified');
    assert.equal(outcomePhrase('A2P brand approved'), 'have your A2P brand approved', 'acronyms keep their capitals');
    assert.equal(outcomePhrase('Kickoff call'), null);
    assert.equal(outcomePhrase('submitted'), null);
  });

  test('the registration step, as the client reads it', () => {
    assert.equal(needLine({ title: 'Carrier registration submitted', action: 'registration_form' }), 'We need your business details to have your carrier registration submitted.');
  });

  test('connecting the calendar does not repeat itself', () => {
    assert.equal(needLine({ title: 'Calendar connected', action: 'connect_calendar' }), 'We need you to connect your Google Calendar.');
  });

  test('a link, questions, or nothing special', () => {
    assert.equal(needLine({ title: 'Insurance verified', info_link: 'https://f.co/x' }), 'We need you to fill in a short form to have your insurance verified.');
    assert.equal(needLine({ title: 'Business profile confirmed', info_fields: [{}] }), 'We need a few details from you to have your business profile confirmed.');
    assert.equal(needLine({ title: 'Phone line verified' }), 'We need a quick reply from you to have your phone line verified.');
  });

  test('a title that is not an outcome still reads sensibly', () => {
    assert.equal(needLine({ title: 'Kickoff call' }), 'We need a quick reply from you to finish "Kickoff call".');
    assert.equal(needLine({ title: 'Kickoff call', action: 'registration_form' }), 'We need your business details so we can file your carrier registration.');
  });

  test('the admin\'s note is added after, as a full sentence', () => {
    assert.equal(
      needLine({ title: 'Carrier registration submitted', action: 'registration_form', note: 'The legal name must match your IRS letter' }),
      'We need your business details to have your carrier registration submitted. The legal name must match your IRS letter.',
    );
    assert.equal(needLine({ title: 'Calendar connected', action: 'connect_calendar', note: 'Use the work account!' }), 'We need you to connect your Google Calendar. Use the work account!');
    assert.equal(needLine({ title: 'X', note: '   ' }), 'We need a quick reply from you to finish "X".');
  });
});

describe('the Wiki content', () => {
  test('every topic is real, "start" comes first, and every phase has something to do', () => {
    assert.equal(WIKI_TOPICS[0].id, 'start');
    assert.equal(isWikiTopic('stripe'), true);
    assert.equal(isWikiTopic('waiting'), false, 'the waiting list is gone');
    assert.equal(isWikiTopic('nonsense'), false);
    assert.ok(START_HERE.length >= 4);
    for (const p of START_HERE) assert.ok(p.title && p.why && p.items.length >= 1, p.title);
    // every guide has its own topic
    for (const i of INTEGRATIONS) assert.equal(isWikiTopic(i.id), true, `${i.id} has no Wiki topic`);
  });
});


describe('the account menu never offers the page you are on', () => {
  test('a client has Dashboard, Contacts and Settings as tabs, in that order', () => {
    assert.deepEqual(ownerTabs(false).map((t) => t.label), ['Dashboard', 'Contacts', 'Settings']);
    assert.deepEqual(ownerTabs(false).map((t) => t.path), ['/queue', '/contacts', '/settings']);
  });

  test('while the account is being set up, a Setup tab appears right after the Dashboard', () => {
    assert.deepEqual(ownerTabs(true).map((t) => t.label), ['Dashboard', 'Setup', 'Contacts', 'Settings']);
    assert.equal(ownerTabs(true)[1].path, '/setup');
  });

  test('the page you are on is lit up, and the registration form lights up Setup', () => {
    assert.equal(activeOwnerTab('contacts'), 'contacts');
    assert.equal(activeOwnerTab('dashboard'), 'dashboard');
    assert.equal(activeOwnerTab('setup'), 'setup');
    assert.equal(activeOwnerTab('registration'), 'setup');
    assert.equal(activeOwnerTab(undefined), undefined);
  });

  test('the client menu holds only what is not a page: a way back to the admin, for admins', () => {
    assert.deepEqual(ownerMenu(false), []);
    const items = ownerMenu(true);
    assert.deepEqual(items.map((i) => i.label), ['Admin']);
    assert.equal(items[0].path, '/admin');
    assert.equal(items[0].accent, true);
  });

  test('the admin menu holds what the top bar does not, minus the page you are on', () => {
    assert.deepEqual(adminMenu('clients').map((i) => i.label), ['Integrations', 'Wiki', 'Settings']);
    assert.deepEqual(adminMenu('territories').map((i) => i.label), ['Integrations', 'Wiki', 'Settings']);
    assert.deepEqual(adminMenu('integrations').map((i) => i.label), ['Wiki', 'Settings']);
    assert.deepEqual(adminMenu('settings').map((i) => i.label), ['Integrations', 'Wiki']);
    assert.deepEqual(adminMenu('wiki').map((i) => i.label), ['Integrations', 'Settings']);
    for (const section of ['clients', 'territories', 'integrations', 'settings', 'wiki'] as const) {
      assert.ok(!adminMenu(section).some((i) => /client dashboard/i.test(i.label) || i.path === '/queue'), 'the admin never links to the client dashboard');
    }
    for (const section of ['clients', 'territories', 'integrations', 'settings', 'wiki'] as const) {
      const labels = adminMenu(section).map((i) => i.label);
      assert.ok(!labels.includes('Clients') && !labels.includes('Territories'), 'those two are in the top bar, not the menu');
    }
  });

  test('every item goes somewhere real', () => {
    for (const i of [...adminMenu('clients'), ...ownerMenu(true), ...ownerTabs(true)]) assert.match(i.path, /^\/[a-z/-]*$/, i.label);
  });

});

describe('reading an address: the bug where "wiki#stripe" became a client', () => {
  test('the # part is kept apart from the path', () => {
    assert.deepEqual(parseTarget('/admin/wiki#stripe'), { path: '/admin/wiki', search: '', hash: '#stripe' });
    assert.notEqual(parseTarget('/admin/wiki#stripe').path, '/admin/wiki#stripe');
  });

  test('a query and a # together, in either amount', () => {
    assert.deepEqual(parseTarget('/admin/x?calendar=connected#top'), { path: '/admin/x', search: '?calendar=connected', hash: '#top' });
    assert.deepEqual(parseTarget('/setup?calendar=error'), { path: '/setup', search: '?calendar=error', hash: '' });
    assert.deepEqual(parseTarget('/queue'), { path: '/queue', search: '', hash: '' });
  });

  test('odd input never produces an empty path', () => {
    assert.equal(parseTarget('').path, '/');
    assert.equal(parseTarget('#only').path, '/');
    assert.equal(parseTarget('/a#').hash, '');
  });
});
