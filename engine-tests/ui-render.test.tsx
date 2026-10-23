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
import { HealthTab } from '../src/components/admin/HealthTab.tsx';
import { ActivityTab } from '../src/components/admin/ActivityTab.tsx';
import type { ActivityResult } from '../src/components/admin/ActivityTab.tsx';
import { AdminSettings } from '../src/components/admin/AdminSettings.tsx';
import { AdminShell } from '../src/components/admin/AdminShell.tsx';
import { LegacyGhlCard } from '../src/components/admin/LegacyGhlCard.tsx';
import { AdminMfaGate } from '../src/components/AdminMfaGate.tsx';
import { Updated } from '../src/components/Updated.tsx';
import type { Health } from '../src/lib/adminTools.ts';

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
    assert.match(html, /just now/);
  });
});

const billing: Billing = {
  exists: true, linked: true, plan: 'Standard', monthly_price_cents: 69700, status: 'active', go_live_at: '2026-10-10T12:00:00Z', guarantee_override: null, notes: null,
  stripe: {
    customer_id: 'cus_abc123456', subscription_id: 'sub_1', status: 'active', price_label: 'Standard', current_period_end: '2026-11-10T12:00:00Z',
    cancel_at_period_end: false, payment_method: 'Visa ending 4242', synced_at: new Date().toISOString(),
  },
  paid_cents: 69700, open_cents: 69700,
  invoices: [
    { id: 'in_1', number: 'A-0001', status: 'paid', amount_due_cents: 69700, amount_paid_cents: 69700, currency: 'usd', hosted_invoice_url: 'https://invoice.stripe.com/i/x', issued_at: '2026-10-10T12:00:00Z', paid_at: '2026-10-10T12:01:00Z' },
    { id: 'in_2', number: 'A-0002', status: 'open', amount_due_cents: 69700, amount_paid_cents: 0, currency: 'usd', hosted_invoice_url: null, issued_at: '2026-11-10T12:00:00Z', paid_at: null },
  ],
  guarantee: { status: 'in_progress', required: 2, booked: 1, missed_calls: 9, calls_per_week: 6.3, days_left: 14 },
};

describe('admin: billing is read from Stripe', () => {
  test('a linked client shows the subscription, the card, the invoices and a way into Stripe', () => {
    const html = renderToStaticMarkup(<BillingTab accountId="a" onDenied={() => {}} initial={billing} />);
    assert.match(html, /Stripe takes the payments/);
    assert.match(html, />Subscription</);
    assert.match(html, />Active</);
    assert.match(html, /Visa ending 4242/);
    assert.match(html, /href="https:\/\/dashboard\.stripe\.com\/customers\/cus_abc123456"/);
    assert.match(html, />\$697</);
    assert.match(html, />Waiting</);
    assert.equal((html.match(/>View invoice</g) ?? []).length, 1, 'only an invoice that has a Stripe page can be opened');
    assert.match(html, /1 of 2 booked, 14 days left/);
    assert.match(html, /width:50%/);
  });

  test('nothing has to be typed in by hand: there is no invoice form and no price field', () => {
    const html = renderToStaticMarkup(<BillingTab accountId="a" onDenied={() => {}} initial={billing} />);
    assert.doesNotMatch(html, /Add an invoice|Mark paid|Monthly price/);
  });

  test('a client that is not linked yet is asked for the Stripe customer id', () => {
    const html = renderToStaticMarkup(
      <BillingTab accountId="a" onDenied={() => {}} initial={{ ...billing, linked: false, exists: false, invoices: [], paid_cents: 0, open_cents: 0, stripe: { ...billing.stripe, customer_id: null, status: null } }} />
    );
    assert.match(html, />Connect to Stripe</);
    assert.match(html, /cus_/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Link and sync/);
    assert.doesNotMatch(html, />Subscription</);
  });

  test('a failed payment and a cancelling subscription are impossible to miss', () => {
    const html = renderToStaticMarkup(
      <BillingTab accountId="a" onDenied={() => {}} initial={{ ...billing, stripe: { ...billing.stripe, status: 'past_due', cancel_at_period_end: true } }} />
    );
    assert.match(html, />Past due</);
    assert.match(html, /set to cancel at the end of the current period/);
  });

  test('a missed guarantee says what to do in Stripe', () => {
    const html = renderToStaticMarkup(
      <BillingTab accountId="a" onDenied={() => {}} initial={{ ...billing, guarantee: { status: 'credit_due', required: 2, booked: 1, calls_per_week: 8, missed_calls: 34 } }} />
    );
    assert.match(html, />Credit due</);
    assert.match(html, /Apply a credit to the next invoice in Stripe/);
  });
});

