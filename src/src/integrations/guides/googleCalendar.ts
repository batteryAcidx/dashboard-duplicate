import type { Guide, GuideContext } from '../guide';

export const GOOGLE_SCOPES_TEXT = 'openid\nhttps://www.googleapis.com/auth/userinfo.email\nhttps://www.googleapis.com/auth/calendar.events';

export const googleCalendarGuide = (ctx: GuideContext): Guide => ({
  id: 'google_calendar',
  intro: 'Connect an owner\'s Google Calendar. We never offer a time they are busy, and every booked inspection is added to their calendar, moved when it moves and removed if it is cancelled. You do this once for the whole product; after that each owner presses one Connect button.',
  time: 'About an hour the first time. Google\'s own review for wide use takes longer (see the end).',
  cost: 'Free.',
  steps: [
    {
      title: 'Create a Google Cloud project',
      body: ['Sign in with the Google account you want to own this (your business one). Open the project picker at the top and choose New project. Name it WedgeScale.'],
      link: { label: 'Open Google Cloud', href: 'https://console.cloud.google.com/projectcreate' },
    },
    {
      title: 'Turn on the Calendar API',
      body: ['Open APIs and Services, then Library. Search for Google Calendar API and press Enable.'],
      link: { label: 'Open the API library', href: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com' },
    },
    {
      title: 'Set up the consent screen',
      body: [
        'This is the screen owners see when they approve. Open Google Auth Platform (or APIs and Services, then OAuth consent screen) and start the setup.',
        'Branding: app name WedgeScale, your support email, home page, privacy policy and terms (below), and wedgescale.com as an authorised domain. Audience: External. Data access: add the three scopes below.',
      ],
      copy: [
        { label: 'Home page', value: 'https://wedgescale.com' },
        { label: 'Privacy policy', value: 'https://wedgescale.com/privacy' },
        { label: 'Terms', value: 'https://wedgescale.com/terms' },
        { label: 'Authorised domain', value: 'wedgescale.com' },
        { label: 'Scopes to add', value: GOOGLE_SCOPES_TEXT, multiline: true },
      ],
      note: 'The calendar scope is what Google calls "sensitive". That is fine for now, and the reason for the review at the end.',
    },
    {
      title: 'Create the connection key',
      body: [
        'In Google Auth Platform open Clients, then Create client. Choose Web application and name it WedgeScale dashboard.',
        'Under Authorised redirect URIs add exactly the address below, with nothing after it. Create it, then copy the Client ID and the Client secret. Google may show the secret only once.',
      ],
      copy: [{ label: 'Authorised redirect URI', value: `${ctx.backendUrl}/functions/v1/calendar-callback` }],
    },
    {
      title: 'Publish the app',
      body: [
        'In Google Auth Platform open Audience and press Publish app. Do this now, before connecting anyone.',
        'While an app is in Testing, Google ends every connection after 7 days. Published, it lasts. Until Google reviews it, owners see an "unverified app" warning (they press Advanced, then continue) and about 100 people can connect.',
      ],
    },
    {
      title: 'Make two private passwords',
      body: [
        'We need two long random strings: one protects the connect link, one protects the scheduled sync. A password manager can make them, or run the command twice in a terminal.',
      ],
      copy: [{ label: 'Command (run twice)', value: 'openssl rand -hex 32' }],
    },
    {
      title: 'Give the secrets to Supabase',
      body: ['In Supabase open Project Settings, then Edge Functions, then Secrets, and add these five. Or run the command.'],
      copy: [
        { label: 'Names', value: 'GOOGLE_CLIENT_ID\nGOOGLE_CLIENT_SECRET\nOAUTH_STATE_SECRET\nCRON_SECRET\nAPP_URL', multiline: true },
        { label: 'APP_URL is', value: ctx.appUrl },
        {
          label: 'Or one command',
          value: `npx supabase secrets set GOOGLE_CLIENT_ID=PASTE GOOGLE_CLIENT_SECRET=PASTE OAUTH_STATE_SECRET=PASTE CRON_SECRET=PASTE APP_URL=${ctx.appUrl}`,
          multiline: true,
        },
      ],
    },
    {
      title: 'Put the four functions online',
      body: ['Run these from your project folder. Two are deployed with the login check off because Google and the scheduler cannot sign in to Supabase. Each protects itself with the passwords above.'],
      copy: [
        {
          label: 'Commands',
          value: 'npx supabase functions deploy calendar-oauth\nnpx supabase functions deploy calendar-callback --no-verify-jwt\nnpx supabase functions deploy calendar-sync --no-verify-jwt\nnpx supabase functions deploy integration-status',
          multiline: true,
        },
      ],
    },
    {
      title: 'Keep calendars in step automatically',
      body: [
        'In Supabase open Database, then Extensions, and turn on pg_cron and pg_net. Then open the SQL Editor and run this once, replacing the two placeholders. It syncs every connected calendar every 5 minutes.',
      ],
      copy: [
        {
          label: 'SQL to run once',
          value: `select cron.schedule('calendar-sync', '*/5 * * * *', $$\n  select net.http_post(\n    url := '${ctx.backendUrl}/functions/v1/calendar-sync',\n    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE_YOUR_CRON_SECRET'),\n    body := '{}'::jsonb);\n$$);`,
          multiline: true,
        },
      ],
    },
    {
      title: 'Connect a calendar',
      body: ['In the admin open a client, then the Calendar tab, and press Connect Google Calendar. Approve it (press Advanced if Google warns). You come back to the dashboard, showing who it is connected as. Press Sync now.'],
    },
  ],
  checks: [
    'The Calendar tab says Connected, with the owner\'s email.',
    'Add an event to the owner\'s calendar, press Sync now, and the count of busy times we are avoiding goes up.',
    'Book a test inspection. After the next sync (or Sync now) it appears on the owner\'s calendar, titled Roof inspection.',
  ],
  later: [
    {
      title: 'Get the app verified by Google (before you grow past about 100 people)',
      body: [
        'Google says verification for a sensitive scope typically takes 3 to 5 business days. In practice, developers in 2026 report 4 to 8 weeks or more, sometimes with weeks of silence. Plan for weeks and do not make a launch depend on it.',
        'Before you submit you need: your privacy policy live on the same domain as your home page, including Google\'s required "Limited Use" statement for data from Google APIs; your domain verified in Google Search Console; and a short screen recording showing a person connecting their calendar and how the data is used.',
        'Submit it in the Verification Center of Google Auth Platform. Until it is approved, everything keeps working with the warning screen.',
      ],
      link: { label: "Google's verification guide", href: 'https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification' },
    },
  ],
});
