-- ============================================================================
-- Checks for 013. Run each block on its own, in the DASHBOARD project, clearing the editor each time.
-- Every result line should start with PASS. Nothing is saved: each test undoes its own changes.
-- These tests pretend to be a real signed-in owner and a real admin.
-- ============================================================================

-- ---------------------------------------------------------------- Block 1: what an owner can do
create or replace function pg_temp.engine_check_owner_actions()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  other uuid := 'b2222222-2222-4222-8222-222222222222';
  r text[] := '{}';
  uid uuid;
  l1 uuid;
  olead uuid;
  res jsonb;
  caught boolean;
begin
  begin
    select id into uid from public.profiles where account_id = acct limit 1;
    if uid is null then raise exception 'no user belongs to the Summit account, so this cannot be tested'; end if;

    l1 := public.engine_get_or_create_lead(acct, '+12145550601', now());
    olead := public.engine_get_or_create_lead(other, '+12145550603', now());

    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    perform set_config('request.jwt.claim.sub', uid::text, true);

    set local role authenticated;
    res := public.owner_set_lead_type(l1, 'supplier');
    reset role;
    if (select contact_type from public.leads where id = l1) <> 'supplier' then raise exception 'the lead did not become a supplier'; end if;
    if (select status from public.leads where id = l1) <> 'not_a_lead' then raise exception 'a supplier should be filed as not a lead'; end if;
    if (select auto_reply from public.contacts where account_id = acct and phone_e164 = '+12145550601') <> 'owner_only' then raise exception 'suppliers should default to owner-only'; end if;
    if (select source from public.contacts where account_id = acct and phone_e164 = '+12145550601') <> 'owner' then raise exception 'the owner choice should be recorded as the owner''s'; end if;
    if not exists (select 1 from public.lead_events where lead_id = l1 and event_type = 'contact_classified' and actor = 'owner') then raise exception 'no event was logged'; end if;
    r := array_append(r, 'PASS: an owner can mark a caller as a supplier, and the lead is filed as not a lead');

    set local role authenticated;
    res := public.owner_set_lead_type(l1, 'homeowner');
    reset role;
    if (select status from public.leads where id = l1) <> 'following_up' then raise exception 'a homeowner should be a normal lead again'; end if;
    if (select auto_reply from public.contacts where account_id = acct and phone_e164 = '+12145550601') <> 'engine' then raise exception 'homeowners should be answered again'; end if;
    r := array_append(r, 'PASS: changing it back to homeowner makes it a normal lead again');

    caught := false;
    begin
      set local role authenticated;
      perform public.owner_set_lead_type(olead, 'supplier');
    exception when others then
      if sqlerrm = 'lead_not_found' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'an owner could change another client''s lead'; end if;
    r := array_append(r, 'PASS: an owner cannot touch another client''s leads');

    caught := false;
    begin
      set local role authenticated;
      perform public.owner_set_contact('12345', 'supplier');
    exception when others then
      if sqlerrm = 'bad_phone' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'a bad phone number was accepted'; end if;
    r := array_append(r, 'PASS: bad phone numbers are refused');

    set local role authenticated;
    res := public.owner_import_contacts('[{"phone":"+12145550611","name":"Dana Ruiz","last_job":"2024 reroof"},{"phone":"+12145550612"},{"phone":"nope"}]'::jsonb, 'past_client');
    reset role;
    if (res ->> 'new')::int <> 2 or (res ->> 'skipped')::int <> 1 then raise exception 'import counts are wrong: %', res; end if;
    r := array_append(r, 'PASS: an owner can import a customer list');

    caught := false;
    begin
      set local role authenticated;
      perform public.owner_import_contacts((select jsonb_agg(jsonb_build_object('phone', '+1214555' || lpad(g::text, 4, '0'))) from generate_series(1, 2001) g), 'past_client');
    exception when others then
      if sqlerrm = 'too_many_rows' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'an oversized import was accepted'; end if;
    r := array_append(r, 'PASS: an import of more than 2,000 rows is refused');

    set local role authenticated;
    perform public.owner_set_book_existing(true);
    reset role;
    if not (select book_existing_customers from public.account_engine_settings where account_id = acct) then raise exception 'the setting was not saved'; end if;
    set local role authenticated;
    perform public.owner_set_book_existing(false);
    reset role;
    if (select book_existing_customers from public.account_engine_settings where account_id = acct) then raise exception 'the setting was not cleared'; end if;
    r := array_append(r, 'PASS: an owner can switch "book existing customers" on and off');

    raise exception 'ROLLBACK_TESTS';
  exception when others then
    reset role;
    if sqlerrm <> 'ROLLBACK_TESTS' then
      r := array_append(r, 'FAIL: ' || sqlerrm);
    end if;
  end;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_owner_actions();
