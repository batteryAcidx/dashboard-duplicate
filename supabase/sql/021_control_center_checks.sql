-- ============================================================================
-- Checks for 019 and 020. Run each block on its own, in the DASHBOARD project, clearing the editor each time.
-- Every result line should start with PASS (SKIP means that check could not run on your data and is fine).
-- Nothing is saved: each test undoes its own changes.
-- ============================================================================

-- ---------------------------------------------------------------- Block 1: the activity log really records things now
create or replace function pg_temp.engine_check_audit_fix()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  adm uuid;
  why text;
  c jsonb;
begin
  begin
    select user_id into adm from public.admins limit 1;
    if adm is null then raise exception 'there is no admin user to test with'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);

    why := private.engine_log_admin_action(acct, 'chk_audit_a', 'written by the check');
    if why <> '' then raise exception 'the admin log refused the row. Reason: %', why; end if;
    r := array_append(r, 'PASS: the admin log accepts the rows the new functions write');

    set local role authenticated;
    c := public.admin_activity_list(acct, null, null, null, 'chk_audit_a');
    reset role;
    if (c ->> 'total')::int <> 1 or c -> 'rows' -> 0 ->> 'detail' <> 'written by the check' then raise exception 'the row was not found again: %', c; end if;
    r := array_append(r, 'PASS: and the activity list finds them');

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

select * from pg_temp.engine_check_audit_fix();
-- expected: 2 lines, both PASS. If the first says FAIL, the reason after "Reason:" is the exact database error.


-- ---------------------------------------------------------------- Block 2: setup steps that ask for information
create or replace function pg_temp.engine_check_setup_requests()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  adm uuid;
  owner_uid uuid;
  k text;
  st jsonb;
  c jsonb;
  caught boolean;
