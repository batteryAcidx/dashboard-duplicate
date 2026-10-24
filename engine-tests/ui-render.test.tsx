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
import { ControlsTab } from '../src/features/admin/tabs/ControlsTab.tsx';
import { CalendarTab } from '../src/features/admin/tabs/CalendarTab.tsx';
import { BillingTab } from '../src/features/admin/tabs/BillingTab.tsx';
import { HealthTab } from '../src/features/admin/tabs/HealthTab.tsx';
import { ActivityTab } from '../src/features/admin/tabs/ActivityTab.tsx';
import { AdminSettings } from '../src/features/admin/settings/AdminSettings.tsx';
import { AdminShell } from '../src/features/admin/shell/AdminShell.tsx';
import { LegacyGhlCard } from '../src/features/admin/tabs/LegacyGhlCard.tsx';
import { AdminMfaGate } from '../src/features/admin/shell/AdminMfaGate.tsx';
import { SyncIndicator } from '../src/components/SyncIndicator.tsx';
import { SyncProvider } from '../src/lib/sync.tsx';
import { SetupStepCard } from '../src/components/SetupStepCard.tsx';
import { SetupTab } from '../src/features/admin/tabs/SetupTab.tsx';
import { BusinessTab } from '../src/features/admin/tabs/BusinessTab.tsx';
import { TwilioTab } from '../src/features/admin/tabs/TwilioTab.tsx';
import { INFO_PRESETS } from '../src/domain/setup.ts';
import { RegistrationFormView } from '../src/features/registration/RegistrationFormView.tsx';
import { RegistrationCard } from '../src/features/admin/tabs/RegistrationCard.tsx';
import { IntegrationsPage } from '../src/integrations/IntegrationsPage.tsx';
import { IntegrationsProvider } from '../src/integrations/IntegrationsContext.tsx';
import { NotPluggedIn } from '../src/integrations/NotPluggedIn.tsx';
import { GuideView } from '../src/integrations/GuideView.tsx';
import { integrationInfo } from '../src/integrations/catalog.ts';
import { EMPTY_REGISTRATION, validateRegistration } from '../src/domain/registration.ts';
import type { IntegrationStatusMap, RegistrationSaved } from '../src/domain/index.ts';

