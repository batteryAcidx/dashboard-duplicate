-- ============================================================================
-- Checks for 015. Run each block on its own, in the DASHBOARD project, clearing the editor each time.
-- Every result line should start with PASS. Nothing is saved: each test undoes its own changes.
-- These tests act as a real admin signed in with the authenticator code.
-- ============================================================================

-- ---------------------------------------------------------------- Block 1: remote controls
create or replace function pg_temp.engine_check_controls()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  adm uuid;
  c jsonb;
  caught boolean;
  n integer;
begin
  begin
    select user_id into adm from public.admins limit 1;
    if adm is null then raise exception 'there is no admin user to test with'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);

    set local role authenticated;
    c := public.admin_get_controls(acct);
    reset role;
    if not ((c -> 'inspection_minutes') is not null and (c -> 'phone_number') is not null and (c -> 'failed_events') is not null and (c -> 'daily_message_cap') is not null) then raise exception 'controls are missing fields: %', c; end if;
    r := array_append(r, 'PASS: an admin can read a client''s controls');

    set local role authenticated;
    c := public.admin_update_controls(acct, '{"inspection_minutes":90,"slot_step_minutes":30,"follow_up_schedule_hours":[2,24,72],"test_mode":true,"daily_message_cap":120,"ai_model":"  claude-haiku-5-5 "}'::jsonb);
    reset role;
    if (c ->> 'inspection_minutes')::int <> 90 or (c ->> 'slot_step_minutes')::int <> 30 or (c ->> 'daily_message_cap')::int <> 120 then raise exception 'values were not saved: %', c; end if;
    if c -> 'follow_up_schedule_hours' <> '[2,24,72]'::jsonb then raise exception 'follow-up schedule was not saved in order: %', c -> 'follow_up_schedule_hours'; end if;
    if c ->> 'ai_model' <> 'claude-haiku-5-5' then raise exception 'the model name was not trimmed'; end if;
    if not (c ->> 'test_mode')::boolean then raise exception 'test mode was not saved'; end if;
    r := array_append(r, 'PASS: booking rules, follow-up schedule, caps and test mode save correctly');

    caught := false;
    begin
      set local role authenticated;
      perform public.admin_update_controls(acct, '{"inspection_minutes":5}'::jsonb);
    exception when others then caught := true;
    end;
    reset role;
    if not caught then raise exception 'an impossible inspection length was accepted'; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_update_controls(acct, '{"reply_delay_min_seconds":50,"reply_delay_max_seconds":10}'::jsonb);
    exception when others then caught := true;
    end;
    reset role;
    if not caught then raise exception 'a reply delay with min above max was accepted'; end if;
    r := array_append(r, 'PASS: impossible values are refused');

    set local role authenticated;
    c := public.admin_update_controls(acct, '{"phone_number":"+12145550777","forwarding_status":"verified","service_lat":32.7767,"service_lon":-96.797,"service_country":"US"}'::jsonb);
    reset role;
    if c ->> 'phone_number' <> '+12145550777' or c ->> 'forwarding_status' <> 'verified' then raise exception 'phone settings were not saved: %', c; end if;
    if (c ->> 'service_lat')::numeric <> 32.7767 then raise exception 'location was not saved'; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_update_controls(acct, '{"phone_number":"12345"}'::jsonb);
    exception when others then caught := true;
    end;
    reset role;
    if not caught then raise exception 'a bad phone number was accepted'; end if;
    r := array_append(r, 'PASS: the texting number, forwarding status and weather location save, and bad numbers are refused');

    -- the texting gate honours the pause timer and test mode
    update public.accounts set status = 'live', registration_status = 'approved', notification_phone = '+12145550999' where id = acct;
    update public.account_engine_settings set engine_enabled = true, test_mode = false, paused_until = null where account_id = acct;
    if not public.engine_can_text(acct, '+12145550888') then raise exception 'a live, enabled account could not text'; end if;
    set local role authenticated;
    perform public.admin_update_controls(acct, json_build_object('paused_until', (now() + interval '2 hours')::text)::jsonb);
    reset role;
    if public.engine_can_text(acct, '+12145550888') then raise exception 'texting continued during a pause'; end if;
    set local role authenticated;
    perform public.admin_update_controls(acct, '{"paused_until":null}'::jsonb);
    reset role;
    if not public.engine_can_text(acct, '+12145550888') then raise exception 'texting did not resume after the pause'; end if;
    r := array_append(r, 'PASS: a pause stops all texting until it ends');

    set local role authenticated;
    perform public.admin_update_controls(acct, '{"test_mode":true}'::jsonb);
    reset role;
    if public.engine_can_text(acct, '+12145550888') then raise exception 'test mode texted a homeowner'; end if;
    if not public.engine_can_text(acct, '+12145550999') then raise exception 'test mode did not allow the owner'; end if;
    r := array_append(r, 'PASS: in test mode only the owner can be texted');

    insert into public.inbox (account_id, event_type, provider_id, payload, status) values (acct, 'sms_inbound', 'CHKFAIL1', '{}'::jsonb, 'failed');
    set local role authenticated;
    n := public.admin_retry_failed_events(acct);
    reset role;
    if n <> 1 or (select status from public.inbox where provider_id = 'CHKFAIL1') <> 'pending' then raise exception 'failed events were not retried'; end if;
    r := array_append(r, 'PASS: failed events can be retried');

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

