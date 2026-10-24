import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SPECS, computeStatus } from '../supabase/functions/_shared/integrations.ts';
import { INTEGRATIONS } from '../src/integrations/catalog.ts';
import { STRIPE_EVENTS } from '../src/integrations/guides/stripe.ts';
import { planEvent } from '../supabase/functions/_shared/stripe.ts';

const env = (o: Record<string, string>) => (n: string) => o[n];
// distinctive fake values, so the "nothing leaks" test cannot pass or fail by accident
const ALL = {
  STRIPE_SECRET_KEY: 'rk_test_FAKE_9f3a1c', STRIPE_WEBHOOK_SECRET: 'whsec_FAKE_77d2e0',
  GOOGLE_CLIENT_ID: 'FAKE-client-id-123456.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'GOCSPX-FAKE-secret-abc', OAUTH_STATE_SECRET: 'FAKE-state-secret-0011',
  APP_URL: 'https://dashboard.wedgescale.com', CRON_SECRET: 'FAKE-cron-secret-2233', RESEND_API_KEY: 're_FAKE_key_445566', EMAIL_FROM: 'WedgeScale <contact@wedgescale.com>',
};

describe('which services are plugged in', () => {
  test('with nothing set, each real service is off, and says exactly what it is missing', () => {
    const s = computeStatus(env({}));
    assert.equal(s.stripe.state, 'not_configured');
    assert.deepEqual(s.stripe.missing, ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']);
    assert.equal(s.google_calendar.state, 'not_configured');
    assert.deepEqual(s.google_calendar.missing, ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'OAUTH_STATE_SECRET', 'APP_URL']);
    assert.equal(s.email.state, 'not_configured');
    assert.deepEqual(s.email.missing, ['RESEND_API_KEY', 'EMAIL_FROM']);
  });

  test('each service turns on by itself, so they can be plugged in in any order', () => {
    const onlyStripe = computeStatus(env({ STRIPE_SECRET_KEY: 'a', STRIPE_WEBHOOK_SECRET: 'b' }));
    assert.equal(onlyStripe.stripe.state, 'ready');
    assert.equal(onlyStripe.google_calendar.state, 'not_configured');
    assert.equal(onlyStripe.email.state, 'not_configured');
    const onlyEmail = computeStatus(env({ RESEND_API_KEY: 'a', EMAIL_FROM: 'b' }));
    assert.equal(onlyEmail.email.state, 'ready');
    assert.equal(onlyEmail.stripe.state, 'not_configured');
  });

  test('half set up is still off, and only the missing part is named', () => {
    const s = computeStatus(env({ STRIPE_SECRET_KEY: 'a' }));
    assert.equal(s.stripe.state, 'not_configured');
    assert.deepEqual(s.stripe.missing, ['STRIPE_WEBHOOK_SECRET']);
  });

  test('empty and blank values count as missing', () => {
    const s = computeStatus(env({ STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '   ' }));
    assert.deepEqual(s.stripe.missing, ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']);
  });

  test('everything set means everything ready', () => {
    const s = computeStatus(env(ALL));
    for (const id of ['stripe', 'google_calendar', 'email'] as const) {
      assert.equal(s[id].state, 'ready', id);
      assert.deepEqual(s[id].missing, [], id);
      assert.deepEqual(s[id].warnings, [], id);
    }
  });

  test('a missing recommended setting only warns', () => {
    const { CRON_SECRET: _drop, ...rest } = ALL;
    const s = computeStatus(env(rest));
    assert.equal(s.google_calendar.state, 'ready');
    assert.deepEqual(s.google_calendar.warnings, ['CRON_SECRET']);
  });

  test('Twilio is done by hand and call forwarding is undecided, whatever is set', () => {
    for (const e of [{}, ALL]) {
      const s = computeStatus(env(e));
      assert.equal(s.twilio.state, 'manual');
      assert.equal(s.call_forwarding.state, 'undecided');
    }
  });

  test('only names ever come out, never a value', () => {
    const json = JSON.stringify(computeStatus(env(ALL)));
    for (const v of Object.values(ALL)) assert.ok(!json.includes(v), `a secret value leaked: ${v}`);
  });

  test('every integration has exactly one entry', () => {
    assert.deepEqual(SPECS.map((s) => s.id).sort(), ['call_forwarding', 'email', 'google_calendar', 'stripe', 'twilio']);
  });
});


describe('the guides and the backend agree', () => {
  const ctx = { backendUrl: 'https://abcd1234.supabase.co', appUrl: 'https://dashboard.wedgescale.com' };
  const text = (id: string) => JSON.stringify(INTEGRATIONS.find((i) => i.id === id)!.guide(ctx));

  test('each guide names every secret the backend requires, so the docs cannot drift', () => {
    for (const spec of SPECS) {
      const g = text(spec.id);
      for (const name of [...spec.required, ...(spec.recommended ?? [])]) assert.ok(g.includes(name), `${spec.id} guide never mentions ${name}`);
    }
  });

  test('every event the Stripe guide tells you to select is one the webhook acts on', () => {
    const customer = 'cus_abc123456';
    const sample: Record<string, object> = {
      subscription: { id: 'sub_1', status: 'active', customer, items: { data: [] } },
      invoice: { id: 'in_1', customer, status: 'paid' },
      payment_method: { customer, card: { brand: 'visa', last4: '4242' } },
    };
    for (const type of STRIPE_EVENTS) {
      const obj = type.startsWith('customer.subscription') ? sample.subscription : type.startsWith('invoice') ? sample.invoice : sample.payment_method;
      assert.notEqual(planEvent({ id: 'evt', type, data: { object: obj as never } }).kind, 'ignore', `${type} is selected in the guide but ignored by the webhook`);
    }
  });

  test('each function a guide tells you to deploy really exists', () => {
    const dir = join(process.cwd(), '..', 'supabase', 'functions');
    const deployed = new Set<string>();
    for (const i of INTEGRATIONS) for (const m of text(i.id).matchAll(/functions deploy ([a-z-]+)/g)) deployed.add(m[1]);
    assert.equal(deployed.size, 7, 'the guides name seven functions: if you add one, add its folder and this number');
    for (const name of deployed) assert.ok(existsSync(join(dir, name, 'index.ts')), `${name} is in a guide but has no folder`);
  });
});
