-- ============================================================================
-- Checks for 017. Run each block on its own, in the DASHBOARD project, clearing the editor each time.
-- Every result line should start with PASS. Nothing is saved: each test undoes its own changes.
-- ============================================================================

-- ---------------------------------------------------------------- Block 1: SKIP THIS ONE
-- It tested the activity log by writing as a user with no login, which the log refuses. The real check is Block 1 of
-- 021_control_center_checks.sql, which signs in as the admin first and tells you exactly why a row is refused.


-- ---------------------------------------------------------------- Block 2: client health
create or replace function pg_temp.engine_check_health()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  adm uuid;
  c jsonb;
  l uuid;
begin
  begin
    select user_id into adm from public.admins limit 1;
    if adm is null then raise exception 'there is no admin user to test with'; end if;

    l := public.engine_get_or_create_lead(acct, '+12145550901', now());
    insert into public.ai_calls (account_id, lead_id, purpose, model, verdict, latency_ms, input_tokens, output_tokens) values
      (acct, l, 'reply', 'test-model', 'sent', 900, 400, 60),
      (acct, l, 'reply', 'test-model', 'fallback', 1500, 420, 0),
      (acct, l, 'reply', 'test-model', 'error', 3000, 0, 0);
    insert into public.inbox (account_id, event_type, provider_id, payload, status, last_error) values (acct, 'sms_inbound', 'CHKHEALTH1', '{}'::jsonb, 'failed', 'model timeout');
    insert into public.owner_alerts (account_id, kind, body, status, last_error) values (acct, 'system', 'x', 'failed', 'boom');

    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);
    set local role authenticated;
    c := public.admin_client_health(acct, 7);
    reset role;

    if (c ->> 'window_days')::int <> 7 then raise exception 'the window is wrong'; end if;
    if (c -> 'ai' ->> 'calls')::int < 3 or (c -> 'ai' ->> 'errors')::int < 1 or (c -> 'ai' ->> 'fallbacks')::int < 1 then raise exception 'AI calls were not counted: %', c -> 'ai'; end if;
    if (c -> 'engine' ->> 'failed')::int < 1 then raise exception 'failed events were not counted: %', c -> 'engine'; end if;
    if (c -> 'alerts' ->> 'failed')::int < 1 then raise exception 'failed owner alerts were not counted: %', c -> 'alerts'; end if;
    if (c -> 'conversations' ->> 'started')::int < 1 then raise exception 'new conversations were not counted'; end if;
    r := array_append(r, 'PASS: health counts AI calls, failed events, failed owner alerts and new conversations');

    if not exists (select 1 from jsonb_array_elements(c -> 'recent_errors') e where e ->> 'kind' = 'A text to the owner failed' and e ->> 'detail' = 'boom') then
      raise exception 'the recent errors list is missing the owner alert failure: %', c -> 'recent_errors';
    end if;
    if not exists (select 1 from jsonb_array_elements(c -> 'recent_errors') e where e ->> 'detail' = 'model timeout') then
      raise exception 'the recent errors list is missing the failed incoming text';
    end if;
    r := array_append(r, 'PASS: recent errors say what went wrong, in plain words');

    set local role authenticated;
    c := public.admin_client_health(acct, 1000);
    reset role;
    if (c ->> 'window_days')::int <> 90 then raise exception 'a huge window should be limited to 90 days'; end if;
    if not ((c -> 'calendar') is not null and (c -> 'weather') is not null and (c -> 'response') is not null and (c -> 'messages') is not null) then raise exception 'health is missing a section'; end if;
    r := array_append(r, 'PASS: the window is limited and every section is present');

    raise exception 'ROLLBACK_TESTS';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'ROLLBACK_TESTS' then
      r := array_append(r, 'FAIL: ' || sqlerrm);
    end if;
  end;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_health();
-- expected: 3 lines, all PASS