select * from pg_temp.engine_check_controls();
-- expected: 8 lines, all PASS


-- ---------------------------------------------------------------- Block 2: calendar connection
create or replace function pg_temp.engine_check_calendar_admin()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  adm uuid;
  c jsonb;
  caught boolean;
begin
  begin
    select user_id into adm from public.admins limit 1;
    if adm is null then raise exception 'there is no admin user to test with'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);

    set local role authenticated;
    c := public.admin_calendar_status(acct);
    reset role;
    if c ->> 'provider' <> 'none' or c ->> 'status' <> 'not_connected' then raise exception 'a new client should have no calendar: %', c; end if;
    r := array_append(r, 'PASS: a new client starts with no calendar connected');

    set local role authenticated;
    c := public.admin_calendar_set(acct, 'google', 'owner@summit.example', 'Summit crew calendar', 'active');
    reset role;
    if c ->> 'status' <> 'active' or c ->> 'calendar_label' <> 'Summit crew calendar' then raise exception 'the connection was not saved: %', c; end if;
    r := array_append(r, 'PASS: an admin can connect a Google calendar for a client');

    set local role authenticated;
    c := public.admin_calendar_request_sync(acct);
    reset role;
    if c ->> 'sync_requested_at' is null then raise exception 'the sync request was not recorded'; end if;
    r := array_append(r, 'PASS: an admin can request a sync');

    caught := false;
    begin
      set local role authenticated;
      perform public.admin_calendar_set(acct, 'ics', null, null, 'active');
    exception when others then
      if sqlerrm = 'provider_cannot_be_active' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a calendar feed was marked as an active two-way connection'; end if;
    r := array_append(r, 'PASS: only Google and Microsoft can be an active connection');

    perform public.engine_replace_busy(acct, now(), now() + interval '10 days',
      jsonb_build_array(jsonb_build_object('id', 'chk-1', 'starts_at', now() + interval '1 day', 'ends_at', now() + interval '1 day 1 hour')));
    set local role authenticated;
    c := public.admin_calendar_status(acct);
    reset role;
    if (c ->> 'busy_blocks')::int <> 1 then raise exception 'busy blocks were not counted: %', c; end if;

    set local role authenticated;
    c := public.admin_calendar_disconnect(acct);
    reset role;
    if c ->> 'status' <> 'not_connected' or (c ->> 'busy_blocks')::int <> 0 then raise exception 'disconnect did not clear the calendar: %', c; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_calendar_request_sync(acct);
    exception when others then
      if sqlerrm = 'not_connected' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a sync could be requested with no calendar'; end if;
    r := array_append(r, 'PASS: disconnecting clears the calendar and its blocked times');

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

select * from pg_temp.engine_check_calendar_admin();
-- expected: 5 lines, all PASS


-- ---------------------------------------------------------------- Block 3: billing and the guarantee
create or replace function pg_temp.engine_check_billing()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  adm uuid;
  c jsonb;
  inv uuid;
  s1 timestamptz;
  s2 timestamptz;
  l1 uuid;
  l2 uuid;
  lx uuid;
  caught boolean;
  i integer;
