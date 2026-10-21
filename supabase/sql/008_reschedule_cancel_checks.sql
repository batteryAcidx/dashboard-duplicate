-- ============================================================================
-- Checks for 007. Run each block on its own, in the DASHBOARD project, clearing the editor each time.
-- Every result line should start with PASS. Nothing is saved: each test undoes its own changes.
-- ============================================================================

-- ---------------------------------------------------------------- Block 1: reschedule and cancel
create or replace function pg_temp.engine_check_reschedule_cancel()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  s1 timestamptz;
  s2 timestamptz;
  s3 timestamptz;
  lead1 uuid;
  lead2 uuid;
  appt uuid;
  appt2 uuid;
  appt_b uuid;
  c jsonb;
  blocked boolean := false;
begin
  begin
    lead1 := public.engine_get_or_create_lead(acct, '+12145550301', now());
    lead2 := public.engine_get_or_create_lead(acct, '+12145550302', now());

    c := public.engine_current_appointment(acct, lead1);
    if c <> 'null'::jsonb then raise exception 'a new lead should have no appointment'; end if;

    select slot_start into s1 from public.engine_available_slots(acct, now(), 10, 1);
    appt := public.engine_book_inspection(acct, lead1, s1, '1 Test St');
    c := public.engine_current_appointment(acct, lead1);
    if (c ->> 'id')::uuid <> appt or c ->> 'status' <> 'scheduled' then raise exception 'current appointment is wrong: %', c; end if;
    r := array_append(r, 'PASS: the current appointment can be looked up');

    select slot_start into s2 from public.engine_available_slots(acct, now(), 10, 1);
    if s2 = s1 then raise exception 'the booked slot is still offered'; end if;

    appt2 := public.engine_reschedule_appointment(acct, lead1, s2);
    if appt2 <> appt then raise exception 'a reschedule created a different appointment row'; end if;
    if (select count(*) from public.appointments where lead_id = lead1) <> 1 then raise exception 'there should be exactly one appointment'; end if;
    if (select starts_at from public.appointments where id = appt) <> s2 then raise exception 'the time did not change'; end if;
    if (select status from public.appointments where id = appt) <> 'rescheduled' then raise exception 'status should be rescheduled'; end if;
    if not exists (select 1 from public.lead_events where lead_id = lead1 and event_type = 'rescheduled') then raise exception 'no rescheduled event'; end if;
    if (select status from public.leads where id = lead1) <> 'booked' then raise exception 'lead should stay booked'; end if;
    r := array_append(r, 'PASS: a reschedule updates the same row, so it can never count twice');

    select slot_start into s3 from public.engine_available_slots(acct, now(), 10, 1);
    if s3 <> s1 then raise exception 'the old time was not freed'; end if;
    r := array_append(r, 'PASS: the old time is open again');

    appt_b := public.engine_reschedule_appointment(acct, lead1, s2);
    if appt_b <> appt then raise exception 'repeating a reschedule should return the same appointment'; end if;
    r := array_append(r, 'PASS: repeating a reschedule is harmless');

    perform public.engine_book_inspection(acct, lead2, s1, '2 Test St');
    begin
      perform public.engine_reschedule_appointment(acct, lead1, s1);
    exception when others then
      if sqlerrm = 'slot_unavailable' then blocked := true; end if;
    end;
    if not blocked then raise exception 'a taken time could be rescheduled into'; end if;
    r := array_append(r, 'PASS: you cannot reschedule into a taken time');

    if not public.engine_cancel_appointment(acct, lead1, 'test') then raise exception 'cancel returned false'; end if;
    if (select status from public.appointments where id = appt) <> 'cancelled' then raise exception 'appointment not cancelled'; end if;
    if (select status from public.leads where id = lead1) <> 'lost' then raise exception 'lead should be lost'; end if;
    if (select stage from public.lead_state where lead_id = lead1) <> 'closed' then raise exception 'stage should be closed'; end if;
    if public.engine_cancel_appointment(acct, lead1) then raise exception 'a second cancel should return false'; end if;
    if not exists (select 1 from public.engine_available_slots(acct, now(), 10, 50) s where s.slot_start = s2) then raise exception 'cancelled time was not freed'; end if;
    r := array_append(r, 'PASS: cancel closes the lead, frees the time, and is safe to repeat');

    blocked := false;
    begin
      perform public.engine_reschedule_appointment(acct, lead1, s2);
    exception when others then
      if sqlerrm = 'no_appointment' then blocked := true; end if;
    end;
    if not blocked then raise exception 'rescheduling a cancelled lead should fail'; end if;
    r := array_append(r, 'PASS: nothing to reschedule after a cancel');

    raise exception 'ROLLBACK_TESTS';
  exception when others then
    if sqlerrm <> 'ROLLBACK_TESTS' then
      r := array_append(r, 'FAIL: ' || sqlerrm);
    end if;
  end;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_reschedule_cancel();