-- ---------------------------------------------------------------- Block 3: Stripe mirror and the legacy GHL field
create or replace function pg_temp.engine_check_stripe()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  other uuid := 'b2222222-2222-4222-8222-222222222222';
  r text[] := '{}';
  adm uuid;
  c jsonb;
  ok boolean;
  caught boolean;
  sub_active jsonb := '{"id":"sub_chk1","status":"active","cancel_at_period_end":false,"current_period_end":1798000000,"items":{"data":[{"price":{"unit_amount":69700,"nickname":"Standard","recurring":{"interval":"month"}}}]}}';
  inv_paid jsonb := '{"id":"in_chk1","number":"CHK-0001","status":"paid","amount_due":69700,"amount_paid":69700,"currency":"usd","hosted_invoice_url":"https://invoice.stripe.com/i/chk","created":1797000000,"period_start":1797000000,"period_end":1799600000,"status_transitions":{"paid_at":1797000100}}';
begin
  begin
    select user_id into adm from public.admins limit 1;
    if adm is null then raise exception 'there is no admin user to test with'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);

    caught := false;
    begin
      set local role authenticated;
      perform public.admin_billing_link_stripe(acct, 'cust_12');
    exception when others then
      if sqlerrm = 'bad_stripe_customer' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a bad Stripe customer id was accepted'; end if;

    set local role authenticated;
    c := public.admin_billing_link_stripe(acct, 'cus_CHKTEST1');
    reset role;
    if not (c ->> 'linked')::boolean or c -> 'stripe' ->> 'customer_id' <> 'cus_CHKTEST1' then raise exception 'the customer was not linked: %', c; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_billing_link_stripe(other, 'cus_CHKTEST1');
    exception when others then caught := true;
    end;
    reset role;
    if not caught then raise exception 'one Stripe customer was linked to two clients'; end if;
    r := array_append(r, 'PASS: a client links to one Stripe customer, and bad or duplicate ids are refused');

    ok := public.engine_stripe_record_subscription('evt_chk_1', 'customer.subscription.updated', 'cus_CHKTEST1', sub_active);
    if not ok then raise exception 'a subscription event was not recorded'; end if;
    set local role authenticated;
    c := public.admin_billing_get(acct);
    reset role;
    if c ->> 'status' <> 'active' or c ->> 'plan' <> 'Standard' or (c ->> 'monthly_price_cents')::int <> 69700 or c -> 'stripe' ->> 'subscription_id' <> 'sub_chk1' then
      raise exception 'the subscription was not mirrored: %', c;
    end if;
    if public.engine_stripe_record_subscription('evt_chk_1', 'customer.subscription.updated', 'cus_CHKTEST1', sub_active) then
      raise exception 'a repeated Stripe event was handled twice';
    end if;
    if public.engine_stripe_record_subscription('evt_chk_2', 'customer.subscription.updated', 'cus_NOBODY999', sub_active) then
      raise exception 'an event for an unknown customer was recorded';
    end if;
    r := array_append(r, 'PASS: a Stripe subscription is mirrored, repeats are ignored, and unknown customers are skipped safely');

    perform public.engine_stripe_record_subscription('evt_chk_3', 'customer.subscription.updated', 'cus_CHKTEST1',
      '{"id":"sub_chk1","status":"active","cancel_at_period_end":true,"current_period_end":1798000000,"items":{"data":[{"price":{"unit_amount":697000,"nickname":"Annual","recurring":{"interval":"year"}}}]}}'::jsonb);
    set local role authenticated;
    c := public.admin_billing_get(acct);
    reset role;
    if not (c -> 'stripe' ->> 'cancel_at_period_end')::boolean or (c ->> 'monthly_price_cents')::int <> 58083 then raise exception 'cancel flag or yearly price conversion is wrong: %', c; end if;
    perform public.engine_stripe_record_subscription('evt_chk_4', 'customer.subscription.updated', 'cus_CHKTEST1',
      '{"id":"sub_chk1","status":"past_due","items":{"data":[{"price":{"unit_amount":69700,"nickname":"Standard","recurring":{"interval":"month"}}}]},"current_period_end":1798000000}'::jsonb);
    set local role authenticated;
    c := public.admin_billing_get(acct);
    reset role;
    if c ->> 'status' <> 'past_due' then raise exception 'a past-due subscription should show as past due'; end if;
    r := array_append(r, 'PASS: cancel-at-period-end, yearly prices and past-due status are handled');

    perform public.engine_stripe_record_subscription('evt_chk_5', 'customer.subscription.updated', 'cus_CHKTEST1', sub_active);
    perform public.engine_stripe_record_invoice('evt_chk_6', 'invoice.paid', 'cus_CHKTEST1', inv_paid);
    perform public.engine_stripe_record_payment_method('evt_chk_7', 'payment_method.attached', 'cus_CHKTEST1', 'Visa ending 4242');
    set local role authenticated;
    c := public.admin_billing_get(acct);
    reset role;
    if (c ->> 'paid_cents')::int <> 69700 or jsonb_array_length(c -> 'invoices') <> 1 or c -> 'invoices' -> 0 ->> 'hosted_invoice_url' <> 'https://invoice.stripe.com/i/chk' then raise exception 'the invoice was not mirrored: %', c -> 'invoices'; end if;
    if c -> 'stripe' ->> 'payment_method' <> 'Visa ending 4242' then raise exception 'the payment method was not mirrored'; end if;
    perform public.engine_stripe_record_invoice('evt_chk_8', 'invoice.payment_failed', 'cus_CHKTEST1', '{"id":"in_chk2","number":"CHK-0002","status":"open","amount_due":69700,"amount_paid":0,"currency":"usd","created":1799600000}'::jsonb);
    set local role authenticated;
    c := public.admin_billing_get(acct);
    reset role;
    if c ->> 'status' <> 'past_due' or (c ->> 'open_cents')::int <> 69700 then raise exception 'a failed payment should show as past due with an open balance: %', c; end if;
    r := array_append(r, 'PASS: invoices and the card on file are mirrored, and a failed payment shows as past due');

    set local role authenticated;
    perform public.admin_set_legacy_ghl(acct, 'ghlLoc_123-abc');
    reset role;
    if (select ghl_location_id from public.accounts where id = acct) <> 'ghlLoc_123-abc' then raise exception 'the GHL location was not saved'; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_set_legacy_ghl(acct, 'not valid!');
    exception when others then
      if sqlerrm = 'bad_ghl_location' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a bad GHL location was accepted'; end if;
    set local role authenticated;
    perform public.admin_set_legacy_ghl(acct, '');
    reset role;
    if (select ghl_location_id from public.accounts where id = acct) is not null then raise exception 'the GHL location was not cleared'; end if;
    r := array_append(r, 'PASS: the legacy GHL location can be set, validated and cleared');

    if to_regprocedure('public.admin_invoice_add(uuid,text,integer,date,text,text)') is not null then raise exception 'the manual invoice function is still there'; end if;
    r := array_append(r, 'PASS: the manual invoice list is gone, Stripe is the source of truth');

    raise exception 'ROLLBACK_TESTS';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'ROLLBACK_TESTS' then
      r := array_append(r, 'FAIL: ' || sqlerrm);
    end if;
  end;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_stripe();
-- expected: 6 lines, all PASS


-- ---------------------------------------------------------------- Block 4: permissions
create or replace function pg_temp.engine_check_permissions_5()
returns setof text
language plpgsql
as $$
declare
  r text[] := '{}';
begin
  begin
    set local role anon;
    perform public.admin_activity_list('a1111111-1111-4111-8111-111111111111');
    r := array_append(r, 'FAIL: the public key can read the activity log');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: the public key cannot read the activity log');
  end;
  reset role;

  begin
    set local role authenticated;
    perform public.engine_stripe_record_subscription('evt_x', 'x', 'cus_x', '{}'::jsonb);
    r := array_append(r, 'FAIL: a signed-in user can write Stripe data');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: only the Stripe webhook can write Stripe data');
  end;
  reset role;

  begin
    set local role authenticated;
    perform count(*) from public.stripe_invoices;
    r := array_append(r, 'FAIL: a signed-in user can read the Stripe invoices table directly');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: Stripe invoices can only be read through the admin functions');
  end;
  reset role;

  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_permissions_5();
-- expected: 3 lines, all PASS