/** presets are looked up by name, so adding a new one never breaks a test that wanted another */
const PRESET = (id: string) => INFO_PRESETS.find((p) => p.id === id)!;
import type {
  ActivityResult,
  Billing,
  Cal,
  ClientStep,
  Controls,
  Health,
  SetupOverview,
  Twilio,
} from '../src/domain/index.ts';

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
  test('not connected: there is a real Connect button, and Outlook is honestly marked as not ready', () => {
    const html = renderToStaticMarkup(<CalendarTab accountId="a" onDenied={() => {}} initial={calendar} />);
    assert.match(html, />Calendar connection</);
    assert.match(html, />Not connected</);
    assert.match(html, />Connect Google Calendar</);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Outlook: coming next/);
    assert.match(html, /Nothing is connected/);
    assert.match(html, /connect it themselves from their Setup page/);
    assert.doesNotMatch(html, />Sync now</);
    assert.doesNotMatch(html, /Save connection|Request sync/, 'the old pretend form is gone');
    assert.match(html, /Upcoming inspections/);
  });

  test('connected: shows who it is connected as, and lets you sync, reconnect or disconnect', () => {
    const connected: Cal = { ...calendar, provider: 'google', status: 'active', calendar_label: 'mike@summit.example', busy_blocks: 12, last_synced_at: new Date().toISOString() };
    const html = renderToStaticMarkup(<CalendarTab accountId="a" onDenied={() => {}} initial={connected} />);
    assert.match(html, />Connected</);
    assert.match(html, /mike@summit\.example/);
    for (const label of ['Sync now', 'Reconnect', 'Disconnect']) assert.match(html, new RegExp(`>${label}<`));
    assert.doesNotMatch(html, />Connect Google Calendar</);
    assert.match(html, /just now/);
    assert.match(html, />12</, 'the busy times being avoided');
  });

  test('a connection that stopped working says so and offers Reconnect, with the reason', () => {
    const broken: Cal = { ...calendar, provider: 'google', status: 'needs_reauth', calendar_label: 'mike@summit.example', last_error: 'invalid_grant' };
    const html = renderToStaticMarkup(<CalendarTab accountId="a" onDenied={() => {}} initial={broken} />);
    assert.match(html, />Needs to reconnect</);
    assert.match(html, /stopped working/);
    assert.match(html, /invalid_grant/);
    assert.match(html, />Reconnect</);
    assert.doesNotMatch(html, />Sync now</, 'syncing a broken connection would only fail');
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

  test('there is ONE sync button, in the header, and no screen has its own refresh', () => {
    const html = renderToStaticMarkup(<SyncProvider><SyncIndicator /></SyncProvider>);
    assert.match(html, /aria-label="Sync everything now"/);
    assert.match(html, /Syncing/);
    assert.equal(renderToStaticMarkup(<SyncIndicator />), '', 'outside the admin there is nothing to show');
    const shell = renderToStaticMarkup(<AdminShell section="clients" userEmail="a@b.c" onNavigate={() => {}}><p>x</p></AdminShell>);
    assert.equal((shell.match(/aria-label="Sync everything now"/g) ?? []).length, 1);
    for (const tab of [
      <HealthTab key="h" accountId="a" onDenied={() => {}} initial={{ health: calm, ctx: liveCtx }} />,
      <ActivityTab key="a" accountId="a" onDenied={() => {}} initial={activity} />,
      <BillingTab key="b" accountId="a" onDenied={() => {}} initial={billing} />,
      <CalendarTab key="c" accountId="a" onDenied={() => {}} initial={calendar} />,
    ]) {
      const out = renderToStaticMarkup(tab);
      assert.doesNotMatch(out, />Refresh</);
      assert.doesNotMatch(out, /Updated (just now|\d)/);
    }
  });

});


// ---------------------------------------------------------------- setup: what we ask, what they send
const clientStep = (over: Partial<ClientStep> = {}): ClientStep => ({
  id: 's1', step_key: 'business_details', title: 'Business details', description: 'We register your number with the carriers.', status: 'waiting_on_you', note: 'Needed before we can submit.',
  sort_order: 1, completed_at: null, info_prompt: 'We need a few details about your business.', info_fields: PRESET('business').fields.slice(0, 3),
  info_response: null, info_submitted_at: null, action: null, ...over,
});

