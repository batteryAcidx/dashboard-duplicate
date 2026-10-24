-- ============================================================================
-- Checks for 022. Run each block on its own, in the DASHBOARD project, clearing the editor each time.
-- Every result line should start with PASS (SKIP means Vault is not enabled, so EIN storage could not be tested).
-- Nothing is saved: each test undoes its own changes.
-- ============================================================================

-- ---------------------------------------------------------------- Block 1: step links
create or replace function pg_temp.engine_check_links()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  adm uuid;
  k text;
  st jsonb;
  caught boolean;
begin
  begin
    select user_id into adm from public.admins limit 1;
    select step_key into k from public.setup_steps where account_id = acct order by sort_order limit 1;
    if k is null then
      r := array_append(r, 'SKIP: the demo account has no setup steps to test with');
      raise exception 'ROLLBACK_TESTS';
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);

    set local role authenticated;
    st := public.admin_set_step_request(acct, k, 'Open our form.', '[]'::jsonb, null, 'https://forms.example.com/summit', 'Open the form');
    reset role;
    if st ->> 'info_link' <> 'https://forms.example.com/summit' or st ->> 'info_link_label' <> 'Open the form' then raise exception 'the link was not saved: %', st; end if;

    caught := false;
    begin
      set local role authenticated;
      perform public.admin_set_step_request(acct, k, 'x', '[]'::jsonb, null, 'http://not-secure.example.com', 'x');
    exception when others then
      if sqlerrm = 'bad_link' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a link that is not https was accepted'; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_set_step_request(acct, k, 'x', '[]'::jsonb, null, 'javascript:alert(1)', 'x');
    exception when others then
      if sqlerrm = 'bad_link' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a javascript: link was accepted'; end if;
    r := array_append(r, 'PASS: a step can carry an https link, and anything else is refused');

    set local role authenticated;
    st := public.admin_set_step_request(acct, k, 'Register.', '[]'::jsonb, 'registration_form');
    reset role;
    if st ->> 'action' <> 'registration_form' or st ->> 'info_link' is not null then raise exception 'the registration action was not saved, or the old link stayed: %', st; end if;
    r := array_append(r, 'PASS: a step can send the client to the registration form');

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

select * from pg_temp.engine_check_links();
-- expected: 2 lines, both PASS (or a SKIP)


-- ---------------------------------------------------------------- Block 2: the registration form
create or replace function pg_temp.engine_check_registration()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  adm uuid;
  owner_uid uuid;
  c jsonb;
  caught boolean;
  good jsonb := '{"business_type":"llc","legal_name":"Summit Roofing LLC","has_ein":true,"address1":"1 Main St","city":"Dallas","region":"TX","postal_code":"75201","country":"US","website":"https://summit.example","contact_name":"Mike Brooks","contact_email":"mike@summit.example","contact_phone":"(214) 555-0100","authorized":true}';
  sole jsonb;
  why text;
