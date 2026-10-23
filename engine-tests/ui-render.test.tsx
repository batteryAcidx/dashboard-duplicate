import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardBody } from '../src/components/DashboardBody.tsx';
import type { DashboardLead } from '../src/components/DashboardBody.tsx';
import { ContactTypeControl } from '../src/components/ContactTypeControl.tsx';
import { LeadDetailsCard } from '../src/components/LeadDetailsCard.tsx';
import { UrgencyBadge } from '../src/components/UrgencyBadge.tsx';
import { AppHeader } from '../src/components/AppHeader.tsx';
import { ControlsTab } from '../src/components/admin/ControlsTab.tsx';
import type { Controls } from '../src/components/admin/ControlsTab.tsx';
import { CalendarTab } from '../src/components/admin/CalendarTab.tsx';
import type { Cal } from '../src/components/admin/CalendarTab.tsx';
import { BillingTab } from '../src/components/admin/BillingTab.tsx';
import type { Billing } from '../src/components/admin/BillingTab.tsx';

const stats = { responseSpeed: '1m 02s', callsRescued: '4', pipelineValue: '$9,500', bookingRate: '50%', bookingDetail: '2 of 4 missed calls booked.' };

const base: DashboardLead = {
  id: 'x', name: 'Someone', phone: '(214) 555-0101', address: '1 A St, Dallas', timeAgo: '5m ago', priority: false, unread: false,
  status: 'following_up', finalValue: null, statusChangedBy: 'system', statusChangedLabel: '', conversationTag: { icon: 'calendar', label: 'Not booked yet' },
  insurance: 'Not specified', scheduledTime: '', chatTranscript: [],
};

const leads: DashboardLead[] = [
  { ...base, id: 'em', name: 'Marcus Brooks', priority: true, urgency: 'emergency', urgencyReason: 'Active leak right now', contactType: 'homeowner',
    details: [{ label: 'Needs', value: 'active leak' }, { label: 'Happening now', value: 'Yes, right now' }] },
  { ...base, id: 'pc', name: 'Dana Ruiz', urgency: 'normal', contactType: 'past_client', needsReview: true, status: 'needs_you',
    conversationTag: { icon: 'calendar', label: 'Flagged for you' }, whyWithYou: 'Existing customer. Flagged for you, not booked.',
    details: [{ label: 'Needs', value: 'my invoice looks wrong' }] },
  { ...base, id: 'sp', name: 'Beacon Supply', urgency: 'normal', contactType: 'supplier', status: 'not_a_lead', conversationTag: { icon: 'calendar', label: 'Vendor, not booked' } },
  { ...base, id: 'hm', name: 'Priya Patel', urgency: 'normal', contactType: 'homeowner' },
];

const render = (props: Partial<React.ComponentProps<typeof DashboardBody>> = {}) =>
  renderToStaticMarkup(
    <DashboardBody companyName="Summit Roofing" stats={stats} leads={leads} selectedLeadId={null} onSelectLead={() => {}} {...props} />
  );

describe('the conversation list', () => {
  test('shows an EMERGENCY badge, type chips and the review marker', () => {
    const html = render();
    assert.match(html, />EMERGENCY</);
    assert.match(html, />Past client\s*· review</);
    assert.match(html, />Supplier</);
    assert.doesNotMatch(html, />Homeowner</, 'plain homeowners need no chip');
  });

  test('shows filter tabs with counts when there is more than one kind of caller', () => {
    const html = render();
    assert.match(html, /aria-label="Filter conversations"/);
    for (const label of ['All', 'Homeowners', 'Past clients', 'Vendors']) assert.match(html, new RegExp(`<span>${label}</span>`));
    assert.doesNotMatch(html, /<span>Unsorted<\/span>/, 'no tab for a kind with nobody in it');
    assert.doesNotMatch(html, /<span>Recurring<\/span>/);
  });

  test('an owner who only gets homeowners never sees the tabs', () => {
    const html = render({ leads: [leads[0], leads[3]] });
    assert.doesNotMatch(html, /aria-label="Filter conversations"/);
    assert.match(html, />EMERGENCY</);
  });

  test('older lead objects with only the priority flag still render, as PRIORITY', () => {
    const legacy: DashboardLead = { ...base, id: 'old', name: 'Old Lead', priority: true };
    const html = render({ leads: [legacy] });
    assert.match(html, />PRIORITY</);
    assert.doesNotMatch(html, /aria-label="Filter conversations"/);
  });
});