describe('client: a setup step that asks for information', () => {
  test('shows what we need, an easy form, and says it is optional', () => {
    const html = renderToStaticMarkup(<SetupStepCard step={clientStep()} tz="America/Chicago" onSubmit={async () => null} />);
    assert.match(html, />Business details</);
    assert.match(html, />Waiting on you</);
    assert.match(html, />What we need</);
    assert.match(html, /We need a few details about your business\./);
    assert.match(html, /Legal business name/);
    assert.match(html, /Website<span[^>]*> \(optional\)/, 'optional questions are marked');
    assert.doesNotMatch(html, /Legal business name<span/, 'required ones are not');
    assert.match(html, />Send to WedgeScale</);
    assert.match(html, /This is optional\. If it is easier, just reply to our email/);
    assert.match(html, /Needed before we can submit\./);
  });

  test('after they send it: a thank-you state with their answers, and a way to change them', () => {
    const html = renderToStaticMarkup(
      <SetupStepCard
        defaultOpen
        step={clientStep({ status: 'in_progress', info_submitted_at: new Date().toISOString(), info_response: { legal_name: 'Summit Roofing LLC', website: 'https://summit.example' } })}
        tz="America/Chicago"
      />
    );
    assert.match(html, />Info sent</);
    assert.match(html, /Summit Roofing LLC/);
    assert.match(html, />Change my answers</);
    assert.doesNotMatch(html, />Send to WedgeScale</);
    assert.doesNotMatch(html, /<input/);
  });

  test('every kind of question gets the right kind of box', () => {
    const fields = [
      { key: 'a', label: 'Phone', type: 'phone' as const }, { key: 'b', label: 'Email', type: 'email' as const }, { key: 'c', label: 'Site', type: 'url' as const },
      { key: 'd', label: 'Story', type: 'textarea' as const }, { key: 'e', label: 'Carrier', type: 'select' as const, options: ['AT&T', 'Verizon'] },
    ];
    const html = renderToStaticMarkup(<SetupStepCard step={clientStep({ info_fields: fields })} tz="America/Chicago" />);
    assert.match(html, /type="tel"/);
    assert.match(html, /type="email"/);
    assert.match(html, /type="url"/);
    assert.match(html, /<textarea/);
    assert.match(html, /<option value=""[^>]*>Choose one<\/option><option value="AT&amp;T">AT&amp;T<\/option>/);
  });

  test('the calendar step offers Connect, shows who is connected, and asks to reconnect when broken', () => {
    const base = clientStep({ title: 'Connect your calendar', info_fields: [], info_prompt: 'Connect your calendar so we never double-book you.', action: 'connect_calendar' });
    const none = renderToStaticMarkup(<SetupStepCard step={base} tz="America/Chicago" calendar={null} onConnectCalendar={async () => null} />);
    assert.match(none, />Connect Google Calendar</);
    assert.match(none, /disconnect any time/);
    const ok = renderToStaticMarkup(<SetupStepCard step={base} tz="America/Chicago" calendar={{ status: 'active', label: 'mike@summit.example' }} />);
    assert.match(ok, />Connected</);
    assert.match(ok, /mike@summit\.example/);
    assert.doesNotMatch(ok, />Connect Google Calendar</);
    const bad = renderToStaticMarkup(<SetupStepCard step={base} tz="America/Chicago" calendar={{ status: 'needs_reauth', label: null }} onConnectCalendar={async () => null} />);
    assert.match(bad, />Reconnect Google Calendar</);
    assert.match(bad, /stopped working/);
  });

  test('a finished step is just a tick, and a plain step has nothing to open', () => {
    const done = renderToStaticMarkup(<SetupStepCard step={clientStep({ status: 'done', completed_at: '2026-10-12T15:00:00Z' })} tz="America/Chicago" />);
    assert.match(done, />Done · Oct 12</);
    assert.doesNotMatch(done, />What we need</);
    const plain = renderToStaticMarkup(<SetupStepCard step={clientStep({ description: null, note: null, info_fields: [], info_prompt: null, status: 'pending' })} tz="America/Chicago" />);
    assert.doesNotMatch(plain, /aria-expanded/);
    assert.match(plain, />Up next</);
  });
});

const overview: SetupOverview = {
  owner: { email: 'mike@summit.example', name: 'Mike Brooks' },
  steps: [
    { id: 's0', step_key: 'kickoff', title: 'Kickoff call', description: null, status: 'done', note: null, sort_order: 0, completed_at: '2026-10-01T12:00:00Z', info_prompt: null, info_fields: [], info_response: null, info_submitted_at: null, action: null, emails_sent: 0, last_email_at: null },
    { id: 's1', step_key: 'business_details', title: 'Business details', description: null, status: 'waiting_on_you', note: 'Needed for registration', sort_order: 1, completed_at: null,
      info_prompt: 'We need a few details.', info_fields: PRESET('business').fields.slice(0, 2), info_response: { legal_name: 'Summit Roofing LLC', website: 'https://summit.example' },
      info_submitted_at: new Date(Date.now() - 3600000).toISOString(), action: null, emails_sent: 2, last_email_at: new Date(Date.now() - 86400000).toISOString() },
    { id: 's2', step_key: 'calendar', title: 'Connect calendar', description: null, status: 'pending', note: null, sort_order: 2, completed_at: null, info_prompt: null, info_fields: [], info_response: null, info_submitted_at: null, action: null, emails_sent: 0, last_email_at: null },
  ],
  emails: [{ id: 'e1', step_key: 'business_details', to_email: 'mike@summit.example', subject: 'Quick question about Business details', status: 'sent', error: null, created_at: new Date(Date.now() - 86400000).toISOString() }],
};