// ---------------------------------------------------------------- the 2FA gate and the shell
describe('admin: no navigation before the code', () => {
  test('before two-factor passes, only the brand and a way out are shown', () => {
    const html = renderToStaticMarkup(
      <AdminMfaGate onDenied={() => {}} userEmail="me@wedgescale.com" onSignOut={() => {}}>
        <div>SECRET ADMIN CONTENT</div>
      </AdminMfaGate>
    );
    assert.match(html, /Checking your sign-in/);
    assert.match(html, />Sign out</);
    assert.match(html, /me@wedgescale\.com/);
    assert.doesNotMatch(html, /SECRET ADMIN CONTENT/);
    assert.doesNotMatch(html, />Clients</);
    assert.doesNotMatch(html, />Territories</);
    assert.doesNotMatch(html, /aria-label="Admin sections"/);
  });

  test('the shell shows Clients, Territories and Settings, on a desktop bar and a phone bar', () => {
    const html = renderToStaticMarkup(
      <AdminShell section="territories" userEmail="me@wedgescale.com" onNavigate={() => {}}>
        <p>page</p>
      </AdminShell>
    );
    assert.equal((html.match(/aria-label="Admin sections"/g) ?? []).length, 2, 'one bar for desktop, one for phones');
    for (const label of ['Clients', 'Territories', 'Settings']) assert.match(html, new RegExp(`>${label}<`));
    assert.match(html, /aria-current="page"[^>]*>[^<]*Territories|aria-current="page"[^>]*>(<svg[^>]*>\s*<\/svg>)?Territories/);
    assert.match(html, /<p>page<\/p>/);
    assert.match(html, /fixed inset-x-0 bottom-0/, 'the phone bar is pinned to the bottom');
  });
});

// ---------------------------------------------------------------- how the system is performing
const calm: Health = {
  window_days: 7,
  messages: { inbound: 20, outbound: 22, delivered: 22, failed: 0, queued: 0 },
  conversations: { started: 12, booked: 5, handed_off: 1, opted_out: 0 },
  response: { avg_seconds: 45, slowest_seconds: 90, measured: 12 },
  ai: { calls: 40, errors: 0, fallbacks: 1, blocked: 2, avg_latency_ms: 1100, input_tokens: 20000, output_tokens: 2400 },
  engine: { pending: 0, failed: 0, last_inbound_at: new Date(Date.now() - 5 * 60000).toISOString(), last_outbound_at: new Date(Date.now() - 4 * 60000).toISOString() },
  alerts: { sent: 6, failed: 0, pending: 0 },
  calendar: { status: 'not_connected', last_synced_at: null, failed_writes: 0 },
  weather: { last_error: null, fetched_at: null, storm_mode: false },
  recent_errors: [],
};
const liveCtx = { engine_enabled: true, forwarding_status: 'verified', registration_status: 'approved' };

describe('admin: health', () => {
  test('a healthy client says so, with the numbers that matter', () => {
    const html = renderToStaticMarkup(<HealthTab accountId="a" onDenied={() => {}} initial={{ health: calm, ctx: liveCtx }} />);
    assert.match(html, />How the system is doing</);
    assert.match(html, />Healthy</);
    assert.match(html, /Nothing needs your attention/);
    assert.match(html, />Texts delivered</);
    assert.match(html, />100%</);
    assert.match(html, />45s</);
    assert.match(html, /Nothing went wrong in this period/);
    assert.match(html, /5 min ago/);
  });

  test('a client with problems lists them worst first, with the errors in plain words', () => {
    const bad: Health = {
      ...calm,
      messages: { ...calm.messages, failed: 4, delivered: 18 },
      alerts: { sent: 2, failed: 2, pending: 0 },
      engine: { ...calm.engine, failed: 1 },
      recent_errors: [{ at: new Date(Date.now() - 60000).toISOString(), kind: 'A text to the owner failed', detail: 'carrier rejected' }],
    };
    const html = renderToStaticMarkup(<HealthTab accountId="a" onDenied={() => {}} initial={{ health: bad, ctx: liveCtx }} />);
    assert.match(html, />Problem</);
    assert.ok(html.indexOf('The owner is not being told') < html.indexOf('could not be processed'), 'critical comes before warning');
    assert.match(html, />Critical</);
    assert.match(html, /A text to the owner failed/);
    assert.match(html, /carrier rejected/);
  });

  test('before the data arrives it says so', () => {
    assert.match(renderToStaticMarkup(<HealthTab accountId="a" onDenied={() => {}} />), /Checking how the system is doing/);
  });
});

// ---------------------------------------------------------------- the activity log
const iso = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const activity: ActivityResult = {
  total: 3, limit: 25, offset: 0,
  rows: [
    { id: '1', created_at: iso(5), action: 'engine_on', detail: 'Turned the texting engine on', actor_id: 'u1', actor_email: 'vlad@wedgescale.com' },
    { id: '2', created_at: iso(50), action: 'engine_controls_changed', detail: 'Changed: inspection_minutes, test_mode', actor_id: 'u1', actor_email: 'vlad@wedgescale.com' },
    { id: '3', created_at: iso(500), action: 'some_new_thing', detail: null, actor_id: null, actor_email: null },
  ],
  actors: [{ id: 'u1', email: 'vlad@wedgescale.com' }],
  actions: ['engine_on', 'engine_controls_changed', 'some_new_thing'],
};