begin
  begin
    select user_id into adm from public.admins limit 1;
    if adm is null then raise exception 'there is no admin user to test with'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);

    set local role authenticated;
    c := public.admin_billing_get(acct);
    reset role;
    if (c ->> 'exists')::boolean or c ->> 'status' <> 'trial' or c -> 'guarantee' ->> 'status' <> 'not_started' then raise exception 'a new client should start as a trial with no guarantee clock: %', c; end if;
    r := array_append(r, 'PASS: a new client starts as a trial with the guarantee not started');

    set local role authenticated;
    c := public.admin_billing_save(acct, json_build_object('plan', 'Standard', 'monthly_price_cents', 69700, 'setup_fee_cents', 50000, 'status', 'active',
                                   'billing_email', 'owner@summit.example', 'go_live_at', (now() - interval '10 days')::text)::jsonb);
    reset role;
    if not (c ->> 'exists')::boolean or (c ->> 'monthly_price_cents')::int <> 69700 or c ->> 'status' <> 'active' then raise exception 'billing was not saved: %', c; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_billing_save(acct, '{"status":"free forever"}'::jsonb);
    exception when others then caught := true;
    end;
    reset role;
    if not caught then raise exception 'an invalid billing status was accepted'; end if;
    r := array_append(r, 'PASS: billing details save, and invalid values are refused');

    set local role authenticated;
    c := public.admin_invoice_add(acct, 'setup', 50000, current_date, 'pending', 'Setup fee');
    reset role;
    if (c ->> 'pending_cents')::int <> 50000 then raise exception 'the pending invoice was not counted: %', c; end if;
    inv := (c -> 'invoices' -> 0 ->> 'id')::uuid;
    set local role authenticated;
    c := public.admin_invoice_set_status(inv, 'paid');
    reset role;
    if (c ->> 'paid_cents')::int <> 50000 or (c ->> 'pending_cents')::int <> 0 then raise exception 'marking paid did not move the amount: %', c; end if;
    set local role authenticated;
    c := public.admin_invoice_add(acct, 'credit', -69700, current_date, 'paid', 'Guarantee credit');
    reset role;
    if (c ->> 'paid_cents')::int <> 50000 - 69700 then raise exception 'a credit should reduce the paid total: %', c; end if;
    r := array_append(r, 'PASS: invoices can be added and marked paid, and credits reduce the total');

    -- two booked inspections inside the window meet the guarantee
    l1 := public.engine_get_or_create_lead(acct, '+12145550701', now());
    l2 := public.engine_get_or_create_lead(acct, '+12145550702', now());
    select slot_start into s1 from public.engine_available_slots(acct, now(), 10, 1);
    perform public.engine_book_inspection(acct, l1, s1, '1 Test St');
    select slot_start into s2 from public.engine_available_slots(acct, now(), 10, 1);
    perform public.engine_book_inspection(acct, l2, s2, '2 Test St');
    set local role authenticated;
    c := public.admin_billing_get(acct);
    reset role;
    if c -> 'guarantee' ->> 'status' <> 'met' or (c -> 'guarantee' ->> 'booked')::int < 2 then raise exception 'two bookings should meet the guarantee: %', c -> 'guarantee'; end if;
    r := array_append(r, 'PASS: two booked inspections in the first 30 days meet the guarantee');

    set local role authenticated;
    c := public.admin_billing_save(acct, '{"guarantee_override":"waived"}'::jsonb);
    reset role;
    if c -> 'guarantee' ->> 'status' <> 'waived' then raise exception 'the waiver was not applied'; end if;
    set local role authenticated;
    perform public.admin_billing_save(acct, '{"guarantee_override":null}'::jsonb);
    reset role;

    -- a finished window with too few bookings: owed only when there were 6+ missed calls a week.
    -- The window is set far in the past so the demo account's real bookings cannot be inside it.
    set local role authenticated;
    perform public.admin_billing_save(acct, json_build_object('go_live_at', (now() - interval '400 days')::text)::jsonb);
    reset role;
    for i in 1..4 loop
      lx := public.engine_get_or_create_lead(acct, '+1214555' || lpad((800 + i)::text, 4, '0'), now());
      update public.leads set created_at = now() - interval '385 days' where id = lx;
    end loop;
    set local role authenticated;
    c := public.admin_billing_get(acct);
    reset role;
    if c -> 'guarantee' ->> 'status' <> 'not_eligible' then raise exception 'with few missed calls the guarantee should not apply: %', c -> 'guarantee'; end if;
    for i in 5..34 loop
      lx := public.engine_get_or_create_lead(acct, '+1214555' || lpad((800 + i)::text, 4, '0'), now());
      update public.leads set created_at = now() - interval '385 days' where id = lx;
    end loop;
    set local role authenticated;
    c := public.admin_billing_get(acct);
    reset role;
    if c -> 'guarantee' ->> 'status' <> 'credit_due' then raise exception 'with enough missed calls and no bookings a credit is due: %', c -> 'guarantee'; end if;
    r := array_append(r, 'PASS: a missed guarantee shows "credit due" only when there were enough missed calls');

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

select * from pg_temp.engine_check_billing();
-- expected: 5 lines, all PASS


-- ---------------------------------------------------------------- Block 4: only admins with the authenticator code
create or replace function pg_temp.engine_check_admin_permissions_2()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  adm uuid;
  owner_uid uuid;
  caught boolean;
begin
  begin
    select user_id into adm from public.admins limit 1;
    select id into owner_uid from public.profiles where account_id = acct limit 1;

    begin
      set local role anon;
      perform public.admin_billing_get(acct);
      r := array_append(r, 'FAIL: the public key can read billing');
    exception when insufficient_privilege then
      r := array_append(r, 'PASS: the public key cannot read billing');
    end;
    reset role;

    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_billing_get(acct);
    exception when others then
      if sqlerrm = 'mfa_required' then caught := true; end if;
    end;
    reset role;
    r := array_append(r, case when caught then 'PASS: billing needs the authenticator code' else 'FAIL: billing was readable without the authenticator code' end);

    if owner_uid is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', owner_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
      perform set_config('request.jwt.claim.sub', owner_uid::text, true);
      caught := false;
      begin
        set local role authenticated;
        perform public.admin_update_controls(acct, '{"test_mode":false}'::jsonb);
      exception when others then
        if sqlerrm = 'forbidden' then caught := true; end if;
      end;
      reset role;
      r := array_append(r, case when caught then 'PASS: a client cannot change their own controls' else 'FAIL: a client could change the admin controls' end);
    end if;

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

select * from pg_temp.engine_check_admin_permissions_2();
-- expected: 3 lines, all PASS
