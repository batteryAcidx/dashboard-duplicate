import type { Guide, GuideContext } from '../guide';

export const emailGuide = (ctx: GuideContext): Guide => ({
  id: 'email',
  intro: 'Lets you email a client from the Setup tab without leaving the dashboard, and keeps a record of what was sent. Replies come to your normal inbox. Without it, the "Open in my email app" button still works.',
  time: 'About 20 minutes, plus waiting for your domain to verify.',
  cost: 'Resend has a free tier that is plenty for this. Check their pricing page.',
  steps: [
    {
      title: 'Create a Resend account',
      body: ['Resend is the service that sends the email for us.'],
      link: { label: 'Open Resend', href: 'https://resend.com/signup' },
    },
    {
      title: 'Add your domain',
      body: [
        'In Resend open Domains and add wedgescale.com. Resend shows a few DNS records. Add them where your domain is managed (your registrar or DNS host), then press Verify.',
        'This proves the email really comes from you, which keeps it out of spam. DNS changes can take a few minutes up to a day.',
      ],
      copy: [{ label: 'Domain', value: 'wedgescale.com' }],
    },
    {
      title: 'Make an API key',
      body: ['In Resend open API keys, create one with Sending access, and copy it. It starts with re_.'],
    },
    {
      title: 'Give the settings to Supabase',
      body: ['In Supabase open Project Settings, then Edge Functions, then Secrets. Add these. EMAIL_REPLY_TO is optional and defaults to the from address.'],
      copy: [
        { label: 'Names', value: 'RESEND_API_KEY\nEMAIL_FROM\nEMAIL_REPLY_TO', multiline: true },
        { label: 'EMAIL_FROM is', value: 'WedgeScale <contact@wedgescale.com>' },
        { label: 'Or one command', value: 'npx supabase secrets set RESEND_API_KEY=re_PASTE EMAIL_FROM="WedgeScale <contact@wedgescale.com>" EMAIL_REPLY_TO=contact@wedgescale.com', multiline: true },
      ],
    },
    {
      title: 'Put the functions online',
      body: ['Run these from your project folder.'],
      copy: [{ label: 'Commands', value: 'npx supabase functions deploy send-client-email\nnpx supabase functions deploy integration-status', multiline: true }],
    },
  ],
  checks: [
    `Create a test client with your own email address. On its Setup tab open a step, choose Email the client, and press Send email. It arrives from WedgeScale, and replying goes to your inbox.`,
    'The sent email shows under "Already sent about this" with a green Sent label.',
    `If it fails, the label says Failed and shows why. The most common cause is a domain that has not finished verifying (${ctx.appUrl.replace(/^https?:\/\//, '')} is unaffected, the sending domain is).`,
  ],
});