begin
  begin
    select user_id into adm from public.admins limit 1;
    select id into owner_uid from public.profiles where account_id = acct limit 1;
    select step_key into k from public.setup_steps where account_id = acct order by sort_order limit 1;
    if k is null then
      r := array_append(r, 'SKIP: the demo account has no setup steps to test with');
      raise exception 'ROLLBACK_TESTS';
    end if;
    if adm is null or owner_uid is null then raise exception 'need an admin and an owner user to test with'; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);

    set local role authenticated;
    st := public.admin_set_step_request(acct, k, 'We need a few details about the business.',
      '[{"key":"legal_name","label":"Legal business name","type":"text","required":true},{"key":"contact_email","label":"Contact email","type":"email"},{"key":"crew","label":"Crew size","type":"select","options":["1-3","4-10","10+"]}]'::jsonb);
    reset role;
    if jsonb_array_length(st -> 'info_fields') <> 3 or st ->> 'info_prompt' <> 'We need a few details about the business.' then raise exception 'the request was not saved: %', st; end if;
    r := array_append(r, 'PASS: an admin can ask for information in a setup step');

    caught := false;
    begin
      set local role authenticated;
      perform public.admin_set_step_request(acct, k, 'x', '[{"key":"a","label":"A","type":"text"},{"key":"a","label":"B","type":"text"}]'::jsonb);
    exception when others then
      if sqlerrm = 'bad_fields' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'two fields with the same key were accepted'; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_set_step_request(acct, k, 'x', '[{"key":"a","label":"A","type":"banana"}]'::jsonb);
    exception when others then
      if sqlerrm = 'bad_fields' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'an unknown field type was accepted'; end if;
    r := array_append(r, 'PASS: malformed requests are refused');

    perform set_config('request.jwt.claims', json_build_object('sub', owner_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    perform set_config('request.jwt.claim.sub', owner_uid::text, true);

    caught := false;
    begin
      set local role authenticated;
      perform public.owner_submit_step_info(k, '{"contact_email":"a@b.co"}'::jsonb);
    exception when others then
      if sqlerrm = 'missing_field' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a required field was skipped without complaint'; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.owner_submit_step_info(k, '{"legal_name":"Summit Roofing LLC","contact_email":"not-an-email"}'::jsonb);
    exception when others then
      if sqlerrm = 'bad_email' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a bad email was accepted'; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.owner_submit_step_info(k, '{"legal_name":"Summit Roofing LLC","crew":"a hundred"}'::jsonb);
    exception when others then
      if sqlerrm = 'bad_choice' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a choice that is not on the list was accepted'; end if;

    set local role authenticated;
    perform public.owner_submit_step_info(k, '{"legal_name":"  Summit Roofing LLC ","contact_email":"mike@summit.example","crew":"4-10","sneaky":"ignored"}'::jsonb);
    reset role;
    st := (select to_jsonb(s) from public.setup_steps s where s.account_id = acct and s.step_key = k);
    if st -> 'info_response' ->> 'legal_name' <> 'Summit Roofing LLC' or st -> 'info_response' ->> 'crew' <> '4-10' then raise exception 'the answers were not saved: %', st -> 'info_response'; end if;
    if (st -> 'info_response' -> 'sneaky') is not null then raise exception 'an answer to a question that was never asked was stored'; end if;
    if st ->> 'info_submitted_at' is null then raise exception 'the time it was sent was not recorded'; end if;
    r := array_append(r, 'PASS: a client can send the information, it is checked, and only the questions asked are kept');

    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);
    set local role authenticated;
    c := public.admin_setup_overview(acct);
    reset role;
    if jsonb_array_length(c -> 'steps') < 1 then raise exception 'the overview has no steps'; end if;
    if not exists (select 1 from jsonb_array_elements(c -> 'steps') e where e ->> 'step_key' = k and e -> 'info_response' ->> 'crew' = '4-10') then raise exception 'the overview does not show what the client sent'; end if;
    r := array_append(r, 'PASS: the admin overview shows the request and the answers together');

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

select * from pg_temp.engine_check_setup_requests();
-- expected: 4 lines, all PASS (or one SKIP if the demo account has no setup steps)


-- ---------------------------------------------------------------- Block 3: emails, business details and Twilio
create or replace function pg_temp.engine_check_business_twilio()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  adm uuid;
  c jsonb;
  k text;
  caught boolean;
begin
  begin
    select user_id into adm from public.admins limit 1;
    if adm is null then raise exception 'there is no admin user to test with'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);

    perform public.engine_log_setup_email(acct, null, 'owner@summit.example', 'Quick question about setup', 'Hi Mike', adm, 'sent', 're_123', null);
    set local role authenticated;
    c := public.admin_setup_overview(acct);
    reset role;
    if not exists (select 1 from jsonb_array_elements(c -> 'emails') e where e ->> 'subject' = 'Quick question about setup' and e ->> 'status' = 'sent') then raise exception 'the sent email is not listed'; end if;
    r := array_append(r, 'PASS: sent emails are logged and listed');

    set local role authenticated;
    c := public.admin_save_business(acct, '{"legal_name":"Summit Roofing LLC","city":"Dallas","region":"TX","website":"https://summit.example"}'::jsonb);
    reset role;
    if c ->> 'legal_name' <> 'Summit Roofing LLC' or c ->> 'city' <> 'Dallas' then raise exception 'business details were not saved: %', c; end if;
    set local role authenticated;
    c := public.admin_save_business(acct, '{"city":""}'::jsonb);
    reset role;
    if c ->> 'city' is not null or c ->> 'legal_name' <> 'Summit Roofing LLC' then raise exception 'clearing one field changed another: %', c; end if;
    r := array_append(r, 'PASS: business details save field by field, and a field can be cleared');

    select step_key into k from public.setup_steps where account_id = acct order by sort_order limit 1;
    if k is not null then
      update public.setup_steps set info_response = '{"legal_name":"Summit Roofing Inc","contact_name":"Mike Brooks","crew":"4-10"}'::jsonb where account_id = acct and step_key = k;
      set local role authenticated;
      c := public.admin_apply_step_info_to_business(acct, k);
      reset role;
      if c ->> 'legal_name' <> 'Summit Roofing Inc' or c ->> 'contact_name' <> 'Mike Brooks' then raise exception 'the answers were not copied: %', c; end if;
      if (c -> 'crew') is not null then raise exception 'an answer with no matching business field was copied'; end if;
      r := array_append(r, 'PASS: what the client sent can be copied into their business details');
    else
      r := array_append(r, 'SKIP: the demo account has no setup steps, so copying answers was not tested');
    end if;

    set local role authenticated;
    c := public.admin_save_twilio(acct, json_build_object('twilio_subaccount_sid', 'AC' || repeat('a', 32), 'messaging_service_sid', 'MG' || repeat('b', 32),
          'phone_number', '+12145550166', 'forwarding_status', 'pending', 'registration_status', 'pending')::jsonb);
    reset role;
    if c ->> 'phone_number' <> '+12145550166' or c ->> 'forwarding_status' <> 'pending' or c ->> 'registration_status' <> 'pending' then raise exception 'Twilio details were not saved: %', c; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_save_twilio(acct, '{"messaging_service_sid":"not-a-sid"}'::jsonb);
    exception when others then caught := true;
    end;
    reset role;
    if not caught then raise exception 'a malformed Twilio id was accepted'; end if;
    r := array_append(r, 'PASS: Twilio details save, and malformed ids are refused');

    caught := false;
    begin
      set local role authenticated;
      perform public.admin_store_twilio_token(acct, 'short');
    exception when others then
      if sqlerrm = 'bad_token' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a malformed token was accepted'; end if;
    begin
      set local role authenticated;
      c := public.admin_store_twilio_token(acct, repeat('c', 32));
      reset role;
      if not (c ->> 'has_token')::boolean then raise exception 'the token was not stored'; end if;
      if c::text like '%' || repeat('c', 32) || '%' then raise exception 'the token was shown back'; end if;
      r := array_append(r, 'PASS: the Twilio token is stored encrypted and never shown again');
    exception when invalid_schema_name or undefined_table or undefined_function then
      reset role;
      r := array_append(r, 'SKIP: Vault is not enabled (Database, Extensions), so token storage was not tested');
    end;

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