describe('an open conversation', () => {
  test('shows who this is, the details and why it is with the owner', () => {
    const html = render({ selectedLeadId: 'pc', onChangeType: async () => null });
    assert.match(html, /aria-label="What we know"/);
    assert.match(html, /Existing customer\. Flagged for you, not booked\./);
    assert.match(html, /my invoice looks wrong/);
    assert.match(html, /Who is this\? Currently Past client/);
    assert.match(html, /Past client\s*· confirm/);
  });

  test('an emergency conversation says why', () => {
    const html = render({ selectedLeadId: 'em' });
    assert.match(html, /Emergency: Active leak right now/);
    assert.match(html, /Happening now/);
    assert.match(html, />HIGH PRIORITY<|>EMERGENCY</);
  });

  test('a routine homeowner shows no details card', () => {
    const html = render({ selectedLeadId: 'hm' });
    assert.doesNotMatch(html, /aria-label="What we know"/);
  });
});

describe('the small components', () => {
  test('urgency badge', () => {
    assert.equal(renderToStaticMarkup(<UrgencyBadge urgency="normal" />), '');
    assert.match(renderToStaticMarkup(<UrgencyBadge urgency="emergency" />), />EMERGENCY</);
    assert.match(renderToStaticMarkup(<UrgencyBadge urgency="urgent" />), />PRIORITY</);
    assert.match(renderToStaticMarkup(<UrgencyBadge urgency="urgent" size="header" />), />HIGH PRIORITY</);
  });
  test('type control starts closed and flags what needs confirming', () => {
    const closed = renderToStaticMarkup(<ContactTypeControl type="unknown" needsReview={false} onChange={async () => null} />);
    assert.match(closed, />Unsorted</);
    assert.doesNotMatch(closed, /role="menu"/);
  });
  test('details card shows nothing when there is nothing to say', () => {
    assert.equal(renderToStaticMarkup(<LeadDetailsCard rows={[]} />), '');
  });
});


// ---------------------------------------------------------------- the client header
describe('the client header', () => {
  test('shows the company, the person, and no menu until it is opened', () => {
    const html = renderToStaticMarkup(<AppHeader companyName="Summit Roofing" userEmail="mike@summit.example" current="settings" />);
    assert.match(html, /Summit Roofing/);
    assert.match(html, /mike@summit\.example/);
    assert.match(html, /aria-label="Account menu"/);
    assert.doesNotMatch(html, />Contacts</);
  });
});

// ---------------------------------------------------------------- the admin tabs
const controls: Controls = {
  engine_enabled: false, paused_until: null, test_mode: false, book_existing_customers: false, daily_message_cap: 300, daily_conversation_cap: 60,
  inspection_minutes: 60, slot_step_minutes: 60, min_notice_hours: 4, max_days_ahead: 14, concurrent_inspections: 1,
  follow_up_schedule_hours: [4, 24, 72, 120, 168], reply_delay_min_seconds: 20, reply_delay_max_seconds: 75, ai_model: null,
  phone_number: null, forwarding_status: 'not_set', twilio_ready: false, registration_status: 'pending', account_status: 'setup',
  notification_phone: '+12145550100', service_lat: null, service_lon: null, service_country: 'US', storm_mode: null, weather_error: null,
  pending_events: 0, failed_events: 0,
};

describe('admin: controls', () => {
  test('a client that is not ready shows what is missing and cannot be turned on', () => {
    const html = renderToStaticMarkup(<ControlsTab accountId="a" onDenied={() => {}} initial={controls} />);
    assert.match(html, />Texting engine</);
    assert.match(html, /Ready to turn on\?/);
    assert.match(html, /Registration approved/);
    assert.match(html, />Missing</);
    assert.match(html, /<button[^>]*disabled=""[^>]*>[^<]*Turn on/, 'the Turn on button is disabled');
    assert.match(html, /value="4, 24, 72, 120, 168"/);
    assert.match(html, /aria-checked="false"[^>]*aria-label="Test mode"|aria-label="Test mode"[^>]*aria-checked="false"/);
    for (const title of ['Limits', 'Booking rules', 'Timing and model', 'Texting number and forwarding', 'Weather location', 'Health']) assert.match(html, new RegExp(`>${title}<`));
  });

  test('a client that is ready can be turned on', () => {
    const ready: Controls = { ...controls, account_status: 'live', registration_status: 'approved', phone_number: '+12145550199', twilio_ready: true, forwarding_status: 'verified' };
    const html = renderToStaticMarkup(<ControlsTab accountId="a" onDenied={() => {}} initial={ready} />);
    assert.doesNotMatch(html, />Missing</);
    assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>[^<]*Turn on/);
  });

  test('a running engine can be paused, and a paused one shows the time left', () => {
    const on: Controls = { ...controls, engine_enabled: true, account_status: 'live', registration_status: 'approved' };
    assert.match(renderToStaticMarkup(<ControlsTab accountId="a" onDenied={() => {}} initial={on} />), /Pause 1 hour/);
    const paused: Controls = { ...on, paused_until: new Date(Date.now() + 90 * 60000).toISOString() };
    const html = renderToStaticMarkup(<ControlsTab accountId="a" onDenied={() => {}} initial={paused} />);
    assert.match(html, /Paused · 1h \d+m left/);
    assert.match(html, /Resume now/);
  });

  test('before the data arrives it says so', () => {
    assert.match(renderToStaticMarkup(<ControlsTab accountId="a" onDenied={() => {}} />), /Loading controls/);
  });
});

