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
import { WikiPage } from '../src/integrations/WikiPage.tsx';
import { SetupNeeds } from '../src/components/SetupNeeds.tsx';
import { PlatformFooter } from '../src/components/PlatformFooter.tsx';
import { OverviewChart } from '../src/components/OverviewChart.tsx';
import { buildChart } from '../src/lib/chart.ts';
import { readFileSync } from 'node:fs';
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
describe('the client header and tabs', () => {
  const header = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(<SyncProvider><AppHeader companyName="Summit Roofing" userEmail="mike@summit.example" current="settings" {...props} /></SyncProvider>);

  test('is light: the company, a small Sync icon, and an account button with just the initial', () => {
    const html = header();
    assert.match(html, /Summit Roofing/);
    assert.match(html, /aria-label="Account menu"/);
    assert.match(html, /aria-label="Sync everything now"/);
    assert.match(html, /title="Synced just now\. Press to sync now\."/, 'the time is in the tooltip');
    assert.doesNotMatch(html, />Synced just now</, 'no long text crowding the bar');
    assert.doesNotMatch(html, /mike@summit\.example/, 'the email is not in the bar');
    assert.match(html, />M</, 'the initial is');
  });

  test('the email is in the menu when it is opened', () => {
    const html = renderToStaticMarkup(<SyncProvider><AppHeader companyName="S" userEmail="mike@summit.example" current="settings" initialOpen /></SyncProvider>);
    assert.match(html.slice(html.indexOf('menu-panel')), /mike@summit\.example/);
  });

  test('the pages are tabs on a computer AND a bar along the bottom on a phone', () => {
    const html = header();
    assert.equal((html.match(/aria-label="Pages"/g) ?? []).length, 2, 'one bar for desktop, one for phones');
    for (const label of ['Dashboard', 'Contacts', 'Settings']) assert.equal((html.match(new RegExp(`>${label}<`, 'g')) ?? []).length, 2, `${label} in both bars`);
    assert.match(html, /fixed inset-x-0 bottom-0/);
    assert.match(html, /grid-cols-3/);
    assert.match(html, /md:hidden/);
  });

  test('the page you are on is lit up in both bars, and only that one', () => {
    const html = header({ current: 'contacts' });
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 2);
    assert.match(html, /aria-current="page"[^>]*>(<svg[^>]*>\s*<\/svg>)?Contacts/);
    assert.doesNotMatch(html, /aria-current="page"[^>]*>(<svg[^>]*>\s*<\/svg>)?Settings/);
  });

  test('a Setup tab shows only while the account is being set up', () => {
    assert.doesNotMatch(header(), />Setup</);
    const html = header({ showSetup: true });
    assert.equal((html.match(/>Setup</g) ?? []).length, 2);
    assert.match(html, /grid-cols-4/);
    assert.match(header({ showSetup: true, current: 'registration' }), /aria-current="page"[^>]*>(<svg[^>]*>\s*<\/svg>)?Setup/);
  });

  test('inside a conversation the bottom bar steps aside, so it never covers the message controls', () => {
    const html = header({ hideTabs: true });
    assert.equal((html.match(/aria-label="Pages"/g) ?? []).length, 1, 'only the desktop tabs remain');
    assert.doesNotMatch(html, /fixed inset-x-0 bottom-0/);
    assert.match(html, /aria-label="Sync everything now"/);
  });

  test('the account menu holds just Sign out, plus a way back to the admin for admins', () => {
    const menu = (isAdmin: boolean) => {
      const html = renderToStaticMarkup(<SyncProvider><AppHeader companyName="S" userEmail="m@s.co" current="dashboard" isAdmin={isAdmin} initialOpen /></SyncProvider>);
      return html.slice(html.indexOf('menu-panel'));
    };
    const client = menu(false);
    assert.match(client, />Sign out</);
    for (const page of ['Contacts', 'Settings', 'Dashboard', 'Admin']) assert.doesNotMatch(client.slice(0, client.indexOf('</div></div>')), new RegExp(`>${page}<`), `${page} is a tab, not a menu item`);
    const admin = menu(true);
    assert.match(admin, />Admin</);
    assert.match(admin, />Sign out</);
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

  test('the top bar and the phone bar hold only Clients and Territories', () => {
    const html = renderToStaticMarkup(
      <AdminShell section="territories" userEmail="me@wedgescale.com" onNavigate={() => {}}>
        <p>page</p>
      </AdminShell>
    );
    assert.equal((html.match(/aria-label="Admin sections"/g) ?? []).length, 2, 'one bar for desktop, one for phones');
    for (const label of ['Clients', 'Territories']) assert.equal((html.match(new RegExp(`>${label}<`, 'g')) ?? []).length, 2, `${label} in both bars`);
    for (const gone of ['Settings', 'Integrations']) assert.doesNotMatch(html, new RegExp(`>${gone}<`), `${gone} moved into the account menu`);
    assert.match(html, /aria-current="page"[^>]*>(<svg[^>]*>\s*<\/svg>)?Territories/);
    assert.match(html, /<p>page<\/p>/);
    assert.match(html, /fixed inset-x-0 bottom-0/, 'the phone bar is pinned to the bottom');
    assert.match(html, /grid-cols-2/);
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
    assert.match(html, /Synced just now/, 'a page with nothing to load is in sync from the start, never stuck on Syncing');
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
    assert.match(html, />Save changes</);
    assert.match(html, /Waiting on client/);
    assert.equal((html.match(/aria-expanded="true"/g) ?? []).length, 1, 'only one step is open at a time');
  });

  test('one form and ONE Save button: status, note and what the client is asked, together', () => {
    const html = renderToStaticMarkup(<SetupTab accountId="a" onSaveStep={async () => null} onDenied={() => {}} initial={overview} />);
    assert.equal((html.match(/>Save changes</g) ?? []).length, 1, 'exactly one Save button for the open step');
    for (const gone of ['Save step', 'Save request', 'What we ask for<', 'role="tab"']) assert.ok(!html.includes(gone), `${gone} should no longer exist`);
    assert.match(html, />Where this step stands</);
    assert.match(html, />What we ask the client for</);
    assert.match(html, /It is always optional: they can also just reply to your email/);
    assert.match(html, />Pick a preset…|Replace with a preset…/);
    assert.match(html, />Add a question</);
    assert.match(html, /Stop asking the client for anything on this step/);
    assert.match(html, />Open our business registration form</);
    assert.match(html, />Connect Google Calendar</);
    assert.match(html, /Or a link of your own/);
    assert.match(html, /Must start with https:\/\//);
  });

  test('nothing to save until something changes, and the email is a separate action underneath', () => {
    const html = renderToStaticMarkup(<SetupTab accountId="a" onSaveStep={async () => null} onDenied={() => {}} initial={overview} />);
    assert.match(html, /<button[^>]*disabled=""[^>]*>Save changes/);
    assert.doesNotMatch(html, /You have unsaved changes/);
    assert.doesNotMatch(html, />Discard changes</);
    assert.match(html, />Email the client about this</);
    assert.match(html, />Write an email</);
    assert.doesNotMatch(html, />Send email</, 'the composer stays closed until you open it');
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

describe('integrations: the status page', () => {
  test('lists every service with where it stands, what is missing, and a way to the how-to', () => {
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
    assert.match(html, /independent and optional/);
    assert.equal((html.match(/>How to set it up</g) ?? []).length, 5);
  });

  test('the how-to is NOT on this page any more: no steps, no copy boxes, no waiting list', () => {
    const html = renderToStaticMarkup(<IntegrationsProvider initial={statuses()}><IntegrationsPage /></IntegrationsProvider>);
    assert.doesNotMatch(html, /steps ticked/);
    assert.doesNotMatch(html, />Copy</);
    assert.doesNotMatch(html, /What you are waiting for/);
    assert.doesNotMatch(html, /role="checkbox"/);
  });

  test('if the status check cannot run, it says so instead of showing everything as off', () => {
    const noProvider = renderToStaticMarkup(<IntegrationsPage />);
    assert.match(noProvider, />Not checked</);
    assert.doesNotMatch(noProvider, />Not plugged in</);
  });
});

describe('the Wiki: for you, not for clients', () => {
  const wiki = (topic?: string, st: IntegrationStatusMap = statuses()) =>
    renderToStaticMarkup(<IntegrationsProvider initial={st}><WikiPage initialTopic={topic} /></IntegrationsProvider>);

  test('opens on "Start here", with every topic one press away', () => {
    const html = wiki();
    assert.match(html, />Wiki</);
    assert.match(html, /This is for you, not for clients/);
    for (const t of ['Start here', 'Stripe', 'Google Calendar', 'Email sending', 'Twilio', 'Call forwarding']) assert.match(html, new RegExp(`>${t}<`));
    assert.doesNotMatch(html, /waiting for/i, 'no waiting list');
    assert.match(html, /href="#stripe"/);
    assert.match(html, /aria-current="page"[^>]*>Start here</);
    assert.match(html, /Update the app/);
    assert.match(html, /Make a pretend client/);
    assert.match(html, /When your first client signs/);
  });

  test('a guide topic shows that service\'s steps, with its status and your real addresses', () => {
    const html = wiki('stripe', statuses({ stripe: ST('not_configured', ['STRIPE_SECRET_KEY']) }));
    assert.match(html, />Stripe</);
    assert.match(html, />Not plugged in</);
    assert.match(html, /role="checkbox"/);
    assert.match(html, /functions\/v1\/stripe-webhook/);
    assert.match(html, /aria-current="page"[^>]*>Stripe</);
    assert.doesNotMatch(html, /When your first client signs/);
  });

  test('the old waiting-list topic is gone, and its address just shows Start here', () => {
    const html = wiki('waiting');
    assert.doesNotMatch(html, /Twilio and the carriers approve a client/);
    assert.match(html, /Make a pretend client/);
  });

  test('an unknown topic falls back to Start here', () => {
    assert.match(wiki('nonsense'), /Make a pretend client/);
  });

  test('there is no footer: Wiki is in the account menu with the other links', () => {
    const closed = renderToStaticMarkup(<AdminShell section="clients" userEmail="a@b.c" onNavigate={() => {}}><p>x</p></AdminShell>);
    assert.doesNotMatch(closed, /<footer/);
    assert.doesNotMatch(closed, />Wiki</, 'nothing about the Wiki on the page itself');
    const open = renderToStaticMarkup(<AdminShell section="clients" initialOpen userEmail="a@b.c" onNavigate={() => {}}><p>x</p></AdminShell>);
    const menu = open.slice(open.indexOf('menu-panel'), open.indexOf('</header>'));
    assert.match(menu, />Wiki</);
    const onWiki = renderToStaticMarkup(<AdminShell section="wiki" initialOpen userEmail="a@b.c" onNavigate={() => {}}><p>x</p></AdminShell>);
    const wikiMenu = onWiki.slice(onWiki.indexOf('menu-panel'), onWiki.indexOf('</header>'));
    assert.doesNotMatch(wikiMenu, />Wiki</, 'never offer the page you are on');
    assert.match(wikiMenu, />Integrations</);
  });

});

describe('the client\'s "what we need from you"', () => {
  const step = (over: Record<string, unknown>) => ({
    id: 'n1', step_key: 'k', title: 'Carrier registration submitted', description: null, status: 'waiting_on_you' as const, note: null, sort_order: 1,
    completed_at: null, info_prompt: null, info_fields: [], info_response: null, info_submitted_at: null, action: null, ...over,
  });

  test('says what we need, in the client\'s words, not the names of the steps', () => {
    const html = renderToStaticMarkup(
      <SetupNeeds steps={[
        step({ action: 'registration_form' }),
        step({ id: 'n2', title: 'Calendar connected', action: 'connect_calendar' }),
      ]} />
    );
    assert.match(html, />What we need from you</);
    assert.match(html, /We need your business details to have your carrier registration submitted\./);
    assert.match(html, /We need you to connect your Google Calendar\./);
    assert.doesNotMatch(html, /We need 2 things/);
    assert.doesNotMatch(html, /Carrier registration submitted\./, 'the step name is not recited back');
    assert.doesNotMatch(html, /Calendar connected\./);
    assert.match(html, /Send it in the step below, or just reply to our email/);
    assert.doesNotMatch(html, /Open a step below/);
  });

  test('shows nothing when nothing is needed', () => {
    assert.equal(renderToStaticMarkup(<SetupNeeds steps={[step({ status: 'in_progress' })]} />), '');
  });

  test('the admin\'s note is added as extra detail, after the plain sentence', () => {
    const html = renderToStaticMarkup(<SetupNeeds steps={[step({ action: 'registration_form', note: 'The legal name must match your IRS letter' })]} />);
    assert.match(html, /to have your carrier registration submitted\. The legal name must match your IRS letter\./);
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


describe('the open admin menus really follow the rule', () => {
  const adminMenuHtml = (section: 'clients' | 'integrations' | 'settings' | 'wiki') => {
    const html = renderToStaticMarkup(<AdminShell section={section} initialOpen userEmail="me@wedgescale.com" onNavigate={() => {}}><p>x</p></AdminShell>);
    return html.slice(html.indexOf('menu-panel'), html.indexOf('</header>'));
  };

  test('admin on Clients: Integrations, Wiki, Settings, Sign out, and no client dashboard', () => {
    const m = adminMenuHtml('clients');
    for (const l of ['Integrations', 'Wiki', 'Settings', 'Sign out']) assert.match(m, new RegExp(`>${l}<`));
    assert.doesNotMatch(m, />Clients</);
    assert.doesNotMatch(m, /Client dashboard/);
  });

  test('admin on Settings: no Settings in the menu', () => {
    const m = adminMenuHtml('settings');
    assert.doesNotMatch(m, />Settings</);
    for (const l of ['Integrations', 'Wiki', 'Sign out']) assert.match(m, new RegExp(`>${l}<`));
  });

  test('admin on Integrations: no Integrations in the menu', () => {
    const m = adminMenuHtml('integrations');
    assert.doesNotMatch(m, />Integrations</);
    assert.match(m, />Settings</);
  });

});


describe('the client side ends with the platform footer, like the sign-in page', () => {
  test('the footer says exactly what the login page says', () => {
    const html = renderToStaticMarkup(<PlatformFooter />);
    assert.match(html, /<footer/);
    assert.match(html, />WedgeScale Dashboard Platform</);
    assert.match(readFileSync('../src/pages/LoginPage.tsx', 'utf8'), /WedgeScale Dashboard Platform/);
  });

  test('every client page includes it exactly once', () => {
    for (const page of ['QueuePage', 'ContactsPage', 'SettingsPage', 'SetupPage', 'RegistrationPage']) {
      const text = readFileSync(`../src/pages/${page}.tsx`, 'utf8');
      assert.equal((text.match(/<PlatformFooter \/>/g) ?? []).length, 1, `${page} should end with the footer`);
    }
  });

  test('the admin does not get it: that is the client side only', () => {
    const html = renderToStaticMarkup(<AdminShell section="clients" userEmail="a@b.c" onNavigate={() => {}}><p>x</p></AdminShell>);
    assert.doesNotMatch(html, /WedgeScale Dashboard Platform/);
  });
});

describe('the client pages use the one main Sync, not their own refresh', () => {
  const page = (name: string) => readFileSync(`../src/pages/${name}.tsx`, 'utf8');

  test('no client page has its own timer, tab-visibility listener, or pull-to-refresh', () => {
    for (const name of ['QueuePage', 'SetupPage', 'ContactsPage', 'SettingsPage', 'RegistrationPage']) {
      const text = page(name);
      assert.doesNotMatch(text, /setInterval\(/, `${name} has its own timer`);
      assert.doesNotMatch(text, /visibilitychange/, `${name} listens for the tab coming back by itself`);
      assert.doesNotMatch(text, /PullToRefresh|PullIndicator/, `${name} still has pull-to-refresh`);
    }
  });

  test('the pages that show live data register with the sync', () => {
    for (const name of ['QueuePage', 'SetupPage', 'ContactsPage']) assert.match(page(name), /useSynced\(/, `${name} should join the sync`);
  });

  test('the dashboard hides the bottom bar inside a conversation', () => {
    assert.match(page('QueuePage'), /hideTabs=\{Boolean\(selectedLeadId\)\}/);
  });

  test('every client page tells the header where it is, so the right tab is lit', () => {
    for (const [name, current] of [['QueuePage', 'dashboard'], ['ContactsPage', 'contacts'], ['SettingsPage', 'settings'], ['SetupPage', 'setup'], ['RegistrationPage', 'registration']]) {
      assert.match(page(name), new RegExp(`current="${current}"`), name);
    }
  });
});


describe('the chart on a phone', () => {
  const row = (daysAgo: number, booked: boolean) => ({
    status: 'following_up', missed_call_at: new Date(Date.now() - daysAgo * 86400000).toISOString(), created_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    appointments: booked ? [{ status: 'scheduled' }] : [],
  });
  const rows = [row(0, true), row(0, false), row(1, false), row(3, true), row(9, false), row(20, true)];

  test('the numbers lead, and the period is stated in words', () => {
    const html = renderToStaticMarkup(<OverviewChart chart={buildChart(rows, '30d', 'America/Chicago')} />);
    assert.match(html, />Missed calls and bookings</);
    assert.match(html, /<span[^>]*text-3xl[^>]*>6<\/span><span[^>]*>missed</);
    assert.match(html, /<span[^>]*text-3xl[^>]*>3<\/span><span[^>]*>booked</);
    assert.match(html, />Last 30 days, by day</);
    assert.match(html, />Missed</);
    assert.match(html, />Booked</);
  });

  test('the last date label is pinned to the right edge, so it can never be cut off', () => {
    const html = renderToStaticMarkup(<OverviewChart chart={buildChart(rows, '30d', 'America/Chicago')} />);
    assert.match(html, /<span class="absolute[^"]*right-0[^"]*">Today<\/span>/);
    assert.doesNotMatch(html, /-translate-x-1\/2[^"]*">Today</, 'not centered under the last bar');
    assert.equal((html.match(/>Today</g) ?? []).length, 1);
  });

  test('a label near the left edge leans in, and the middle ones stay centered', () => {
    const html = renderToStaticMarkup(<OverviewChart chart={buildChart(rows, '30d', 'America/Chicago')} />);
    assert.match(html, /<span class="absolute[^"]*left-0[^"]*">[A-Z][a-z]{2} \d+<\/span>/);
    assert.match(html, /left-1\/2 -translate-x-1\/2[^"]*">[A-Z][a-z]{2} \d+</);
  });

  test('24 hours ends with "Now" at the edge', () => {
    const html = renderToStaticMarkup(<OverviewChart chart={buildChart([row(0, false)], '24h', 'America/Chicago')} />);
    assert.match(html, /right-0[^"]*">Now<\/span>/);
    assert.match(html, />Last 24 hours, by hour</);
  });

  test('7 days shows every weekday', () => {
    const html = renderToStaticMarkup(<OverviewChart chart={buildChart(rows, '7d', 'America/Chicago')} />);
    assert.match(html, />Last 7 days, by day</);
    assert.equal((html.match(/>(Mon|Tue|Wed|Thu|Fri|Sat|Sun)<\/span>/g) ?? []).length, 7);
  });

  test('every bar can be pressed, with a full description for screen readers', () => {
    const html = renderToStaticMarkup(<OverviewChart chart={buildChart(rows, '7d', 'America/Chicago')} />);
    assert.equal((html.match(/aria-label="[^"]*: \d+ missed, \d+ booked"/g) ?? []).length, 7);
    assert.match(html, /class="sr-only"/);
  });

  test('nothing to show says so, without an empty chart', () => {
    const html = renderToStaticMarkup(<OverviewChart chart={buildChart([], '30d', 'America/Chicago')} />);
    assert.match(html, /No missed calls in this period/);
    assert.doesNotMatch(html, /Bars by period/);
  });
});

describe('the conversation header', () => {
  const open = (id: string, extra: Partial<React.ComponentProps<typeof DashboardBody>> = {}) => render({ selectedLeadId: id, onChangeType: async () => null, onChangeStatus: async () => null, ...extra });
  const one = (over: Partial<DashboardLead>) => render({ selectedLeadId: 'x1', leads: [{ ...base, id: 'x1', name: 'Test Person', ...over }], onChangeType: async () => null, onChangeStatus: async () => null });
  const header = (html: string) => html.slice(html.indexOf('<header aria-label="Conversation"'), html.indexOf('</header>') + 9);
  const row = (html: string) => html.slice(html.indexOf('</header>'), html.indexOf('aria-label="What we know"') > 0 ? html.indexOf('aria-label="What we know"') : undefined);

  test('is one compact row, like a chat app: back, avatar, name, one quiet line, and one Call button', () => {
    const h = header(open('em'));
    assert.match(h, /aria-label="Back to queue"/);
    assert.match(h, /lg:hidden/, 'Back is for phones only');
    assert.match(h, />MB</, 'initials avatar');
    assert.match(h, /h-10 w-10[^>]*>MB/, 'a small avatar');
    assert.equal((h.match(/<h3/g) ?? []).length, 1);
    assert.match(h, /<h3[^>]*>Marcus Brooks<\/h3>/);
    assert.match(h, /\(214\) 555-0101/);
    assert.equal((h.match(/<a /g) ?? []).length, 1, 'just one button in the header');
  });

  test('it is a lot smaller than the old card: no large avatar, no tall buttons, no card around it', () => {
    const html = open('em');
    const h = header(html);
    for (const big of ['h-14 w-14', 'h-12 ', 'p-5 sm:p-6', 'text-2xl']) assert.ok(!h.includes(big), `${big} should not be in the header`);
    assert.doesNotMatch(html, /aria-label="Contact"/);
    assert.ok(h.length < 2400, `the header markup is short (${h.length})`);
  });

  test('the quiet line shows the job and the number, and skips "Not specified"', () => {
    assert.match(header(open('em')), /<p[^>]*>\(214\) 555-0101<\/p>/);
    assert.doesNotMatch(header(open('em')), /Not specified/);
    assert.match(header(one({ insurance: 'Roof repair' })), /<p[^>]*>Roof repair · \(214\) 555-0101<\/p>/);
  });

  test('Call is a round icon with the person\'s name for screen readers, and is missing when there is no number', () => {
    assert.match(header(open('em')), /<a href="tel:[^"]*"[^>]*aria-label="Call Marcus Brooks"/);
    assert.doesNotMatch(header(one({ phone: '' })), /aria-label="Call /);
  });

  test('the address is one tappable chip that opens directions, and is missing when there is none', () => {
    const r = row(open('em'));
    assert.match(r, /<a href="https:\/\/[^"]*"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/);
    assert.match(r, /aria-label="Directions to 1 A St, Dallas"/);
    assert.match(r, />1 A St, Dallas</);
    assert.doesNotMatch(row(one({ address: '' })), /Directions to/);
    assert.doesNotMatch(open('em'), />Directions</, 'there is no separate big Directions button any more');
  });

  test('the inspection time is a small gold chip, only when there is one', () => {
    assert.match(row(one({ scheduledTime: 'Tue, Oct 21 · 2:00 PM' })), /text-\[#ffc174\][\s\S]*?Tue, Oct 21 · 2:00 PM/);
    assert.doesNotMatch(row(open('em')), /border-\[#ffc174\]\/30/);
  });

  test('the controls sit in the same slim row', () => {
    const r = row(open('pc'));
    assert.match(r, /Who is this\? Currently Past client/);
    assert.match(r, /flex flex-wrap items-center gap-2/);
  });

  test('the urgency badge sits beside the name, once', () => {
    assert.equal((header(open('em')).match(/>EMERGENCY</g) ?? []).length, 1);
    assert.equal((header(open('hm')).match(/EMERGENCY|PRIORITY/g) ?? []).length, 0, 'nothing for a routine lead');
  });

  test('on a phone it stays at the top while you read, and on a computer it just sits there', () => {
    const h = header(open('em'));
    assert.match(h, /sticky top-0/);
    assert.match(h, /lg:static/);
  });
});


describe('the quiet client bar', () => {
  const bar = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(<SyncProvider><AppHeader companyName="Summit Roofing" userEmail="mike@summit.example" current="contacts" showSetup {...props} /></SyncProvider>);
  const desktopNav = (html: string) => html.slice(html.indexOf('<nav class="hidden'), html.indexOf('</nav>') + 6);
  const tag = (html: string, label: string) => (html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`)) ?? [''])[0];

  test('tabs are plain text with a thin gold underline on the current one, not filled pills', () => {
    const nav = desktopNav(bar());
    assert.equal((nav.match(/h-0\.5 rounded-full bg-\[#f59e0b\]/g) ?? []).length, 1, 'exactly one underline');
    assert.doesNotMatch(nav, /bg-white\/\[0\.07\]/, 'no filled pill');
    assert.match(nav, /aria-current="page"[^>]*>Contacts/);
    for (const l of ['Dashboard', 'Setup', 'Settings']) assert.match(nav, new RegExp(`>${l}`));
  });

  test('Sync and the account button have no boxes around them', () => {
    const html = bar();
    for (const label of ['Sync everything now', 'Account menu']) {
      const t = tag(html, label);
      assert.ok(t, `${label} exists`);
      assert.doesNotMatch(t, /border/, `${label} has a border`);
      assert.match(t, /rounded-full/);
    }
    assert.doesNotMatch(html, /data-icon="ChevronDown"/, 'no chevron on the account button');
  });

  test('the company name is lighter than before', () => {
    assert.match(bar(), /<span class="truncate font-display text-lg font-bold[^"]*">Summit Roofing</);
    assert.doesNotMatch(bar(), /text-xl font-extrabold/);
  });
});
