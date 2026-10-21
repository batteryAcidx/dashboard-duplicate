-- ============================================================================
-- Checks for 005. Run each block on its own, in the DASHBOARD project, clearing the editor each time.
-- Every result line should start with PASS. Nothing is saved: each test undoes its own changes.
-- ============================================================================

-- ---------------------------------------------------------------- Block 1: the new structure exists
select tablename, rowsecurity
from pg_tables
where schemaname = 'public' and tablename in ('contacts', 'calendar_connections', 'calendar_busy', 'calendar_outbox')
order by tablename;
-- expected: 4 rows, rowsecurity = true on all

select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'leads' and column_name = 'contact_type')
    or (table_name = 'appointments' and column_name in ('source', 'external_provider', 'external_id', 'external_etag', 'sync_status', 'synced_at')))
order by table_name, column_name;
-- expected: 7 rows


-- ---------------------------------------------------------------- Block 2: contacts, imports and the owner's word
create or replace function pg_temp.engine_check_contacts()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  res jsonb;
  c jsonb;
  l1 uuid;
  l2 uuid;
  l2b uuid;
  l3 uuid;
begin
  begin
    res := public.engine_import_contacts(acct,
      '[{"phone":"+12145550201","name":"Dana Ruiz","address":"9 Elm Dr Plano","last_job":"2024 full reroof"},{"phone":"not-a-phone"}]'::jsonb,
      'past_client');
    if (res ->> 'new')::int <> 1 or (res ->> 'skipped')::int <> 1 then raise exception 'import counts are wrong: %', res; end if;
    res := public.engine_import_contacts(acct, '[{"phone":"+12145550202","name":"Beacon Supply"}]'::jsonb, 'supplier');
    if (res ->> 'new')::int <> 1 then raise exception 'supplier import failed: %', res; end if;
    r := array_append(r, 'PASS: a customer list imports, and bad numbers are skipped');

    c := public.engine_lookup_contact(acct, '+12145550201');
    if c ->> 'type' <> 'past_client' or c ->> 'auto_reply' <> 'engine' or c ->> 'name' <> 'Dana Ruiz' then raise exception 'past client lookup wrong: %', c; end if;
    c := public.engine_lookup_contact(acct, '+12145550202');
    if c ->> 'auto_reply' <> 'owner_only' then raise exception 'suppliers should default to owner_only: %', c; end if;
    if public.engine_lookup_contact(acct, '+12145550999') <> 'null'::jsonb then raise exception 'unknown number should be null'; end if;
    r := array_append(r, 'PASS: lookup returns the type, and suppliers default to owner-only');

    l1 := public.engine_get_or_create_lead(acct, '+12145550201', now());
    if (select contact_type from public.leads where id = l1) <> 'past_client' then raise exception 'lead did not get the contact type'; end if;
    if (select name from public.leads where id = l1) <> 'Dana Ruiz' or (select address from public.leads where id = l1) <> '9 Elm Dr Plano' then
      raise exception 'lead was not pre-filled';
    end if;
    if (select status from public.leads where id = l1) <> 'following_up' then raise exception 'a past client should be a normal lead'; end if;
    r := array_append(r, 'PASS: a past client''s lead is pre-filled with name and address');

    l2 := public.engine_get_or_create_lead(acct, '+12145550202', now());
    l2b := public.engine_get_or_create_lead(acct, '+12145550202', now());
    if (select status from public.leads where id = l2) <> 'not_a_lead' then raise exception 'a supplier must not count as a lead'; end if;
    if l2 <> l2b then raise exception 'repeat calls from a supplier created extra leads'; end if;
    r := array_append(r, 'PASS: suppliers are filed as not-a-lead, once');

    res := public.engine_set_contact(acct, '+12145550201', 'supplier', null, null, 'engine');
    if (res ->> 'kept')::boolean is not true then raise exception 'the engine overrode the owner''s classification'; end if;
    if (public.engine_lookup_contact(acct, '+12145550201') ->> 'type') <> 'past_client' then raise exception 'type changed'; end if;
    r := array_append(r, 'PASS: the engine cannot override an owner or import classification');

    l3 := public.engine_get_or_create_lead(acct, '+12145550203', now());
    res := public.engine_set_contact(acct, '+12145550203', 'supplier', 'ABC Supply', null, 'engine');
    if (res ->> 'kept')::boolean then raise exception 'a new suggestion should be saved'; end if;
    if (select contact_type from public.leads where id = l3) <> 'supplier' then raise exception 'lead type not updated by the suggestion'; end if;
    if not (select needs_review from public.contacts where account_id = acct and phone_e164 = '+12145550203') then raise exception 'engine suggestion should need review'; end if;
    if not exists (select 1 from public.lead_events where lead_id = l3 and event_type = 'contact_classified') then raise exception 'no event logged'; end if;
    r := array_append(r, 'PASS: an engine suggestion is saved, flagged for review and logged');

    res := public.engine_set_contact(acct, '+12145550203', 'homeowner', null, null, 'owner');
    if (select needs_review from public.contacts where account_id = acct and phone_e164 = '+12145550203') then raise exception 'owner confirmation should clear review'; end if;
    if (select auto_reply from public.contacts where account_id = acct and phone_e164 = '+12145550203') <> 'engine' then raise exception 'homeowner should be answered again'; end if;
    r := array_append(r, 'PASS: the owner can correct it, and the number is answered again');

    c := public.engine_returning_caller(acct, '+12145550201');
    if c ->> 'contact_type' <> 'past_client' or c ->> 'last_job' <> '2024 full reroof' then raise exception 'memory missing contact details: %', c; end if;
    r := array_append(r, 'PASS: returning-caller memory includes what the owner told us');

    raise exception 'ROLLBACK_TESTS';
  exception when others then
    if sqlerrm <> 'ROLLBACK_TESTS' then
      r := array_append(r, 'FAIL: ' || sqlerrm);
    end if;
  end;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_contacts();