describe('admin: activity log', () => {
  test('a short list: readable lines, filters, no page buttons', () => {
    const html = renderToStaticMarkup(<ActivityTab accountId="a" onDenied={() => {}} initial={activity} />);
    assert.match(html, /Showing 1 to 3 of 3/);
    assert.match(html, />Engine turned on</);
    assert.match(html, />Controls changed</);
    assert.match(html, />Some new thing</, 'an unknown action is made readable, not shown raw');
    assert.match(html, /vlad/);
    assert.match(html, /System/);
    assert.match(html, /aria-expanded="false"/, 'each line is folded away until opened');
    assert.doesNotMatch(html, /Changed: inspection_minutes/, 'the detail stays hidden until a line is opened');
    for (const label of ['Search', 'Who', 'What', 'From', 'To']) assert.match(html, new RegExp(`>${label}<`));
    assert.match(html, /vlad@wedgescale\.com<\/option>/);
    assert.doesNotMatch(html, /Page \d+ of/);
    assert.doesNotMatch(html, /Clear filters/);
  });

  test('a long list is read one page at a time', () => {
    const html = renderToStaticMarkup(<ActivityTab accountId="a" onDenied={() => {}} initial={{ ...activity, total: 60 }} />);
    assert.match(html, /Showing 1 to 25 of 60/);
    assert.match(html, /Page 1 of 3/);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Previous/);
    assert.doesNotMatch(html, /<button[^>]*disabled=""[^>]*>Next/);
    const second = renderToStaticMarkup(<ActivityTab accountId="a" onDenied={() => {}} initial={{ ...activity, total: 60, offset: 25 }} />);
    assert.match(second, /Page 2 of 3/);
    assert.match(second, /Showing 26 to 50 of 60/);
  });

  test('nothing yet', () => {
    const html = renderToStaticMarkup(<ActivityTab accountId="a" onDenied={() => {}} initial={{ ...activity, total: 0, rows: [] }} />);
    assert.match(html, /No entries/);
    assert.match(html, /Nothing has been done for this client yet/);
  });
});

// ---------------------------------------------------------------- the admin's own settings
describe('admin: your own settings', () => {
  const factors = [{ id: 'f1', friendly_name: 'WedgeScale Admin', created_at: '2026-09-01T12:00:00Z' }];

  test('account, password, two-factor, devices and refresh', () => {
    const html = renderToStaticMarkup(<AdminSettings userEmail="vlad@wedgescale.com" initial={{ factors, level: 'aal2', signedInAt: iso(30) }} />);
    assert.match(html, />Settings</);
    for (const title of ['Account', 'Password', 'Screens', 'Two-factor sign-in', 'Devices and staying signed in']) assert.match(html, new RegExp(`>${title}<`));
    assert.match(html, /Two-factor verified/);
    assert.match(html, /vlad@wedgescale\.com/);
    assert.match(html, />Add an authenticator</);
    assert.match(html, />Sign out other devices</);
    assert.match(html, /Every minute/);
  });

  test('you cannot remove your only authenticator, and the "remember this device" question is answered honestly', () => {
    const html = renderToStaticMarkup(<AdminSettings userEmail="a@b.c" initial={{ factors, level: 'aal2', signedInAt: null }} />);
    assert.match(html, /<button[^>]*disabled=""[^>]*aria-label="Remove WedgeScale Admin"|aria-label="Remove WedgeScale Admin"[^>]*disabled=""/);
    assert.match(html, /Add a second authenticator before you can remove this one/);
    assert.match(html, /30 days/);
    assert.match(html, /remember this device/);
    const two = renderToStaticMarkup(<AdminSettings userEmail="a@b.c" initial={{ factors: [...factors, { id: 'f2', friendly_name: 'Backup phone' }], level: 'aal2', signedInAt: null }} />);
    assert.doesNotMatch(two, /Add a second authenticator before/);
  });
});

describe('admin: the legacy GoHighLevel card and the updated indicator', () => {
  test('folded away, says it is not the main connection, and can still be set', () => {
    const empty = renderToStaticMarkup(<LegacyGhlCard accountId="a" current={null} onDenied={() => {}} />);
    assert.match(empty, /<details/);
    assert.match(empty, /Legacy connection/);
    assert.match(empty, /No longer the main connection/);
    assert.match(empty, /Not used\./);
    assert.match(empty, /<button[^>]*disabled=""[^>]*>Clear/);
    const set = renderToStaticMarkup(<LegacyGhlCard accountId="a" current="ghlLoc_123" onDenied={() => {}} />);
    assert.match(set, /A location is set\./);
    assert.match(set, /value="ghlLoc_123"/);
  });

  test('"updated" shows when the screen last refreshed', () => {
    assert.match(renderToStaticMarkup(<Updated at={null} />), /Loading…/);
    assert.match(renderToStaticMarkup(<Updated at={Date.now()} onRefresh={() => {}} />), /Updated just now/);
    assert.match(renderToStaticMarkup(<Updated at={Date.now()} onRefresh={() => {}} />), />Refresh</);
  });
});