-- expected: 7 lines, all PASS


-- ---------------------------------------------------------------- Block 2: the calendar hears about changes
create or replace function pg_temp.engine_check_reschedule_calendar()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
  s1 timestamptz;
  s2 timestamptz;
  lead1 uuid;
  appt uuid;
  n integer;
begin
  begin
    insert into public.calendar_connections (account_id, provider, status) values (acct, 'google', 'active')
    on conflict (account_id) do update set provider = 'google', status = 'active';

    lead1 := public.engine_get_or_create_lead(acct, '+12145550311', now());
    select slot_start into s1 from public.engine_available_slots(acct, now(), 10, 1);
    appt := public.engine_book_inspection(acct, lead1, s1, '1 Test St');
    select count(*) into n from public.engine_claim_calendar_outbox(5);
    perform public.engine_finish_calendar_outbox((select id from public.calendar_outbox where appointment_id = appt and action = 'create'), true, null, 'gcal-9');

    select slot_start into s2 from public.engine_available_slots(acct, now(), 10, 1);
    perform public.engine_reschedule_appointment(acct, lead1, s2);
    if (select count(*) from public.calendar_outbox where appointment_id = appt and action = 'update' and status = 'pending') <> 1 then
      raise exception 'the reschedule was not queued for the calendar';
    end if;
    r := array_append(r, 'PASS: a reschedule is queued as a calendar update');

    perform public.engine_cancel_appointment(acct, lead1);
    if (select count(*) from public.calendar_outbox where appointment_id = appt and action = 'delete' and status = 'pending') <> 1 then
      raise exception 'the cancellation was not queued for the calendar';
    end if;
    r := array_append(r, 'PASS: a cancellation is queued as a calendar delete');

    raise exception 'ROLLBACK_TESTS';
  exception when others then
    if sqlerrm <> 'ROLLBACK_TESTS' then
      r := array_append(r, 'FAIL: ' || sqlerrm);
    end if;
  end;
  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_reschedule_calendar();
-- expected: 2 lines, all PASS


-- ---------------------------------------------------------------- Block 3: alert kinds and permissions
create or replace function pg_temp.engine_check_alerts_permissions()
returns setof text
language plpgsql
as $$
declare
  acct uuid := 'a1111111-1111-4111-8111-111111111111';
  r text[] := '{}';
begin
  begin
    insert into public.owner_alerts (account_id, kind, body) values (acct, 'heads_up', 'Missed call from a supplier.');
    insert into public.owner_alerts (account_id, kind, body) values (acct, 'rescheduled', 'Moved.');
    insert into public.owner_alerts (account_id, kind, body) values (acct, 'cancelled', 'Cancelled.');
    r := array_append(r, 'PASS: heads_up, rescheduled and cancelled are valid alert kinds');
    begin
      insert into public.owner_alerts (account_id, kind, body) values (acct, 'bogus', 'x');
      r := array_append(r, 'FAIL: an invalid alert kind was accepted');
    exception when check_violation then
      r := array_append(r, 'PASS: invalid alert kinds are refused');
    end;
    raise exception 'ROLLBACK_TESTS';
  exception when others then
    if sqlerrm <> 'ROLLBACK_TESTS' then
      r := array_append(r, 'FAIL: ' || sqlerrm);
    end if;
  end;

  begin
    set local role anon;
    perform public.engine_cancel_appointment(acct, gen_random_uuid());
    r := array_append(r, 'FAIL: the public key can cancel appointments');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: the public key cannot cancel appointments');
  end;
  reset role;

  begin
    set local role authenticated;
    perform public.engine_reschedule_appointment(acct, gen_random_uuid(), now() + interval '2 days');
    r := array_append(r, 'FAIL: a logged-in client can call engine_reschedule_appointment');
  exception when insufficient_privilege then
    r := array_append(r, 'PASS: a logged-in client cannot call the reschedule engine function');
  end;
  reset role;

  return query select unnest(r);
end;
$$;

select * from pg_temp.engine_check_alerts_permissions();
-- expected: 4 lines, all PASS