const calendar: Cal = {
  provider: 'none', status: 'not_connected', calendar_label: null, external_calendar_id: null, last_synced_at: null, last_error: null,
  sync_requested_at: null, busy_blocks: 0, pending_writes: 0, failed_writes: 0, synced_appointments: 0, upcoming_appointments: 3,
};

describe('admin: calendar', () => {
  test('not connected: sync cannot be requested, and the explanation is honest', () => {
    const html = renderToStaticMarkup(<CalendarTab accountId="a" onDenied={() => {}} initial={calendar} />);
    assert.match(html, />Calendar connection</);
    assert.match(html, />Not connected</);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Request sync/);
    assert.match(html, /next piece to build/);
    assert.match(html, /Upcoming inspections/);
  });
  test('connected: shows the label and allows a sync request', () => {
    const connected: Cal = { ...calendar, provider: 'google', status: 'active', calendar_label: 'Crew calendar', external_calendar_id: 'mike@summit.example', busy_blocks: 12, last_synced_at: new Date().toISOString() };
    const html = renderToStaticMarkup(<CalendarTab accountId="a" onDenied={() => {}} initial={connected} />);
    assert.match(html, />Connected</);
    assert.match(html, /value="Crew calendar"/);
    assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Request sync/);
    assert.match(html, /Just now/);
  });
});

const billing: Billing = {
  exists: true, plan: 'Standard', monthly_price_cents: 69700, setup_fee_cents: 50000, status: 'active', billing_email: 'owner@summit.example',
  payment_method: 'manual', go_live_at: '2026-10-10T12:00:00Z', next_invoice_on: '2026-11-10', guarantee_override: null, notes: null,
  paid_cents: 50000, pending_cents: 69700,
  invoices: [
    { id: 'i1', issued_on: '2026-10-10', kind: 'setup', amount_cents: 50000, status: 'paid', paid_on: '2026-10-10', note: 'Setup fee' },
    { id: 'i2', issued_on: '2026-11-10', kind: 'monthly', amount_cents: 69700, status: 'pending', paid_on: null, note: null },
  ],
  guarantee: { status: 'in_progress', required: 2, booked: 1, missed_calls: 9, calls_per_week: 6.3, days_left: 14 },
};

describe('admin: billing', () => {
  test('summary, guarantee progress and invoices', () => {
    const html = renderToStaticMarkup(<BillingTab accountId="a" onDenied={() => {}} initial={billing} />);
    assert.match(html, />\$697</);
    assert.match(html, />\$500</);
    assert.match(html, />30-day guarantee</);
    assert.match(html, />In progress</);
    assert.match(html, /1 of 2 booked, 14 days left/);
    assert.match(html, /width:50%/);
    assert.match(html, />Paid</);
    assert.match(html, />Waiting</);
    assert.match(html, />Mark paid</);
    assert.equal((html.match(/>Mark paid</g) ?? []).length, 1, 'only the unpaid invoice can be marked paid');
  });
  test('a missed guarantee is flagged as a credit due', () => {
    const html = renderToStaticMarkup(<BillingTab accountId="a" onDenied={() => {}} initial={{ ...billing, guarantee: { status: 'credit_due', required: 2, booked: 1, calls_per_week: 8, missed_calls: 34 } }} />);
    assert.match(html, />Credit due</);
    assert.match(html, /The next month is free/);
  });
  test('a brand new client starts as a trial with the guarantee not started', () => {
    const html = renderToStaticMarkup(<BillingTab accountId="a" onDenied={() => {}} initial={{ ...billing, exists: false, status: 'trial', invoices: [], paid_cents: 0, pending_cents: 0, go_live_at: null, guarantee: { status: 'not_started' } }} />);
    assert.match(html, />Not started</);
    assert.match(html, /No invoices yet/);
  });
});
