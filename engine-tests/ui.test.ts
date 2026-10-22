import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeUrgency, buildDetails, compareByUrgency, countByFilter, eventLabel, filterOf, isCountedLead, matchesFilter,
  normalizeType, showFilterBar, visibleFilters, whyWithYou,
} from '../src/lib/leadView.ts';
import { formatPhone, parseContactCsv, toE164 } from '../src/lib/contacts.ts';
import { formatBlock, zonedToUtc } from '../src/lib/tz.ts';

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