describe('admin: setup tab', () => {
  test('summarises progress, and flags steps where the client has sent something', () => {
    const html = renderToStaticMarkup(<SetupTab accountId="a" onSaveStep={async () => null} onDenied={() => {}} initial={overview} />);
    assert.match(html, /1 of 3 steps done, 1 with info from the client waiting for you/);
    assert.match(html, />Info received</);
    assert.match(html, /Emailed 2×/);
    assert.match(html, />Up next</);
    assert.match(html, />Done</);
  });

  test('the first unfinished step is open, with what they sent and a way to copy it into business info', () => {
    const html = renderToStaticMarkup(<SetupTab accountId="a" onSaveStep={async () => null} onDenied={() => {}} initial={overview} />);
    assert.match(html, />What the client sent</);
    assert.match(html, /Summit Roofing LLC/);
    assert.match(html, />Copy into business info</);
    assert.match(html, />Save step</);
    assert.match(html, /Waiting on client/);
    assert.equal((html.match(/aria-expanded="true"/g) ?? []).length, 1, 'only one step is open at a time');
  });

  test('each step has both tools: what we ask for, and the email', () => {
    const html = renderToStaticMarkup(<SetupTab accountId="a" onSaveStep={async () => null} onDenied={() => {}} initial={overview} />);
    assert.match(html, />What we ask for</);
    assert.match(html, />Email the client</);
    assert.match(html, /It is always optional: they can also just reply to your email/);
    assert.match(html, />Pick a preset…|Replace with a preset…/);
    assert.match(html, /A button on the client(&#x27;|')s step/);
    assert.match(html, />Open our business registration form</);
    assert.match(html, />Connect Google Calendar</);
    assert.match(html, /Or a link of your own/);
    assert.match(html, /Must start with https:\/\//);
    assert.match(html, />Add a question</);
    assert.match(html, />Stop asking</);
  });

  test('a client with no steps, and the loading state', () => {
    assert.match(renderToStaticMarkup(<SetupTab accountId="a" onSaveStep={async () => null} onDenied={() => {}} initial={{ ...overview, steps: [] }} />), /no setup steps/);
    assert.match(renderToStaticMarkup(<SetupTab accountId="a" onSaveStep={async () => null} onDenied={() => {}} />), /Loading setup/);
  });
});

describe('admin: business and Twilio tabs', () => {
  test('business details: what carriers need, who to contact, private notes', () => {
    const html = renderToStaticMarkup(<BusinessTab accountId="a" onDenied={() => {}} initial={{ legal_name: 'Summit Roofing LLC', city: 'Dallas', contact_email: 'mike@summit.example' }} />);
    for (const t of ['The business', 'Who to contact', 'Notes']) assert.match(html, new RegExp(`>${t}<`));
    assert.match(html, /value="Summit Roofing LLC"/);
    assert.match(html, /value="Dallas"/);
    assert.match(html, /Private to the admin team/);
    assert.match(html, />Save business info</);
    assert.match(renderToStaticMarkup(<BusinessTab accountId="a" onDenied={() => {}} />), /Loading business details/);
  });

  const twilio: Twilio = {
    twilio_subaccount_sid: 'AC' + 'a'.repeat(32), messaging_service_sid: null, phone_number: '+12145550100', phone_number_sid: null, brand_sid: null, campaign_sid: null,
    forwarding_status: 'pending', has_token: false, registration_status: 'pending', account_status: 'setup', notification_phone: null,
  };
  test('Twilio: a checklist of what is missing, the ids, and a token box that never shows the token', () => {
    const html = renderToStaticMarkup(<TwilioTab accountId="a" onDenied={() => {}} initial={twilio} />);
    assert.match(html, />Where this client stands</);
    assert.ok((html.match(/>Missing</g) ?? []).length >= 4, 'subaccount set, but no token, approval, forwarding or live account');
    assert.match(html, /value="\+12145550100"/);
    assert.match(html, /Waiting for the carriers/);
    assert.match(html, /type="password"/);
    assert.match(html, />Paste the token</);
    assert.match(html, /never shown again/);
    assert.match(html, /Doing it automatically is the next thing to build/);
  });
  test('Twilio: once a token is saved it only says so', () => {
    const html = renderToStaticMarkup(<TwilioTab accountId="a" onDenied={() => {}} initial={{ ...twilio, has_token: true }} />);
    assert.match(html, />Replace the token</);
    assert.doesNotMatch(html, />Paste the token</);
  });
});


// ---------------------------------------------------------------- the registration form
describe('registration: the form the client fills in', () => {
  const noop = () => {};
  const base = { value: EMPTY_REGISTRATION, errors: {}, onChange: noop, onSubmit: noop, busy: false };

  test('asks in plain sections, and explains how the EIN is treated', () => {
    const html = renderToStaticMarkup(<RegistrationFormView {...base} />);
    for (const t of ['Your business', 'Business address', 'Who we should list as the contact']) assert.match(html, new RegExp(`>${t}<`));
    assert.match(html, /Legal business name/);
    assert.match(html, /exactly as it appears on your IRS EIN letter/i);
    assert.match(html, /EIN \(employer identification number\)/);
    assert.match(html, /How we handle your EIN/);
    assert.match(html, /encrypted the moment you send it/);
    assert.match(html, /I am the owner, or I am allowed to register this business/);
    assert.match(html, />Send registration details</);
    assert.match(html, /My business does not have an EIN/);
  });

  test('problems are shown beside the question, and counted at the bottom', () => {
    const errors = validateRegistration(EMPTY_REGISTRATION);
    const html = renderToStaticMarkup(<RegistrationFormView {...base} errors={errors} />);
    assert.match(html, /role="alert"[^>]*>Choose the kind of business\./);
    assert.match(html, /An EIN has 9 digits/);
    assert.match(html, /aria-invalid="true"/);
    assert.match(html, /Please fix the highlighted questions and send it again\./);
  });

  test('a sole proprietor with no EIN is not asked for one', () => {
    const html = renderToStaticMarkup(<RegistrationFormView {...base} value={{ ...EMPTY_REGISTRATION, has_ein: false, business_type: 'sole_proprietor' }} />);
    assert.doesNotMatch(html, /EIN \(employer identification number\)/);
    assert.match(html, /checked=""/);
  });

  test('an EIN already saved is shown only as its last 4, and leaving it blank keeps it', () => {
    const html = renderToStaticMarkup(<RegistrationFormView {...base} savedEinLast4="6789" />);
    assert.match(html, /placeholder="Saved: ••-•••6789\. Leave blank to keep it\."/);
    assert.doesNotMatch(html, /3456789/);
  });

  test('while sending, the button says so and cannot be pressed twice', () => {
    const html = renderToStaticMarkup(<RegistrationFormView {...base} busy submitError="We could not send that." />);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Sending…/);
    assert.match(html, /We could not send that\./);
  });
});

describe('registration: what you see as the admin', () => {
  const submitted: RegistrationSaved = {
    status: 'submitted', path: 'standard', business_type: 'llc', legal_name: 'Summit Roofing LLC', has_ein: true, ein_last4: '6789',
    address1: '1 Main St', city: 'Dallas', region: 'TX', postal_code: '75201', website: 'https://summit.example',
    contact_name: 'Mike Brooks', contact_title: 'Owner', contact_email: 'mike@summit.example', contact_phone: '(214) 555-0100',
    submitted_at: new Date(Date.now() - 3600000).toISOString(),
  };

  test('before they send it, it says what to do', () => {
    const html = renderToStaticMarkup(<RegistrationCard accountId="a" onDenied={() => {}} initial={{ status: 'not_started' }} />);
    assert.match(html, />Business registration</);
    assert.match(html, />Not started</);
    assert.match(html, /has not sent it yet/);
    assert.match(html, /Send them to our registration form/);
    assert.doesNotMatch(html, />Reveal EIN</);
  });

  test('once sent: the details, the EIN masked, and the path that will be filed', () => {
    const html = renderToStaticMarkup(<RegistrationCard accountId="a" onDenied={() => {}} initial={submitted} />);
    assert.match(html, />Received</);
    assert.match(html, /Standard business \(has an EIN\)/);
    assert.match(html, /Summit Roofing LLC/);
    assert.match(html, /••-•••6789/);
    assert.doesNotMatch(html, /12-3456789|123456789/, 'the full EIN is never in the page until you ask');
    assert.match(html, />Reveal EIN</);
    assert.match(html, />Mark ready to file</);
    assert.match(html, />Send back to the client</);
  });

  test('a business with no EIN shows the sole-proprietor path and nothing to reveal', () => {
    const html = renderToStaticMarkup(<RegistrationCard accountId="a" onDenied={() => {}} initial={{ ...submitted, has_ein: false, ein_last4: null, path: 'sole_proprietor' }} />);
    assert.match(html, /Sole proprietor \(no EIN\)/);
    assert.match(html, /None \(sole proprietor\)/);
    assert.doesNotMatch(html, />Reveal EIN</);
  });

  test('once ready it is locked, and the next step is filing', () => {
    const html = renderToStaticMarkup(<RegistrationCard accountId="a" onDenied={() => {}} initial={{ ...submitted, status: 'ready' }} />);
    assert.match(html, />Ready to file</);
    assert.match(html, />Mark filed with the carriers</);
    assert.doesNotMatch(html, />Mark ready to file</);
    assert.match(html, /The client can no longer change this/);
  });

  test('sent back: the reason is shown', () => {
    const html = renderToStaticMarkup(<RegistrationCard accountId="a" onDenied={() => {}} initial={{ ...submitted, status: 'needs_changes', admin_notes: 'Name must match the IRS letter.' }} />);
    assert.match(html, />Needs changes</);
    assert.match(html, /Sent back with: Name must match the IRS letter\./);
  });
});

describe('the client\'s setup step: registration and links', () => {
  const step = (over = {}) => ({
    id: 's9', step_key: 'registration', title: 'Business registration', description: null, status: 'waiting_on_you' as const, note: null, sort_order: 3,
    completed_at: null, info_prompt: 'We need your business details.', info_fields: [], info_response: null, info_submitted_at: null, action: 'registration_form', ...over,
  });

  test('a button opens the form, and it says how long it takes', () => {
    const html = renderToStaticMarkup(<SetupStepCard step={step()} tz="America/Chicago" onOpenRegistration={() => {}} />);
    assert.match(html, />Open the registration form</);
    assert.match(html, /Takes about 5 minutes\. Your EIN is stored encrypted\./);
  });

  test('after sending, the step shows where it stands and offers a review', () => {
    const html = renderToStaticMarkup(
      <SetupStepCard step={step({ status: 'in_progress', info_submitted_at: new Date().toISOString() })} defaultOpen tz="America/Chicago" registration={{ status: 'submitted', submitted_at: new Date().toISOString() }} onOpenRegistration={() => {}} />
    );
    assert.match(html, />Received</);
    assert.match(html, /We have it and will review it shortly/);
    assert.match(html, />Review or update your details</);
    assert.match(html, />Info sent</);
  });

  test('a link added by the admin opens in a new tab, safely, with its own button text', () => {
    const html = renderToStaticMarkup(
      <SetupStepCard step={step({ action: null, info_link: 'https://forms.example.com/ins', info_link_label: 'Open the insurance form' })} tz="America/Chicago" />
    );
    assert.match(html, /href="https:\/\/forms\.example\.com\/ins"/);
    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, />Open the insurance form</);
    const plain = renderToStaticMarkup(<SetupStepCard step={step({ action: null, info_link: 'https://forms.example.com/ins' })} tz="America/Chicago" />);
    assert.match(plain, />Open the form</);
  });
});

// ---------------------------------------------------------------- integrations
const ST = (state: 'ready' | 'not_configured' | 'manual' | 'undecided', missing: string[] = [], warnings: string[] = []) => ({ state, missing, warnings });
const statuses = (over: Partial<IntegrationStatusMap> = {}): IntegrationStatusMap => ({
  stripe: ST('ready'), google_calendar: ST('ready'), email: ST('ready'), twilio: ST('manual'), call_forwarding: ST('undecided'), ...over,
});
const ctx = { backendUrl: 'https://abcd1234.supabase.co', appUrl: 'https://dashboard.wedgescale.com' };

describe('integrations: the page', () => {
  test('lists every service with where it stands, and what is missing', () => {
    const html = renderToStaticMarkup(
      <IntegrationsProvider initial={statuses({ stripe: ST('not_configured', ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']), google_calendar: ST('ready', [], ['CRON_SECRET']) })}>
        <IntegrationsPage />
      </IntegrationsProvider>
    );
    for (const name of ['Stripe', 'Google Calendar', 'Email sending', 'Twilio', 'Call forwarding']) assert.match(html, new RegExp(`>${name}<`));
    assert.match(html, />Not plugged in</);
    assert.match(html, />Plugged in</);
    assert.match(html, />Done by hand</);
    assert.match(html, />To decide</);
    assert.match(html, /Missing: <span[^>]*>STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET</);
    assert.match(html, /Recommended: <span[^>]*>CRON_SECRET</);
    assert.match(html, /Nothing here is needed for the rest of the app to work/);
  });

  test('also lists what you are waiting for, grouped, with how long and what to do meanwhile', () => {
    const html = renderToStaticMarkup(<IntegrationsProvider initial={statuses()}><IntegrationsPage /></IntegrationsProvider>);
    assert.match(html, />What you are waiting for</);
    for (const g of ['Do now', 'Waiting on someone else', 'To decide', 'Still to build']) assert.match(html, new RegExp(g));
    assert.match(html, /Twilio and the carriers approve a client/);
    assert.match(html, /Google reviews the app for calendar access/);
    assert.match(html, /Meanwhile/);
  });

  test('if the status check cannot run, it says so instead of showing everything as off', () => {
    const noProvider = renderToStaticMarkup(<IntegrationsPage />);
    assert.match(noProvider, />Not checked</);
    assert.doesNotMatch(noProvider, />Not plugged in</);
  });
});

describe('integrations: a service that is not plugged in says so, instead of failing', () => {
  const off = (id: 'stripe' | 'google_calendar' | 'email') => statuses({ [id]: ST('not_configured', ['SOMETHING']) } as Partial<IntegrationStatusMap>);

  test('the message card', () => {
    const html = renderToStaticMarkup(<IntegrationsProvider initial={off('stripe')}><NotPluggedIn id="stripe" /></IntegrationsProvider>);
    assert.match(html, />Stripe is not plugged in yet</);
    assert.match(html, /What it turns on/);
    assert.match(html, /Everything else works/);
    assert.match(html, /Missing: <span[^>]*>SOMETHING</);
    assert.match(html, />Open the set-up guide</);
  });

  test('Billing: no Stripe sections, but the guarantee and notes remain', () => {
    const billing = { exists: true, linked: false, plan: 'Not linked', monthly_price_cents: 0, status: 'trial', go_live_at: null, guarantee_override: null, notes: null,
      stripe: { customer_id: null, subscription_id: null, status: null, price_label: null, current_period_end: null, cancel_at_period_end: false, payment_method: null, synced_at: null },
      paid_cents: 0, open_cents: 0, invoices: [], guarantee: { status: 'not_started' } };
    const html = renderToStaticMarkup(<IntegrationsProvider initial={off('stripe')}><BillingTab accountId="a" onDenied={() => {}} initial={billing as never} /></IntegrationsProvider>);
    assert.match(html, />Stripe is not plugged in yet</);
    assert.doesNotMatch(html, />Connect to Stripe</);
    assert.doesNotMatch(html, />Link and sync</);
    assert.match(html, />30-day guarantee</);
    assert.match(html, />Notes</);
    const on = renderToStaticMarkup(<IntegrationsProvider initial={statuses()}><BillingTab accountId="a" onDenied={() => {}} initial={billing as never} /></IntegrationsProvider>);
    assert.match(on, />Connect to Stripe</);
    assert.doesNotMatch(on, /not plugged in yet/);
  });

  test('Calendar: no Connect button when Google is not set up, and it appears once it is', () => {
    const cal = { provider: 'none', status: 'not_connected', calendar_label: null, external_calendar_id: null, last_synced_at: null, last_error: null, sync_requested_at: null, busy_blocks: 0, pending_writes: 0, failed_writes: 0, synced_appointments: 0, upcoming_appointments: 0 };
    const html = renderToStaticMarkup(<IntegrationsProvider initial={off('google_calendar')}><CalendarTab accountId="a" onDenied={() => {}} initial={cal} /></IntegrationsProvider>);
    assert.match(html, />Google Calendar is not plugged in yet</);
    assert.doesNotMatch(html, />Connect Google Calendar</);
    const on = renderToStaticMarkup(<IntegrationsProvider initial={statuses()}><CalendarTab accountId="a" onDenied={() => {}} initial={cal} /></IntegrationsProvider>);
    assert.match(on, />Connect Google Calendar</);
  });

  test('Setup: the calendar button option is marked while Google is not plugged in', () => {
    const html = renderToStaticMarkup(<IntegrationsProvider initial={off('google_calendar')}><SetupTab accountId="a" onSaveStep={async () => null} onDenied={() => {}} initial={overview} /></IntegrationsProvider>);
    assert.match(html, /Connect Google Calendar \(not plugged in yet\)/);
    const on = renderToStaticMarkup(<IntegrationsProvider initial={statuses()}><SetupTab accountId="a" onSaveStep={async () => null} onDenied={() => {}} initial={overview} /></IntegrationsProvider>);
    assert.doesNotMatch(on, /\(not plugged in yet\)/);
  });

  test('the admin menu has Integrations, in both the top bar and the phone bar', () => {
    const html = renderToStaticMarkup(<AdminShell section="integrations" userEmail="a@b.c" onNavigate={() => {}}><p>x</p></AdminShell>);
    assert.equal((html.match(/>Integrations</g) ?? []).length, 2);
    assert.match(html, /grid-cols-4/);
  });
});

describe('integrations: a guide you can tick off', () => {
  const guide = integrationInfo('stripe').guide(ctx);

  test('numbered steps, copyable values with your real addresses, and how to know it works', () => {
    const html = renderToStaticMarkup(<GuideView guide={guide} initialDone={[]} />);
    assert.match(html, /0 of 8 steps ticked/);
    assert.equal((html.match(/role="checkbox"/g) ?? []).length, 8);
    assert.match(html, /https:\/\/abcd1234\.supabase\.co\/functions\/v1\/stripe-webhook/);
    assert.ok((html.match(/>Copy</g) ?? []).length >= 5);
    assert.match(html, /How to know it works/);
    assert.match(html, /Send test webhook/);
    assert.match(html, /Going live/);
    assert.match(html, /rk_test_/);
  });

  test('ticked steps are marked and counted', () => {
    const html = renderToStaticMarkup(<GuideView guide={guide} initialDone={[0, 2]} />);
    assert.match(html, /2 of 8 steps ticked/);
    assert.equal((html.match(/aria-checked="true"/g) ?? []).length, 2);
  });

  test('the Google guide says to publish the app and warns about verification', () => {
    const html = renderToStaticMarkup(<GuideView guide={integrationInfo('google_calendar').guide(ctx)} initialDone={[]} />);
    assert.match(html, /Publish the app/);
    assert.match(html, /ends every connection after 7 days/);
    assert.match(html, /Limited Use/);
    assert.match(html, /calendar-callback/);
  });

  test('call forwarding is honestly a decision, with options, not instructions', () => {
    const html = renderToStaticMarkup(<GuideView guide={integrationInfo('call_forwarding').guide(ctx)} initialDone={[]} />);
    assert.match(html, /Option A/);
    assert.match(html, /Option C/);
    assert.match(html, /deliberately not made yet/);
  });
});
