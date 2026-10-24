import type { Guide, GuideContext } from '../guide';

export const STRIPE_EVENTS = [
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'invoice.created', 'invoice.finalized', 'invoice.paid', 'invoice.payment_failed', 'invoice.voided', 'payment_method.attached',
];

export const stripeGuide = (ctx: GuideContext): Guide => ({
  id: 'stripe',
  intro: 'Stripe takes the payments. WedgeScale only listens: when a client pays, changes plan or a payment fails, Stripe tells the dashboard, and the Billing tab updates by itself. Nothing is typed in twice.',
  time: 'About 45 minutes the first time, most of it clicking around Stripe.',
  cost: 'Stripe is free to open. It takes a percentage of each payment. Check their pricing page for the current rate.',
  steps: [
    {
      title: 'Open a Stripe account',
      body: [
        'Sign up with your business email. You do not have to finish Stripe\'s business verification to begin: Stripe gives you a test mode where no real money moves, and everything below works in it.',
        'Stay in test mode until the last section. Look for the Test mode (or Sandbox) switch at the top of the Stripe dashboard.',
      ],
      link: { label: 'Open Stripe sign-up', href: 'https://dashboard.stripe.com/register' },
    },
    {
      title: 'Create what you sell',
      body: [
        'In Stripe, open Product catalog and choose Add product. Name it WedgeScale. Under pricing choose Recurring, set $697, and set the period to Monthly. Save it.',
        'The setup fee changes from client to client ($500 to $1,000), so the simplest way is to add it as a one-off line on each client\'s first invoice, rather than making a product for every amount.',
      ],
    },
    {
      title: 'Create a customer for each client',
      body: [
        'Open Customers and choose Add customer. Use the client\'s company name and the owner\'s email.',
        'Open the customer. Their ID is shown on their page and in the address bar, and starts with cus_. Copy it: you will paste it into the dashboard in a moment.',
        'On the customer\'s page, create their subscription with the WedgeScale price, and add the setup fee as a one-time item.',
      ],
      note: 'One customer in Stripe per client. The dashboard refuses to link the same Stripe customer to two clients.',
    },
    {
      title: 'Make a read-only key for the dashboard',
      body: [
        'Open Developers, then API keys, then Create restricted key. Name it WedgeScale dashboard.',
        'Give it Read access to Customers, Subscriptions, Invoices and Payment methods. Leave everything else on None.',
        'Copy the key. It starts with rk_test_ while you are in test mode. Because it can only read, a leak could not move money.',
      ],
      note: 'Do not use the full "Secret key" Stripe shows by default. The restricted key is safer and is all this needs.',
    },
    {
      title: 'Tell Stripe where to send updates',
      body: [
        'Open Developers, then Webhooks, then Add endpoint. Paste the address below as the endpoint URL, and select the events listed.',
        'Save it, open the endpoint, and reveal its Signing secret. It starts with whsec_. Copy it.',
      ],
      copy: [
        { label: 'Endpoint URL', value: `${ctx.backendUrl}/functions/v1/stripe-webhook` },
        { label: 'Events to send', value: STRIPE_EVENTS.join('\n'), multiline: true },
      ],
    },
    {
      title: 'Give the two secrets to Supabase',
      body: [
        'Easiest: in Supabase open Project Settings, then Edge Functions, then Secrets, and add the two below. Or run the command from your project folder.',
        'Replace the placeholders with the key from step 4 and the signing secret from step 5.',
      ],
      copy: [
        { label: 'Secret name 1', value: 'STRIPE_SECRET_KEY' },
        { label: 'Secret name 2', value: 'STRIPE_WEBHOOK_SECRET' },
        { label: 'Or one command', value: 'npx supabase secrets set STRIPE_SECRET_KEY=rk_test_PASTE_HERE STRIPE_WEBHOOK_SECRET=whsec_PASTE_HERE', multiline: true },
      ],
    },
    {
      title: 'Put the three functions online',
      body: [
        'Run these from your project folder. The webhook is deployed with its login check switched off because Stripe cannot sign in to Supabase. It protects itself instead: it rejects anything not signed with your signing secret.',
      ],
      copy: [
        {
          label: 'Commands',
          value: 'npx supabase functions deploy stripe-webhook --no-verify-jwt\nnpx supabase functions deploy stripe-sync\nnpx supabase functions deploy integration-status',
          multiline: true,
        },
      ],
    },
    {
      title: 'Link a client',
      body: ['In the admin, open the client, then the Billing tab. Paste their Stripe customer ID and press Link and sync. Their plan, card and invoices appear.'],
    },
  ],
  checks: [
    'In Stripe, open your webhook endpoint and press Send test webhook. It should answer 200.',
    'Create a test subscription with the card 4242 4242 4242 4242, any future date and any 3-digit code. It appears on the client\'s Billing tab within seconds.',
    'To see a failed payment, use the test card 4000 0000 0000 0341. The tab shows Past due.',
  ],
  later: [
    {
      title: 'Going live (when you are ready to take real money)',
      body: [
        'In Stripe, complete the business verification it asks for (your business details and a bank account). Stripe decides when to approve it, so start this early.',
        'Switch Stripe to Live mode. Test and live are completely separate worlds: repeat steps 2, 4 and 5 in Live mode (a live product, a live restricted key starting rk_live_, and a live webhook endpoint with its own signing secret).',
        'Update the two secrets in Supabase with the live values, and link each client again using their live customer ID.',
      ],
    },
  ],
});