-- expected: 8 lines, all PASS


-- ---------------------------------------------------------------- Block 3: the calendar plumbing
create or replace function pg_temp.engine_check_calendar()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  s1 timestamptz;
  s2 timestamptz;
  s3 timestamptz;
  s4 timestamptz;
  lead1 uuid;
  lead2 uuid;
  appt1 uuid;
  appt2 uuid;
  ob uuid;
  n integer;
begin
  begin
    select slot_start into s1 from public.engine_available_slots(acct, now(), 10, 1);
    if s1 is null then raise exception 'no slots to test with'; end if;

    -- a busy block on the owner's calendar removes that slot
    perform public.engine_replace_busy(acct, now(), now() + interval '10 days',
      jsonb_build_array(jsonb_build_object('id', 'evt-1', 'starts_at', s1, 'ends_at', s1 + interval '1 hour')));
    select slot_start into s2 from public.engine_available_slots(acct, now(), 10, 1);
    if s2 = s1 then raise exception 'a busy calendar time was still offered'; end if;
    r := array_append(r, 'PASS: busy calendar times are never offered');

    perform public.engine_replace_busy(acct, now(), now() + interval '10 days', '[]'::jsonb);
    select slot_start into s3 from public.engine_available_slots(acct, now(), 10, 1);
    if s3 <> s1 then raise exception 'a freed calendar time did not come back'; end if;
    if (select count(*) from public.calendar_busy where account_id = acct) <> 0 then raise exception 'stale busy rows were not removed'; end if;
    r := array_append(r, 'PASS: a re-sync clears removed events');

    -- no calendar connected: nothing is queued
    lead1 := public.engine_get_or_create_lead(acct, '+12145550211', now());
    appt1 := public.engine_book_inspection(acct, lead1, s1, '1 Test St');
    if (select count(*) from public.calendar_outbox where appointment_id = appt1) <> 0 then raise exception 'queued without a calendar'; end if;
    if (select sync_status from public.appointments where id = appt1) <> 'not_synced' then raise exception 'sync_status should be not_synced'; end if;
    r := array_append(r, 'PASS: with no calendar connected, nothing is queued');

    -- calendar connected: every booking is queued
    insert into public.calendar_connections (account_id, provider, status) values (acct, 'google', 'active')
    on conflict (account_id) do update set provider = 'google', status = 'active';
    select slot_start into s4 from public.engine_available_slots(acct, now(), 10, 1);
    lead2 := public.engine_get_or_create_lead(acct, '+12145550212', now());
    appt2 := public.engine_book_inspection(acct, lead2, s4, '2 Test St');
    if (select count(*) from public.calendar_outbox where appointment_id = appt2 and action = 'create' and status = 'pending') <> 1 then
      raise exception 'booking was not queued for the calendar';
    end if;
    if (select sync_status from public.appointments where id = appt2) <> 'pending' then raise exception 'sync_status should be pending'; end if;
    r := array_append(r, 'PASS: with a calendar connected, a booking is queued once');

    -- a worker claims it and reports success
    select count(*) into n from public.engine_claim_calendar_outbox(5);
    if n <> 1 then raise exception 'claimed % rows, expected 1', n; end if;
    select id into ob from public.calendar_outbox where appointment_id = appt2 and action = 'create';
    perform public.engine_finish_calendar_outbox(ob, true, null, 'gcal-123', 'etag-1');
    if (select sync_status from public.appointments where id = appt2) <> 'synced' then raise exception 'appointment not marked synced'; end if;
    if (select external_id from public.appointments where id = appt2) <> 'gcal-123' then raise exception 'external id not saved'; end if;
    if (select external_provider from public.appointments where id = appt2) <> 'google' then raise exception 'provider not saved'; end if;
    r := array_append(r, 'PASS: a sync worker can claim and complete a calendar write');

    -- cancelling queues a delete, and a failed write retries later
    update public.appointments set status = 'cancelled' where id = appt2;
    if (select count(*) from public.calendar_outbox where appointment_id = appt2 and action = 'delete' and status = 'pending') <> 1 then
      raise exception 'cancellation was not queued';
    end if;
    select count(*) into n from public.engine_claim_calendar_outbox(5);
    if n <> 1 then raise exception 'delete was not claimed'; end if;
    select id into ob from public.calendar_outbox where appointment_id = appt2 and action = 'delete';
    perform public.engine_finish_calendar_outbox(ob, false, 'boom');
    if (select status from public.calendar_outbox where id = ob) <> 'pending' then raise exception 'a failed write should retry'; end if;
    if (select run_after from public.calendar_outbox where id = ob) <= now() then raise exception 'retry should be delayed'; end if;
    r := array_append(r, 'PASS: cancellations are queued, and failures retry later');

    raise exception 'ROLLBACK_TESTS';
  exception when others then
    if sqlerrm <> 'ROLLBACK_TESTS' then
      r := array_append(r, 'FAIL: ' || sqlerrm);
    end if;
  end;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_calendar();
