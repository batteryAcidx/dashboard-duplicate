import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardBody } from '../src/components/DashboardBody.tsx';
import type { DashboardLead } from '../src/components/DashboardBody.tsx';
import { ContactTypeControl } from '../src/components/ContactTypeControl.tsx';
import { LeadDetailsCard } from '../src/components/LeadDetailsCard.tsx';
import { UrgencyBadge } from '../src/components/UrgencyBadge.tsx';

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