begin
  begin
    select user_id into adm from public.admins limit 1;
    select id into owner_uid from public.profiles where account_id = acct limit 1;
    if adm is null or owner_uid is null then raise exception 'need an admin and an owner user to test with'; end if;
    sole := (good - 'has_ein') || '{"has_ein":false,"business_type":"sole_proprietor"}'::jsonb;

    perform set_config('request.jwt.claims', json_build_object('sub', owner_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    perform set_config('request.jwt.claim.sub', owner_uid::text, true);

    -- refused: no authorisation tick, a bad EIN, a bad email, an EIN-less LLC
    caught := false;
    begin
      set local role authenticated;
      perform public.owner_submit_registration(good - 'authorized', '12-3456789');
    exception when others then
      if sqlerrm = 'not_authorized' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a form without the authorisation tick was accepted'; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.owner_submit_registration(good, '12-345');
    exception when others then
      if sqlerrm = 'bad_ein' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a short EIN was accepted'; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.owner_submit_registration(good || '{"contact_email":"nope"}'::jsonb, '12-3456789');
    exception when others then
      if sqlerrm = 'bad_email' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a bad email was accepted'; end if;
    caught := false;
    begin
      set local role authenticated;
      perform public.owner_submit_registration((good || '{"has_ein":false}'::jsonb), null);
    exception when others then
      if sqlerrm = 'ein_required' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'an LLC without an EIN was accepted'; end if;
    r := array_append(r, 'PASS: the form refuses a missing tick, a bad EIN, a bad email, and an LLC with no EIN');

    -- the sole-proprietor path needs no vault
    set local role authenticated;
    c := public.owner_submit_registration(sole, null);
    reset role;
    if c ->> 'path' <> 'sole_proprietor' then raise exception 'wrong path: %', c; end if;
    set local role authenticated;
    c := public.owner_get_registration();
    reset role;
    if c ->> 'status' <> 'submitted' or c ->> 'legal_name' <> 'Summit Roofing LLC' or (c -> 'has_ein')::text <> 'false' then raise exception 'the sole-proprietor submission is wrong: %', c; end if;
    if (select legal_name from public.account_business where account_id = acct) <> 'Summit Roofing LLC' then raise exception 'the shared details did not flow into the business tab'; end if;
    r := array_append(r, 'PASS: a business with no EIN is registered as a sole proprietor, and its details flow into the Business tab');

    -- the EIN path needs the vault
    begin
      set local role authenticated;
      c := public.owner_submit_registration(good, '12-3456789');
      c := public.owner_get_registration();
      reset role;
      if c ->> 'ein_last4' <> '6789' then raise exception 'the last four digits are wrong: %', c; end if;
      if c::text like '%123456789%' or c::text like '%12-3456789%' then raise exception 'the EIN came back out to the owner'; end if;

      perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
      perform set_config('request.jwt.claim.sub', adm::text, true);
      set local role authenticated;
      c := public.admin_get_registration(acct);
      reset role;
      if c ->> 'ein_last4' <> '6789' or c ->> 'path' <> 'standard' then raise exception 'the admin view is wrong: %', c; end if;
      if c::text like '%123456789%' or c::text like '%12-3456789%' then raise exception 'the admin view showed the whole EIN without being asked'; end if;
      set local role authenticated;
      why := public.admin_reveal_ein(acct);
      reset role;
      if why <> '12-3456789' then raise exception 'revealing gave the wrong value'; end if;
      if not exists (select 1 from public.admin_audit_log l where l.account_id = acct and l.action = 'ein_revealed') then raise exception 'revealing the EIN was not logged'; end if;
      r := array_append(r, 'PASS: the EIN is stored encrypted, owners and admins only see the last 4, and revealing it is logged');
    exception when invalid_schema_name or undefined_table or undefined_function then
      reset role;
      r := array_append(r, 'SKIP: Vault is not enabled (Database, Extensions), so EIN storage was not tested');
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

select * from pg_temp.engine_check_registration();
-- expected: 3 lines, all PASS (the last may be a SKIP)


-- ---------------------------------------------------------------- Block 3: review and lock
create or replace function pg_temp.engine_check_registration_review()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  adm uuid;
  owner_uid uuid;
  c jsonb;
  caught boolean;
  sole jsonb := '{"business_type":"sole_proprietor","legal_name":"Pat Kim Roofing","has_ein":false,"address1":"1 Main St","city":"Dallas","region":"TX","postal_code":"75201","contact_name":"Pat Kim","contact_email":"pat@kim.example","contact_phone":"2145550101","authorized":true}';
begin
  begin
    select user_id into adm from public.admins limit 1;
    select id into owner_uid from public.profiles where account_id = acct limit 1;
    if adm is null or owner_uid is null then raise exception 'need an admin and an owner user to test with'; end if;

    perform set_config('request.jwt.claims', json_build_object('sub', owner_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    perform set_config('request.jwt.claim.sub', owner_uid::text, true);
    set local role authenticated;
    perform public.owner_submit_registration(sole, null);
    reset role;

    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_set_registration_status(acct, 'needs_changes', '');
    exception when others then
      if sqlerrm = 'notes_required' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'sending it back without saying why was allowed'; end if;

    set local role authenticated;
    c := public.admin_set_registration_status(acct, 'needs_changes', 'The legal name must match your IRS letter.');
    reset role;
    if c ->> 'status' <> 'needs_changes' then raise exception 'the status did not change: %', c; end if;
    perform set_config('request.jwt.claims', json_build_object('sub', owner_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    perform set_config('request.jwt.claim.sub', owner_uid::text, true);
    set local role authenticated;
    c := public.owner_get_registration();
    reset role;
    if c ->> 'note' <> 'The legal name must match your IRS letter.' then raise exception 'the owner cannot see what to fix: %', c; end if;
    r := array_append(r, 'PASS: sending it back requires a reason, and the client sees it');

    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);
    set local role authenticated;
    perform public.admin_set_registration_status(acct, 'ready', null);
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', owner_uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    perform set_config('request.jwt.claim.sub', owner_uid::text, true);
    caught := false;
    begin
      set local role authenticated;
      perform public.owner_submit_registration(sole, null);
    exception when others then
      if sqlerrm = 'locked' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a registration that is ready could still be changed by the client'; end if;
    r := array_append(r, 'PASS: once marked ready, the client can no longer change what will be filed');

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

select * from pg_temp.engine_check_registration_review();
-- expected: 2 lines, both PASS


-- ---------------------------------------------------------------- Block 4: permissions
create or replace function pg_temp.engine_check_permissions_7()
returns setof text
language plpgsql
as $$
declare
  r text[] := '{}';
begin
  begin
    set local role anon;
    perform public.owner_submit_registration('{}'::jsonb, null);
    r := array_append(r, 'FAIL: the public key can submit a registration');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: the public key cannot submit a registration');
  end;
  reset role;
  begin
    set local role authenticated;
    perform count(*) from public.account_registration;
    r := array_append(r, 'FAIL: a signed-in user can read the registration table directly');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: registrations can only be read through the owner and admin functions');
  end;
  reset role;
  begin
    set local role authenticated;
    perform public.admin_reveal_ein('a1111111-1111-4111-8111-111111111111');
    r := array_append(r, 'FAIL: a client login could reveal an EIN');
  exception when others then
    r := array_append(r, 'PASS: a client login cannot reveal an EIN');
  end;
  reset role;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_permissions_7();
-- expected: 3 lines, all PASS