-- expected: 6 lines, all PASS


-- ---------------------------------------------------------------- Block 4: permissions
create or replace function pg_temp.engine_check_permissions_3()
returns setof text
language plpgsql
as $$
declare
  r text[] := '{}';
begin
  begin
    set local role anon;
    perform count(*) from public.contacts;
    r := array_append(r, 'FAIL: the public key can read contacts');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: the public key cannot read contacts');
  end;
  reset role;

  begin
    set local role authenticated;
    perform public.engine_set_contact('a1111111-1111-4111-8111-111111111111', '+12145550299', 'supplier', null, null, 'engine');
    r := array_append(r, 'FAIL: a logged-in client can call engine_set_contact');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: a logged-in client cannot call engine functions');
  end;
  reset role;

  begin
    set local role authenticated;
    perform count(*) from public.calendar_outbox;
    r := array_append(r, 'FAIL: a logged-in client can read the calendar outbox');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: a logged-in client cannot read the calendar outbox');
  end;
  reset role;

  begin
    set local role authenticated;
    perform token_secret_id from public.calendar_connections limit 1;
    r := array_append(r, 'FAIL: a logged-in client can read the calendar token reference');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: a logged-in client cannot read the calendar token reference');
  end;
  reset role;

  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_permissions_3();
-- expected: 4 lines, all PASS