select * from pg_temp.engine_check_business_twilio();
-- expected: 5 or 6 lines, all PASS or SKIP


-- ---------------------------------------------------------------- Block 4: deleting a client, and the calendar plumbing
create or replace function pg_temp.engine_check_delete_calendar()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  adm uuid;
  c jsonb;
  caught boolean;
  lead1 uuid;
  appt uuid;
  s1 timestamptz;
  n integer;
begin
  begin
    select user_id into adm from public.admins limit 1;
    if adm is null then raise exception 'there is no admin user to test with'; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);

    update public.accounts set status = 'live' where id = acct;
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_delete_client(acct, 'anything');
    exception when others then
      if sqlerrm = 'must_cancel_first' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a client that is not cancelled could be deleted'; end if;
    update public.accounts set status = 'cancelled' where id = acct;
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_delete_client(acct, 'the wrong name');
    exception when others then
      if sqlerrm = 'name_mismatch' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a client could be deleted without typing its name'; end if;
    if not exists (select 1 from public.accounts where id = acct) then raise exception 'the client disappeared'; end if;
    update public.accounts set status = 'live' where id = acct;
    r := array_append(r, 'PASS: a client can only be deleted once cancelled, and only by typing its name');

    perform public.engine_calendar_connected(acct, 'google', 'primary', 'owner@summit.example');
    set local role authenticated;
    c := public.admin_calendar_status(acct);
    reset role;
    if c ->> 'status' <> 'active' or c ->> 'provider' <> 'google' or c ->> 'calendar_label' <> 'owner@summit.example' then raise exception 'the connection was not recorded: %', c; end if;
    if not exists (select 1 from public.engine_calendar_accounts_due() d where d = acct) then
      update public.calendar_connections set token_secret_id = gen_random_uuid() where account_id = acct;
      if not exists (select 1 from public.engine_calendar_accounts_due() d where d = acct) then raise exception 'a connected calendar is not due for a sync'; end if;
    end if;
    perform public.engine_calendar_failed(acct, 'needs_reauth', 'invalid_grant');
    set local role authenticated;
    c := public.admin_calendar_status(acct);
    reset role;
    if c ->> 'status' <> 'needs_reauth' or c ->> 'last_error' <> 'invalid_grant' then raise exception 'a failed sync was not recorded: %', c; end if;
    r := array_append(r, 'PASS: a connected calendar is due for sync, and a failure is recorded');

    perform public.engine_calendar_connected(acct, 'google', 'primary', 'owner@summit.example');
    lead1 := public.engine_get_or_create_lead(acct, '+12145550931', now());
    update public.leads set name = 'Pat Kim' where id = lead1;
    select slot_start into s1 from public.engine_available_slots(acct, now(), 10, 1);
    appt := public.engine_book_inspection(acct, lead1, s1, '1 Test St, Plano');
    c := public.engine_calendar_appointment(appt);
    if c ->> 'name' <> 'Pat Kim' or c ->> 'address' <> '1 Test St, Plano' or c ->> 'timezone' is null or c ->> 'company' is null then raise exception 'the calendar event details are incomplete: %', c; end if;
    select count(*) into n from public.engine_claim_calendar_outbox_for(acct, 5);
    if n <> 1 then raise exception 'the booking was not waiting to be written to the calendar (claimed %)', n; end if;
    select count(*) into n from public.engine_claim_calendar_outbox_for(acct, 5);
    if n <> 0 then raise exception 'the same write was claimed twice'; end if;
    r := array_append(r, 'PASS: a booking is queued for the owner''s calendar with everything the event needs');

    begin
      perform public.engine_store_calendar_token(acct, 'refresh-token-test');
      if public.engine_get_calendar_token(acct) <> 'refresh-token-test' then raise exception 'the calendar token did not round-trip'; end if;
      perform public.engine_delete_calendar_token(acct);
      if public.engine_get_calendar_token(acct) is not null then raise exception 'the calendar token was not deleted'; end if;
      r := array_append(r, 'PASS: the calendar token is kept encrypted, read back, and fully deleted');
    exception when invalid_schema_name or undefined_table or undefined_function then
      r := array_append(r, 'SKIP: Vault is not enabled (Database, Extensions), so token storage was not tested');
    end;

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

select * from pg_temp.engine_check_delete_calendar();
-- expected: 4 or 5 lines, all PASS or SKIP


-- ---------------------------------------------------------------- Block 5: permissions
create or replace function pg_temp.engine_check_permissions_6()
returns setof text
language plpgsql
as $$
declare
  r text[] := '{}';
begin
  begin
    set local role anon;
    perform public.owner_submit_step_info('x', '{}'::jsonb);
    r := array_append(r, 'FAIL: the public key can submit setup information');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: the public key cannot submit setup information');
  end;
  reset role;

  begin
    set local role authenticated;
    perform public.engine_get_calendar_token('a1111111-1111-4111-8111-111111111111');
    r := array_append(r, 'FAIL: a signed-in user can read a calendar token');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: calendar tokens can only be read by the sync service');
  end;
  reset role;

  begin
    set local role authenticated;
    perform count(*) from public.setup_emails;
    r := array_append(r, 'FAIL: a signed-in user can read the sent emails table');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: sent emails can only be read through the admin functions');
  end;
  reset role;

  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_permissions_6();
-- expected: 3 lines, all PASS
