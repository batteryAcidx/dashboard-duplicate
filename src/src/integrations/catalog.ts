// The list of pluggable services. Adding a new one means adding one entry here, one guide, and one backend spec.
import type { IntegrationId } from '../domain';
import type { GuideBuilder } from './guide';
import { stripeGuide } from './guides/stripe';
import { googleCalendarGuide } from './guides/googleCalendar';
import { emailGuide } from './guides/email';
import { twilioGuide } from './guides/twilio';
import { callForwardingGuide } from './guides/callForwarding';

export interface IntegrationInfo {
  id: IntegrationId;
  name: string;
  tagline: string;
  /** what turns on when it is plugged in */
  unlocks: string[];
  /** what still works when it is not */
  withoutIt: string;
  guide: GuideBuilder;
}

export const INTEGRATIONS: IntegrationInfo[] = [
  {
    id: 'stripe',
    name: 'Stripe',
    tagline: 'Takes the payments. The dashboard reads from it.',
    unlocks: ['Plan, price and status on each client\'s Billing tab', 'Invoices and the card on file', 'A failed payment shows up as "Past due" on its own'],
    withoutIt: 'Everything else works. The Billing tab still tracks the 30-day guarantee and your notes.',
    guide: stripeGuide,
  },
  {
    id: 'google_calendar',
    name: 'Google Calendar',
    tagline: 'Keeps an owner\'s calendar and ours in step.',
    unlocks: ['A Connect button for owners and for you', 'We never offer a time the owner is busy', 'Every booked inspection lands on their calendar'],
    withoutIt: 'Availability comes from office hours and the owner\'s blocked times instead.',
    guide: googleCalendarGuide,
  },
  {
    id: 'email',
    name: 'Email sending',
    tagline: 'Email a client from the Setup tab.',
    unlocks: ['A Send email button on every setup step', 'A record of what was sent and whether it arrived'],
    withoutIt: '"Open in my email app" and "Copy" still work, so you can send it yourself.',
    guide: emailGuide,
  },
  {
    id: 'twilio',
    name: 'Twilio',
    tagline: 'The texting numbers. Set up by hand for now.',
    unlocks: ['Each client\'s own number in their own name', 'The business registration and its review'],
    withoutIt: 'Texting cannot start until a number is registered and recorded here.',
    guide: twilioGuide,
  },
  {
    id: 'call_forwarding',
    name: 'Call forwarding',
    tagline: 'How a missed call reaches us. Still to be decided.',
    unlocks: ['Automatic checking that forwarding really works'],
    withoutIt: 'Forwarding is set up and marked verified by hand on the Twilio tab.',
    guide: callForwardingGuide,
  },
];

export const integrationInfo = (id: IntegrationId): IntegrationInfo => {
  const found = INTEGRATIONS.find((i) => i.id === id);
  if (!found) throw new Error(`Unknown integration: ${id}`);
  return found;
};