-- expected: 7 lines, all PASS


-- ---------------------------------------------------------------- Block 2: what an admin can do (the kill switch)
create or replace function pg_temp.engine_check_admin_actions()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  adm uuid;
  owner_uid uuid;
  res jsonb;
  caught boolean;
begin
  begin
    select user_id into adm from public.admins limit 1;
    if adm is null then raise exception 'there is no admin user to test with'; end if;
    select id into owner_uid from public.profiles where account_id = acct limit 1;

    -- signed in, but without the authenticator code
    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal1')::text, true);
    perform set_config('request.jwt.claim.sub', adm::text, true);
    caught := false;
    begin
      set local role authenticated;
      perform public.admin_engine_status(acct);
    exception when others then
      if sqlerrm = 'mfa_required' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'an admin without the authenticator code could read engine status'; end if;
    r := array_append(r, 'PASS: admin engine controls need the authenticator code');

    perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated', 'aal', 'aal2')::text, true);
    set local role authenticated;
    res := public.admin_engine_status(acct);
    reset role;
    if not (res ? 'engine_enabled' and res ? 'phone_number' and res ? 'twilio_ready' and res ? 'failed_events') then raise exception 'status is missing fields: %', res; end if;
    r := array_append(r, 'PASS: an admin can read the engine status');

    caught := false;
    begin
      set local role authenticated;
      perform public.admin_set_engine_enabled(acct, true);
    exception when others then
      if sqlerrm = 'not_ready' then caught := true; end if;
    end;
    reset role;
    if not caught then raise exception 'the engine could be turned on with no texting number set up'; end if;
    r := array_append(r, 'PASS: the engine cannot be turned on until the number, registration and forwarding are ready');

    update public.account_engine_settings set engine_enabled = true where account_id = acct;
    set local role authenticated;
    res := public.admin_set_engine_enabled(acct, false);
    reset role;
    if (res ->> 'engine_enabled')::boolean then raise exception 'the kill switch did not turn the engine off'; end if;
    if (select engine_enabled from public.account_engine_settings where account_id = acct) then raise exception 'the setting was not saved'; end if;
    r := array_append(r, 'PASS: the kill switch always works');

    if owner_uid is not null then
      perform set_config('request.jwt.claims', json_build_object('sub', owner_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
      perform set_config('request.jwt.claim.sub', owner_uid::text, true);
      caught := false;
      begin
        set local role authenticated;
        perform public.admin_set_engine_enabled(acct, false);
      exception when others then
        if sqlerrm = 'forbidden' then caught := true; end if;
      end;
      reset role;
      if not caught then raise exception 'a client could use the admin kill switch'; end if;
      r := array_append(r, 'PASS: a client cannot use the admin controls');
    end if;

    raise exception 'ROLLBACK_TESTS';
  exception when others then
    reset role;
    if sqlerrm <> 'ROLLBACK_TESTS' then
      r := array_append(r, 'FAIL: ' || sqlerrm);
    end if;
  end;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_admin_actions();
-- expected: 5 lines, all PASS


-- ---------------------------------------------------------------- Block 3: the public key can call none of it
create or replace function pg_temp.engine_check_dashboard_permissions()
returns setof text
language plpgsql
as $$
declare
  r text[] := '{}';
begin
  begin
    set local role anon;
    perform public.owner_set_contact('+12145550101', 'supplier');
    r := array_append(r, 'FAIL: the public key can call owner_set_contact');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: the public key cannot change contacts');
  end;
  reset role;

  begin
    set local role anon;
    perform public.admin_engine_status('a1111111-1111-4111-8111-111111111111');
    r := array_append(r, 'FAIL: the public key can read engine status');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: the public key cannot read engine status');
  end;
  reset role;

  begin
    set local role anon;
    perform public.admin_set_engine_enabled('a1111111-1111-4111-8111-111111111111', false);
    r := array_append(r, 'FAIL: the public key can use the kill switch');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: the public key cannot use the kill switch');
  end;
  reset role;

  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_dashboard_permissions();
-- expected: 3 lines, all PASS


-- ---------------------------------------------------------------- Block 4: confirm your registration status name (one quick look)
select conname, pg_get_constraintdef(oid) as rule
from pg_constraint
where conrelid = 'public.accounts'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%registration_status%';
-- Paste this result to the assistant. It shows which word means "approved" so the texting gate matches it exactly.
